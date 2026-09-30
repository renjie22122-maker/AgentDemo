import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
export async function extract(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext))
    return '[Image attachment. Use a vision-capable model; no OCR was performed.]';
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
        pages.push(
          '[Page ' + i + ']\n' + content.items.map((x) => ('str' in x ? x.str : '')).join(' '),
        );
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
