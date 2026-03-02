import { useState, useRef } from "react";
import { separateStems, fetchStemBlob, deleteJob } from "../api.js";
import { uploadStemToStorage } from "../firebase.js";
import StemPlayer from "./StemPlayer.jsx";
import "./styles.css";

const STEM_LABELS = {
  vocals: "Vocals",
  bass: "Bass",
  drums: "Full Drums",
  other: "Other / Melody",
  drums_kick: "Kick",
  drums_snare: "Snare",
  drums_hihat: "Hi-Hat",
  drums_toms: "Toms",
  drums_ride: "Ride / Crash",
};

const STEM_GROUPS = {
  "Main Stems": ["vocals", "bass", "other"],
  "Drums": ["drums"],
  "Drum Detail": ["drums_kick", "drums_snare", "drums_hihat", "drums_toms", "drums_ride"],
};

export default function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | processing | done | error
  const [progress, setProgress] = useState("");
  const [stems, setStems] = useState({});   // stemName -> object URL
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");
  const [drumsDetail, setDrumsDetail] = useState(true);
  const [uploadToFirebase, setUploadToFirebase] = useState(false);
  const fileInputRef = useRef();

  function handleFileChange(e) {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setStatus("idle");
      setStems({});
      setError("");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setStatus("idle");
      setStems({});
      setError("");
    }
  }

  async function handleSeparate() {
    if (!file) return;
    setStatus("uploading");
    setProgress("Uploading audio...");
    setError("");
    setStems({});

    try {
      setStatus("processing");
      setProgress("Running Demucs separation — this may take a minute...");
      const result = await separateStems(file, drumsDetail);
      setJobId(result.job_id);

      setProgress("Fetching stems...");
      const stemBlobs = {};
      const stemObjectURLs = {};

      for (const [name, _url] of Object.entries(result.stems)) {
        const blob = await fetchStemBlob(result.job_id, name);
        stemBlobs[name] = blob;
        stemObjectURLs[name] = URL.createObjectURL(blob);
        setProgress(`Loaded: ${STEM_LABELS[name] || name}`);
      }

      if (uploadToFirebase) {
        setProgress("Uploading stems to Firebase Storage...");
        for (const [name, blob] of Object.entries(stemBlobs)) {
          await uploadStemToStorage(blob, result.job_id, name);
        }
      }

      setStems(stemObjectURLs);
      setStatus("done");
      setProgress("");
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  async function handleReset() {
    if (jobId) await deleteJob(jobId).catch(() => {});
    Object.values(stems).forEach(URL.revokeObjectURL);
    setFile(null);
    setStems({});
    setJobId(null);
    setStatus("idle");
    setProgress("");
    setError("");
    fileInputRef.current.value = "";
  }

  const hasStem = (name) => name in stems;
  const isProcessing = status === "uploading" || status === "processing";

  return (
    <div className="app">
      <header className="app-header">
        <h1>Audio Stem Separator</h1>
        <p className="subtitle">Powered by Demucs — Vocals · Bass · Drums · Melody · Drum Detail</p>
      </header>

      <main className="app-main">
        {/* Upload Zone */}
        <section
          className={`drop-zone ${file ? "has-file" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.m4a"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {file ? (
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
          ) : (
            <div className="drop-prompt">
              <span className="drop-icon">🎵</span>
              <p>Drop audio file here or click to browse</p>
              <span className="formats">MP3 · WAV · FLAC · OGG · M4A — max 100MB</span>
            </div>
          )}
        </section>

        {/* Options */}
        <section className="options">
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={drumsDetail}
              onChange={(e) => setDrumsDetail(e.target.checked)}
              disabled={isProcessing}
            />
            Separate drum sub-stems (kick, snare, hi-hat)
          </label>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={uploadToFirebase}
              onChange={(e) => setUploadToFirebase(e.target.checked)}
              disabled={isProcessing}
            />
            Upload stems to Firebase Storage
          </label>
        </section>

        {/* Actions */}
        <section className="actions">
          <button
            className="btn-primary"
            onClick={handleSeparate}
            disabled={!file || isProcessing}
          >
            {isProcessing ? "Processing..." : "Separate Stems"}
          </button>
          {(status === "done" || status === "error") && (
            <button className="btn-secondary" onClick={handleReset}>
              Start Over
            </button>
          )}
        </section>

        {/* Progress */}
        {isProcessing && (
          <div className="progress-bar-container">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" />
            </div>
            <p className="progress-label">{progress}</p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="error-box">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Stem Players */}
        {status === "done" && (
          <section className="stems-section">
            {Object.entries(STEM_GROUPS).map(([groupName, stemNames]) => {
              const available = stemNames.filter(hasStem);
              if (!available.length) return null;
              return (
                <div key={groupName} className="stem-group">
                  <h2 className="stem-group-title">{groupName}</h2>
                  {available.map((name) => (
                    <StemPlayer
                      key={name}
                      label={STEM_LABELS[name] || name}
                      objectUrl={stems[name]}
                      fileName={`${name}.wav`}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
