// 何を: 画像 Blob をリサイズする（仕様書 Phase 3a §12）
// なぜ: 本棚保存時に長辺 2048px 超の画像を縮めて IndexedDB 容量を節約する

const DEFAULT_OPTS = {
  maxLongSide: 2048,
  jpegQuality: 0.85,
};

// 何を: Blob → HTMLImageElement
// なぜ: Canvas で描画するために decodable な ImageBitmap or HTMLImageElement が必要
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// 何を: 単一画像 Blob のリサイズ
// なぜ: 仕様書 §12 — 長辺 2048px 超のみ処理。元 MIME を維持（PNG→PNG, JPEG→JPEG）
//   PNG/GIF/WebP は同 MIME で出力。toBlob の type 引数で明示。
//   GIF はアニメーションがあれば最初のフレームになる（ブラウザ任せ）。
export async function resizeImage(blob, options = {}) {
  const opt = { ...DEFAULT_OPTS, ...options };
  if (!blob || !blob.type) return blob;
  if (!blob.type.startsWith('image/')) return blob;

  try {
    const img = await loadImage(blob);
    const w = img.naturalWidth, h = img.naturalHeight;
    const longSide = Math.max(w, h);
    if (longSide <= opt.maxLongSide) return blob; // リサイズ不要
    const scale = opt.maxLongSide / longSide;
    const nw = Math.round(w * scale), nh = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = nw; canvas.height = nh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, nw, nh);
    // 元 MIME を維持（PNG→PNG, JPEG→JPEG など）
    const outType = blob.type;
    const out = await new Promise((res, rej) => {
      canvas.toBlob((b) => b ? res(b) : rej(new Error('toBlob failed')),
        outType, outType === 'image/jpeg' ? opt.jpegQuality : undefined);
    });
    return out;
  } catch (e) {
    console.warn('resizeImage failed, keeping original:', e);
    return blob;
  }
}

// 何を: 進捗コールバック付きの ZIP 内画像リサイズ
// なぜ: 仕様書 §12 — mkb/cbz/zip 保存時に各画像をリサイズして再 ZIP 化、
//       「3/20 画像を処理中...」のような進捗表示が必要
export async function resizeImagesInZip(zip, onProgress, options = {}) {
  const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
  const targets = [];
  zip.forEach((relPath, file) => {
    if (file.dir) return;
    if (IMG_RE.test(relPath)) targets.push(file);
  });
  let done = 0;
  for (const entry of targets) {
    const ab = await entry.async('arraybuffer');
    const ext = (entry.name.split('.').pop() || '').toLowerCase();
    const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' })[ext]
      || 'application/octet-stream';
    const blob = new Blob([ab], { type: mime });
    const resized = await resizeImage(blob, options);
    if (resized !== blob) {
      const buf = await resized.arrayBuffer();
      zip.file(entry.name, buf);
    }
    done++;
    onProgress?.(done, targets.length, entry.name);
  }
  return targets.length;
}
