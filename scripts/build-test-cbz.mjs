// 何を: docs/test-images/*.{jpg,png,gif,webp} を ZIP 化して public/test.cbz を生成
// なぜ: 仕様書 Phase 3a §11 の検証で「縦長・横長・色味・ファイルサイズ」のバリエーションを
//       実画像で確認するため。test.mkb と同じく自動生成パスに乗せる

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'docs', 'test-images');
const OUT = join(ROOT, 'public', 'test.cbz');

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

async function main() {
  let entries;
  try {
    entries = await readdir(SRC);
  } catch {
    console.warn('[build-test-cbz] docs/test-images/ が無いためスキップ');
    return;
  }
  const files = entries.filter((f) => IMG_RE.test(f)).sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
  if (files.length === 0) {
    console.warn('[build-test-cbz] 画像ファイルが見つからないためスキップ');
    return;
  }

  const zip = new JSZip();
  for (let i = 0; i < files.length; i++) {
    const buf = await readFile(join(SRC, files[i]));
    // 自然順を保証する命名（01_, 02_ ...）で ZIP 内に格納
    const idx = String(i + 1).padStart(2, '0');
    zip.file(`${idx}_${files[i]}`, buf);
  }
  // 何を: PNG/JPEG はすでに圧縮済みなので STORE で再圧縮を避ける
  // なぜ: DEFLATE をかけても容量はほぼ変わらず、CPU/メモリ消費だけ増える
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'STORE',
  });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, buf);
  console.log(`[build-test-cbz] wrote ${OUT} (${buf.length.toLocaleString()} bytes, ${files.length} images)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
