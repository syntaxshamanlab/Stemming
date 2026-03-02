import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);

/**
 * Upload a stem WAV blob to Firebase Storage.
 * Returns the public download URL.
 */
export async function uploadStemToStorage(blob, jobId, stemName) {
  const path = `stems/${jobId}/${stemName}.wav`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "audio/wav" });
  return await getDownloadURL(storageRef);
}
