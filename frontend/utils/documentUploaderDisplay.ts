/** Legacy placeholder from DocumentFormModal mock data — hide in UI. */
const LEGACY_MOCK_UPLOADER = 'דנה כהן';

export function normalizeDocumentUploaderForDisplay(value: unknown): string {
  const name = String(value ?? '').trim();
  if (!name || name === LEGACY_MOCK_UPLOADER) return '';
  return name;
}
