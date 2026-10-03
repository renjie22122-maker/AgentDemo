import { extract } from './documents.js';
process.once('message', async (path: string) => {
  try {
    const text = await extract(path, { ocr: true });
    if (text.length > 5_000_000)
      throw Error('Extracted text exceeds 5 million characters; split the source.');
    process.send?.({ text }, () => process.exit(0));
  } catch (e: any) {
    process.send?.({ error: String(e.message || e).slice(0, 500) }, () => process.exit(1));
  }
});
