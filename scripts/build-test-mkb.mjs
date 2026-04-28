// 何を: docs/test-mkb/ をZIP化して public/test.mkb を生成する
// なぜ: 仕様書 §5 のテスト用mkbを同梱。dev/build時に再生成できるようにする

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';

// 何を: 64x64 茶色円のPNGをpure-JSで生成
// なぜ: base64 から起こした PNG は壊れていることがあり naturalSize は取れても
//       描画されない事故が起きた。実装で生成する方が確実
function makeCirclePng(size = 64, fg = [0x8b, 0x45, 0x13], bg = [0xfa, 0xf8, 0xf5]) {
  function crc32(buf) {
    let c, t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    let r = 0xffffffff;
    for (let i = 0; i < buf.length; i++) r = (r >>> 8) ^ t[(r ^ buf[i]) & 0xff];
    return (r ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const c = (dx * dx + dy * dy) <= (r * r) ? fg : bg;
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off] = c[0]; raw[off + 1] = c[1]; raw[off + 2] = c[2];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'docs', 'test-mkb');
const OUT = join(ROOT, 'public', 'test.mkb');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(p)));
    } else {
      files.push(p);
    }
  }
  return files;
}

async function main() {
  // 何を: 画像が無い場合に視認可能な64x64茶色円PNGを生成
  // なぜ: §4 検証で base64 経由のPNGが壊れていた事案あり。pure-JS で確実に生成する
  const imgPath = join(SRC, 'assets', 'test-image.png');
  try {
    await stat(imgPath);
  } catch {
    await mkdir(dirname(imgPath), { recursive: true });
    await writeFile(imgPath, makeCirclePng());
    console.log('[build-test-mkb] 視認可能なテストPNGを生成:', imgPath);
  }

  const files = await walk(SRC);
  const zip = new JSZip();
  for (const f of files) {
    const rel = relative(SRC, f).split('\\').join('/'); // Windows → POSIX
    const data = await readFile(f);
    zip.file(rel, data);
  }
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, buf);
  console.log(`[build-test-mkb] wrote ${OUT} (${buf.length} bytes, ${files.length} files)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
