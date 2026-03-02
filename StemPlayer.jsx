import { useState, useRef, useEffect } from "react";

export default function StemPlayer({ label, objectUrl, fileName }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    audioRef.current.volume = v;
    if (v === 0) setMuted(true);
    else setMuted(false);
  }

  function toggleMute() {
    const audio = audioRef.current;
    const next = !muted;
    setMuted(next);
    audio.muted = next;
  }

  function handleSeek(e) {
    const t = parseFloat(e.target.value);
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }

  function formatTime(s) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  return (
    <div className="stem-player">
      <audio ref={audioRef} src={objectUrl} preload="metadata" />

      <div className="stem-player-header">
        <button className="play-btn" onClick={togglePlay}>
          {playing ? "⏸" : "▶"}
        </button>
        <span className="stem-label">{label}</span>
        <a
          className="download-btn"
          href={objectUrl}
          download={fileName}
          title={`Download ${label}`}
        >
          ⬇ Download
        </a>
      </div>

      <div className="stem-player-controls">
        <span className="time-display">{formatTime(currentTime)}</span>
        <input
          className="seek-slider"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
        />
        <span className="time-display">{formatTime(duration)}</span>

        <button className="mute-btn" onClick={toggleMute} title="Toggle mute">
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          className="volume-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
        />
      </div>
    </div>
  );
}
