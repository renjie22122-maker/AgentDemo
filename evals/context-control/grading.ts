const OPTIONS = new Set(['continue', 'wait', 'change_strategy', 'verify']);
export function actionAnswer(text: string): string | null {
  const raw = text.trim();
  if (OPTIONS.has(raw)) return raw;
  try {
    const object = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
    if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
    const values = ['action', 'decision', 'option', 'choice']
      .filter((k) => k in object)
      .map((k) => object[k]);
    if (!values.length || values.some((v) => typeof v !== 'string' || !OPTIONS.has(v))) return null;
    return new Set(values).size === 1 ? values[0] : null;
  } catch {
    return null;
  }
}
