// 何を: MarkBook（.mkb / ZIP）の構造解析
// なぜ: 仕様書 §1 - markbook.yaml の解析、チャプター順決定、assets を Blob URL に変換

import yaml from 'js-yaml';

// MD冒頭の最初の h1 を抜き出す（チャプタータイトル決定のフォールバック）
function extractFirstH1(md) {
  const m = md.match(/^\s*#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

// MD内の画像参照 ![alt](path) のパスを Blob URL に置換
// 仕様書 §1: assets 内のファイルは MD 内の相対パス（assets/... または ../assets/...）で参照される前提
export function rewriteAssetPaths(md, assetsMap) {
  if (!assetsMap || assetsMap.size === 0) return md;
  return md.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (full, alt, src, title) => {
    if (/^(https?:|data:|blob:)/i.test(src)) return full;
    // ../assets/foo.png → assets/foo.png に正規化
    const normalized = src.replace(/^(\.{1,2}\/)+/, '');
    const url = assetsMap.get(normalized) || assetsMap.get(src);
    if (!url) return full;
    return `![${alt}](${url}${title || ''})`;
  });
}

// JSZip オブジェクトから MkbData を組み立てる
export async function parseMkbZip(zip, fallbackTitle = 'Untitled') {
  // 1) markbook.yaml（任意）
  let metadata = { title: fallbackTitle };
  let pagesOrder = null;
  const yamlEntry = zip.file(/^markbook\.ya?ml$/i)[0];
  if (yamlEntry) {
    try {
      const text = await yamlEntry.async('string');
      const data = yaml.load(text) || {};
      metadata = {
        title: data.title || fallbackTitle,
        author: data.author,
        ...data,
      };
      if (Array.isArray(data.pages)) {
        pagesOrder = data.pages.map((p) => String(p).replace(/^\.\//, ''));
      }
    } catch (e) {
      console.warn('markbook.yaml parse failed:', e);
    }
  }

  // 2) assets/ を Blob URL 化
  // 何を: 拡張子から MIME type を推定し、Blob に明示的に設定する
  // なぜ: JSZip.async('blob') は type を空文字で生成する。MIME 未指定の Blob URL は
  //       一部ブラウザ/環境（特に Service Worker 経由）で <img> がデコードに失敗する
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    mp4: 'video/mp4', webm: 'video/webm',
    pdf: 'application/pdf',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  };
  const assetsMap = new Map(); // 相対パス（assets/foo.png 形式） → blob URL
  const assetEntries = zip.file(/^assets\//);
  for (const entry of assetEntries) {
    if (entry.dir) continue;
    const ext = entry.name.split('.').pop()?.toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const ab = await entry.async('arraybuffer');
    const blob = new Blob([ab], { type });
    const url = URL.createObjectURL(blob);
    assetsMap.set(entry.name, url);
  }

  // 3) index.md（必須）
  const indexEntry = zip.file(/^index\.md$/i)[0];
  if (!indexEntry) {
    throw new Error('index.md が mkb 内に見つかりません');
  }
  const indexContent = await indexEntry.async('string');

  // 4) pages/*.md
  const pageEntries = zip.file(/^pages\/[^/]+\.md$/i);
  const pageMap = new Map(); // ファイル名(basename) → { name, content }
  for (const entry of pageEntries) {
    if (entry.dir) continue;
    const content = await entry.async('string');
    const base = entry.name.replace(/^pages\//, '');
    pageMap.set(base, { name: base, content });
  }

  // 5) チャプター順序の決定
  const chapters = [];
  const indexRewritten = rewriteAssetPaths(indexContent, assetsMap);
  chapters.push({
    id: 'index',
    title: extractFirstH1(indexContent) || metadata.title || 'index',
    content: indexRewritten,
    order: 0,
  });

  let orderedNames;
  if (pagesOrder && pagesOrder.length) {
    // markbook.yaml の指定順
    orderedNames = pagesOrder
      .map((p) => p.replace(/^pages\//, ''))
      .filter((n) => pageMap.has(n));
    // 漏れたものはアルファベット順で末尾に
    const remaining = [...pageMap.keys()].filter((n) => !orderedNames.includes(n)).sort();
    orderedNames = [...orderedNames, ...remaining];
  } else {
    orderedNames = [...pageMap.keys()].sort();
  }

  orderedNames.forEach((name, i) => {
    const { content } = pageMap.get(name);
    chapters.push({
      id: name.replace(/\.md$/i, ''),
      title: extractFirstH1(content) || name.replace(/\.md$/i, ''),
      content: rewriteAssetPaths(content, assetsMap),
      order: i + 1,
    });
  });

  return { metadata, chapters, assets: assetsMap };
}

// 単一 .md ファイルを「index.md だけの MarkBook」として扱う
export function buildSingleMdMkb(text, fileName = 'document.md') {
  const baseTitle = fileName.replace(/\.[^.]+$/, '');
  const title = extractFirstH1(text) || baseTitle;
  return {
    metadata: { title },
    chapters: [
      { id: 'index', title, content: text, order: 0 },
    ],
    assets: new Map(),
  };
}

// .txt は Markdown パースなしフラグ付き
export function buildTxtMkb(text, fileName = 'document.txt') {
  const baseTitle = fileName.replace(/\.[^.]+$/, '');
  return {
    metadata: { title: baseTitle },
    chapters: [
      { id: 'index', title: baseTitle, content: text, order: 0, plainText: true },
    ],
    assets: new Map(),
  };
}

// Blob URL の解放（mkb 切り替え時のメモリリーク防止）
export function revokeMkbAssets(mkb) {
  if (!mkb || !mkb.assets) return;
  for (const url of mkb.assets.values()) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}
