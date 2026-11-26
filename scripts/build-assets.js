import { copyFile, mkdir } from 'node:fs/promises';

const target = new URL('../public/vendor/', import.meta.url);
const source = new URL('.', import.meta.resolve('unpdf/pdfjs'));
await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(new URL('pdfjs.mjs', source), new URL('pdfjs.mjs', target)),
  copyFile(new URL('licenses/LICENSE_PDFJS', source), new URL('LICENSE_PDFJS.txt', target))
]);
