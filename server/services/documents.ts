import { ocrImage } from './ocr.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
export async function extract(path: string, options: { ocr?: boolean } = {}): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext))
    return options.ocr
      ? ocrImage(path)
      : '[Image attachment. Use a vision-capable model; no OCR was performed.]';
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    return (await mammoth.extractRawText({ path })).value;
  }
  if (ext === '.xlsx') {
    const { default: Excel } = await import('exceljs');
    const book = new Excel.Workbook();
    await book.xlsx.readFile(path);
    const text: string[] = [];
    book.eachSheet((sheet) => {
      text.push('# ' + sheet.name);
      sheet.eachRow((row) => text.push(JSON.stringify(row.values)));
    });
    return text.join('\n');
  }
  if (ext === '.pdf') {
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdf.getDocument({
      data: new Uint8Array(await readFile(path)),
      useSystemFonts: true,
    }).promise;
    try {
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 500); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let text = content.items.map((x) => ('str' in x ? x.str : '')).join(' ');
        if (options.ocr && text.trim().length < 12) {
          if (i > 50) throw Error('Scanned PDF OCR supports up to 50 pages; split this document.');
          const require = createRequire(import.meta.url);
          const canvasModule = createRequire(require.resolve('pdfjs-dist/package.json'))(
            '@napi-rs/canvas',
          );
          const viewport = page.getViewport({ scale: 1.5 });
          if (viewport.width * viewport.height > 16000000)
            throw Error('PDF page exceeds OCR pixel limit');
          const canvas = canvasModule.createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas } as any)
            .promise;
          const dir = await mkdtemp(join(tmpdir(), 'agentdemo-ocr-'));
          try {
            const image = join(dir, 'page.png');
            await writeFile(image, canvas.toBuffer('image/png'));
            text = await ocrImage(image);
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        }
        pages.push('[Page ' + i + ']\n' + text);
      }
      return pages.join('\n\n');
    } finally {
      await doc.destroy();
    }
  }
  if (
    ![
      '.txt',
      '.md',
      '.csv',
      '.json',
      '.jsonl',
      '.ts',
      '.tsx',
      '.js',
      '.py',
      '.java',
      '.html',
      '.css',
      '.xml',
      '.yaml',
      '.yml',
      '.log',
      '.sql',
      '.rs',
      '.go',
      '.c',
      '.cpp',
      '.h',
      '.toml',
    ].includes(ext)
  )
    throw new Error('Unsupported document format: ' + ext);
  return readFile(path, 'utf8');
}
