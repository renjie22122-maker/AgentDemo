export type PreviewResult = { title: string; text: string };
export function parsePreviewResult(value: unknown): PreviewResult | null {
  try {
    if (typeof value === 'string')
      return value.trim() && value.length <= 16000 ? { title: '', text: value } : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (v.title !== undefined && (typeof v.title !== 'string' || v.title.length > 100)) return null;
    const text =
      typeof v.text === 'string'
        ? v.text
        : v.data !== undefined
          ? JSON.stringify(v.data, null, 2)
          : '';
    return text && text.trim() && text.length <= 16000
      ? { title: String(v.title || ''), text }
      : null;
  } catch {
    return null;
  }
}
