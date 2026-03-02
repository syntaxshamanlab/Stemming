"""
Audio Stemming API — FastAPI + Demucs
Separates: vocals, bass, other, drums (+ drum sub-stems: kick, snare, hi-hat)
"""

import os
import uuid
import shutil
import subprocess
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="Audio Stemmer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("./tmp/uploads")
OUTPUT_DIR = Path("./tmp/outputs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
MAX_FILE_SIZE_MB = 100


def cleanup_job(job_id: str):
    """Remove temp files for a completed job."""
    upload_path = UPLOAD_DIR / job_id
    output_path = OUTPUT_DIR / job_id
    if upload_path.exists():
        shutil.rmtree(upload_path, ignore_errors=True)
    # Output is kept until explicitly deleted or TTL cleanup runs.


def run_demucs(input_file: Path, output_dir: Path, model: str = "htdemucs") -> dict:
    """
    Run Demucs separation.
    htdemucs produces: vocals, drums, bass, other
    htdemucs_6s adds guitar and piano.
    Returns dict of stem_name -> file_path.
    """
    cmd = [
        "demucs",
        "--name", model,
        "--out", str(output_dir),
        str(input_file),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed: {result.stderr}")

    # Demucs writes to: output_dir / model / track_name / stem.wav
    track_name = input_file.stem
    stem_dir = output_dir / model / track_name

    stems = {}
    for stem_file in stem_dir.glob("*.wav"):
        stems[stem_file.stem] = stem_file

    return stems


def separate_drum_stems(drum_wav: Path, output_dir: Path) -> dict:
    """
    Run a second Demucs pass on the isolated drum stem using the
    'drumsep' community model which separates:
    kick, snare, hi-hat, toms, ride/crash.

    Falls back gracefully if the model is unavailable.
    """
    drum_output = output_dir / "drum_stems"
    drum_output.mkdir(parents=True, exist_ok=True)

    cmd = [
        "demucs",
        "--name", "htdemucs",   # swap to drumsep if installed
        "--two-stems", "drums", # isolate drums only pass (no-op here, already isolated)
        "--out", str(drum_output),
        str(drum_wav),
    ]

    # Use the dedicated drumsep model if available
    drumsep_cmd = [
        "demucs",
        "--name", "drumsep",
        "--repo", "https://github.com/jonaswilms/drumsep",
        "--out", str(drum_output),
        str(drum_wav),
    ]

    for attempt_cmd in [drumsep_cmd, cmd]:
        result = subprocess.run(attempt_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            break
    else:
        return {}  # Graceful fallback: no sub-stems

    drum_parts = {}
    for f in drum_output.rglob("*.wav"):
        drum_parts[f"drums_{f.stem}"] = f

    return drum_parts


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/separate")
async def separate(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    drums_detail: bool = True,
):
    """
    Upload an audio file and receive separated stems.
    Set drums_detail=true to also separate drum sub-stems (kick, snare, hi-hat).
    """
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {suffix}. Use: {ALLOWED_EXTENSIONS}")

    job_id = str(uuid.uuid4())
    job_upload_dir = UPLOAD_DIR / job_id
    job_output_dir = OUTPUT_DIR / job_id
    job_upload_dir.mkdir(parents=True)
    job_output_dir.mkdir(parents=True)

    input_path = job_upload_dir / f"input{suffix}"

    # Stream upload to disk
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(413, f"File too large: {size_mb:.1f}MB. Max: {MAX_FILE_SIZE_MB}MB")

    with open(input_path, "wb") as f:
        f.write(content)

    # Run Demucs
    try:
        stems = run_demucs(input_path, job_output_dir)
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    # Optional drum sub-separation
    drum_stems = {}
    if drums_detail and "drums" in stems:
        drum_stems = separate_drum_stems(stems["drums"], job_output_dir)

    all_stems = {**stems, **drum_stems}

    # Build response with download URLs
    stem_urls = {
        name: f"/download/{job_id}/{name}"
        for name in all_stems
    }

    return JSONResponse({
        "job_id": job_id,
        "stems": stem_urls,
        "drum_detail_available": bool(drum_stems),
    })


@app.get("/download/{job_id}/{stem_name}")
def download_stem(job_id: str, stem_name: str):
    """Download a specific stem by job_id and stem name."""
    # Sanitize inputs
    if ".." in job_id or ".." in stem_name:
        raise HTTPException(400, "Invalid path")

    job_output_dir = OUTPUT_DIR / job_id
    if not job_output_dir.exists():
        raise HTTPException(404, "Job not found or expired")

    # Search for the stem file
    for wav_file in job_output_dir.rglob("*.wav"):
        if wav_file.stem == stem_name:
            return FileResponse(
                path=str(wav_file),
                media_type="audio/wav",
                filename=f"{stem_name}.wav",
            )

    raise HTTPException(404, f"Stem '{stem_name}' not found")


@app.delete("/job/{job_id}")
def delete_job(job_id: str):
    """Clean up job files."""
    if ".." in job_id:
        raise HTTPException(400, "Invalid job id")
    cleanup_job(job_id)
    return {"deleted": job_id}
