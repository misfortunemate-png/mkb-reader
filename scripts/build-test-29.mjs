// 何を: docs/test-29a/ と docs/test-29b/ を zip 化して
//       public/test-29a.mkb と public/test-29b.mkb を生成する
// なぜ: §29.1(ファイル接続)・§29.2(画像切り出し)・§29.3(MKBエクスポート)の
//       実機テスト用サンプル。2ファイルをライブラリで結合することで全機能を検証できる

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';

// 何を: 指定色の 80x80 正方形 PNG を pure-JS で生成
// なぜ: 外部画像ファイル不要。色で A/B を即座に区別できる
function makeSquarePng(size = 80, fg = [0x8b, 0x45, 0x13], bg = [0xfa, 0xf8, 0xf5]) {
  function crc32(buf) {
    let c; const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
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

  // 外枠 8px を fg 色、内側を bg 色で塗る
  const raw = Buffer.alloc(size * (1 + size * 3));
  const border = Math.floor(size * 0.1);
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter type
    for (let x = 0; x < size; x++) {
      const isBorder = x < border || x >= size - border || y < border || y >= size - border;
      const c = isBorder ? fg : bg;
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off] = c[0]; raw[off + 1] = c[1]; raw[off + 2] = c[2];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

async function buildMkb(srcDir, outPath, iconName, iconColor) {
  const imgPath = join(srcDir, 'assets', iconName);
  try { await stat(imgPath); } catch {
    await mkdir(dirname(imgPath), { recursive: true });
    await writeFile(imgPath, makeSquarePng(80, iconColor));
  }
  const files = await walk(srcDir);
  const zip = new JSZip();
  for (const f of files) {
    const rel = relative(srcDir, f).split('\\').join('/');
    zip.file(rel, await readFile(f));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log(`[build-test-29] wrote ${outPath} (${buf.length} bytes, ${files.length} files)`);
}

await buildMkb(
  join(ROOT, 'docs', 'test-29a'),
  join(ROOT, 'public', 'test-29a.mkb'),
  'icon-a.png',
  [0xe6, 0x51, 0x00], // 橙色 #e65100
);
await buildMkb(
  join(ROOT, 'docs', 'test-29b'),
  join(ROOT, 'public', 'test-29b.mkb'),
  'icon-b.png',
  [0x15, 0x65, 0xc0], // 青色 #1565c0
);
