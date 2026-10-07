export function shouldAttachPaste(text: string) {
  return text.length >= 8000 || text.split(/\r?\n/).length >= 100;
}
export function hasMarkdown(text: string) {
  return /(?:^|\n)\s*(?:#{1,6} |[-*] |>[ ]|```)|\*\*[^*]+\*\*|\$[^$\n]+\$|\\[([]/.test(text);
}
export function insertPaste(draft: string, text: string, start: number, end: number) {
  return draft.slice(0, start) + text + draft.slice(end);
}
