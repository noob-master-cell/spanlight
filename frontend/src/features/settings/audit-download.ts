/** Hands a fetched file to the browser as a download, under `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari starts reading the object URL after the click returns, so let go of it a little later.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
