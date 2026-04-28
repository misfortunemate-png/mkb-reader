// 何を: docs/test-mkb/ をZIP化して public/test.mkb を生成する
// なぜ: 仕様書 §5 のテスト用mkbを同梱。dev/build時に再生成できるようにする

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

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
  // 何を: 画像が無い場合に視認可能な64x64茶色PNGを生成
  // なぜ: §4 検証で 1x1 透過では「画像が表示されたか」が肉眼で判定できなかった
  const imgPath = join(SRC, 'assets', 'test-image.png');
  try {
    await stat(imgPath);
  } catch {
    const placeholder = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACzklEQVR4nO2bsW7TQBSGv3MdCWFCBSqUKJ0qKmaeoBJDh4qhSyVeoFKnPgEDD8DSBzAULJUYWLojJiqGTAWphCB1iiK1SeRzGNxLnOA4cZw4RP6lW1xfn3PP/9197Ts7QrgE4eLa9ynQAvaBXaAOPAeeAk+BXeAycBV4DbwHfgM/gM/AVeATsAd0gQ74F3gFvAU+AmfAJfACOAVOgGPgFPgGtIE2cAR8AN4Bb4APwFvgM3AKnAGvgNfAS6AOPAOeAg+APaAObAM/gZ/AKfAd+ATsA/vAp7H8/zVcAjqgIYBgX8nq8gIuhAQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gQg4gT8E0pkR3K3Z0DuFA0u4pYPYV9p/Wx+m8jD2+nJtS+xN1qW/A/wIKAFYP7L4f4HYLAB9oH7yGsLHAFNoA9bAFlQAUYNXAZ4yNgEJgYBzGqAMRljW7pX7dHpzFh4D3+jSkS8cKTKAGw5cAxsZRYAfeNCmvF8RKQGGsFxwBV4t1ofE7ofwMrBsAo8Aha+gKwDvgWaQAvoaH3VCgAaoTOQH+kmcg2sKGTr/wCqKLkCpDaP0NQAAAAASUVORK5CYII=',
      'base64',
    );
    await mkdir(dirname(imgPath), { recursive: true });
    await writeFile(imgPath, placeholder);
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
