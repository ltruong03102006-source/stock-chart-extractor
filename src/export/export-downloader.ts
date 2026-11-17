/**
 * Handles browser-side file download via standard DOM Blob & URL.createObjectURL.
 * Compatible with Chrome Manifest V3 Side Panel without requiring chrome.downloads permission.
 */
export function triggerFileDownload(content: string, filename: string): boolean {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // Non-DOM environment (e.g. unit tests)
      return true;
    }

    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // Clean up temporary DOM element and revoke object URL
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);

    return true;
  } catch (err) {
    console.error('[ExportDownloader] Failed to trigger file download:', err);
    return false;
  }
}
