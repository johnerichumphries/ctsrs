// One-off: shrink the hippo reward PNGs in place for web use (PLAN §3.11).
// Resizes each to <=700px on the long edge and recompresses (palette PNG).
// Requires sharp (install on demand):
//   npm install --no-save --no-package-lock sharp
//   node tools/optimize_hippos.mjs
import sharp from 'sharp';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const DIR = new URL('../images/', import.meta.url);
const files = (await readdir(DIR)).filter((f) => /^hippo(happy|sad)_\d+\.png$/.test(f));

let total = 0;
for (const f of files) {
  const path = new URL(f, DIR);
  const src = await readFile(path);                 // read fully first, then overwrite
  const out = await sharp(src)
    .resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 80 })
    .toBuffer();
  await writeFile(path, out);
  total += out.length;
  console.log(`${f}: ${(src.length / 1e6).toFixed(2)}MB -> ${(out.length / 1e3).toFixed(0)}KB`);
}
console.log(`total: ${(total / 1e6).toFixed(2)}MB across ${files.length} files`);
