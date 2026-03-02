# Audio Stem Separator

Full-stack audio stemming application using **Demucs** (Meta's state-of-the-art source separation model).

## What It Does

- Separates any audio file into: **Vocals · Bass · Drums · Other/Melody**
- Optionally runs a second Demucs pass on the drum stem to extract: **Kick · Snare · Hi-Hat · Toms · Ride/Crash**
- Plays each stem back in the browser with seek, volume, and mute controls
- Lets you download individual stems as WAV files
- Optionally uploads all stems to **Firebase Storage**

---

## Architecture

```
audio-stemmer/
├── backend/                  # Python / FastAPI
│   ├── main.py               # API: /separate, /download, /job
│   ├── requirements.txt
│   └── start.sh              # One-command setup + launch
│
├── frontend/                 # React / Vite
│   ├── src/
│   │   ├── api.js            # Backend API client
│   │   ├── firebase.js       # Firebase Storage integration
│   │   ├── main.js           # React entry point
│   │   └── ui/
│   │       ├── App.jsx       # Main app: upload, separation flow, stem grid
│   │       ├── StemPlayer.jsx # Per-stem: play/pause, seek, volume, download
│   │       └── styles.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js        # Dev proxy → backend:8000
│
├── .idx/
│   └── dev.nix               # Firebase Studio environment
└── idx-template.json         # Firebase Studio template metadata
```

---

## Setup

### 1. Backend

Requires Python 3.11+ and ffmpeg.

```bash
cd backend
bash start.sh
```

This creates a virtualenv, installs Demucs + FastAPI, and starts the server on `http://localhost:8000`.

**First run** will download the `htdemucs` model weights (~300MB). Subsequent runs use the cache.

### 2. Frontend

Requires Node.js 20+.

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. Vite proxies all `/separate`, `/download`, and `/job` requests to the backend automatically — no CORS issues in development.

### 3. Firebase Storage (optional)

Fill in `frontend/src/firebase.js` with your Firebase project credentials, then enable the "Upload to Firebase Storage" toggle in the UI.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/separate?drums_detail=true` | Upload audio, returns job_id + stem URLs |
| `GET`  | `/download/{job_id}/{stem}` | Download a stem WAV |
| `DELETE` | `/job/{job_id}` | Delete temp files for a job |
| `GET`  | `/health` | Server health check |

### POST /separate

**Request:** `multipart/form-data` with `file` field.

**Response:**
```json
{
  "job_id": "uuid",
  "stems": {
    "vocals": "/download/uuid/vocals",
    "bass": "/download/uuid/bass",
    "drums": "/download/uuid/drums",
    "other": "/download/uuid/other",
    "drums_kick": "/download/uuid/drums_kick",
    "drums_snare": "/download/uuid/drums_snare"
  },
  "drum_detail_available": true
}
```

---

## Drum Sub-Separation

The app attempts to use the **drumsep** community model for drum sub-stems. If unavailable, it falls back gracefully — the main drum stem is still available, sub-stems simply won't appear.

To install drumsep manually:
```bash
pip install git+https://github.com/jonaswilms/drumsep
```

---

## Performance Notes

- Separation time scales with audio length and available hardware.
- On CPU: ~3–5x real-time (a 3-minute song takes ~10–15 min).
- On GPU (CUDA): ~0.3x real-time (a 3-minute song takes ~1 min).
- Demucs automatically detects and uses CUDA if available.

---

## Supported Formats

MP3 · WAV · FLAC · OGG · M4A — max 100MB per file.

---

## Limits & Production Considerations

| Concern | Current behavior | Production recommendation |
|---------|-----------------|--------------------------|
| File storage | Temp files on server disk | Move to Cloud Storage after separation |
| Job cleanup | Manual DELETE call | Add TTL-based cleanup job |
| Concurrent jobs | Unbounded | Add job queue (Celery, RQ, or Cloud Tasks) |
| Auth | None | Add Firebase Auth before exposing publicly |
| GPU | Optional | Use a GPU-enabled VM or Cloud Run GPU instance |
