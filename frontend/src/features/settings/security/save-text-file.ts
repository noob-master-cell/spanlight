/**
 * Saves text as a file in the browser: an object URL on a temporary link, revoked right after the
 * click. Nothing is sent anywhere and nothing is kept.
 */
export function saveTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the browser has started the download.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
