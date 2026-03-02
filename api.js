const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Upload audio file and trigger separation.
 * @param {File} file
 * @param {boolean} drumsDetail - whether to run drum sub-separation
 * @returns {Promise<{job_id: string, stems: Record<string, string>, drum_detail_available: boolean}>}
 */
export async function separateStems(file, drumsDetail = true) {
  const form = new FormData();
  form.append("file", file);

  const url = `${API_BASE}/separate?drums_detail=${drumsDetail}`;
  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Separation failed");
  }

  return res.json();
}

/**
 * Fetch a stem as a Blob for playback or upload.
 * @param {string} jobId
 * @param {string} stemName
 * @returns {Promise<Blob>}
 */
export async function fetchStemBlob(jobId, stemName) {
  const res = await fetch(`${API_BASE}/download/${jobId}/${stemName}`);
  if (!res.ok) throw new Error(`Failed to fetch stem: ${stemName}`);
  return res.blob();
}

/**
 * Delete a job's temp files from the server.
 */
export async function deleteJob(jobId) {
  await fetch(`${API_BASE}/job/${jobId}`, { method: "DELETE" });
}
