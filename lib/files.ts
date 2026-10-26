/** Read a File into a data URL (mock storage — use signed object storage in production). */
export function readFileAsDataURL(file: File, maxBytes = 1_500_000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) return reject(new Error(`File is too large for the demo store (max ${(maxBytes / 1_000_000).toFixed(1)} MB).`));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}
