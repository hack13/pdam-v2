/** Builds a Content-Disposition header without allowing user input into its syntax. */
export function contentDispositionForDownload(fileName: string): string {
  const safeName = fileName
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["\\]/g, '')
    .trim() || 'download';
  return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}
