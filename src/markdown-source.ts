/** Preserve code samples while normalizing common LaTeX delimiters. */
export function mathDelimiters(text: string) {
  return text.replace(
    /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`]*`)|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
    (full, code, inline, block) =>
      code ??
      (inline !== undefined
        ? '$' + inline + '$'
        : block !== undefined
          ? '\n$$\n' + block + '\n$$\n'
          : full),
  );
}
