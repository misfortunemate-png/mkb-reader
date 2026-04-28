// 何を: 読み替え結果を新しい MKB ファイルとしてエクスポート（仕様書 Phase 3b §16）
// なぜ: 原本（BookEntry.fileData）には触れず、毎回展開→読み替え適用→再 ZIP 化する
//       設計思想 §0: 「原本は変更しない」を最優先に保つ
//
// useExport は React Hook ではなく純粋関数の集合（モジュール）として export する。
// useFooHook の命名にしているのは慣習で他のフックと並べやすくするため。

import JSZip from 'jszip';
import yaml from 'js-yaml';
import { applyRewrite } from '../utils/rewriteEngine.js';

// ───── ヘルパ ─────

function safeName(s) {
  return String(s || 'untitled').replace(/[\\/:*?"<>|]/g, '_');
}

// 何を: ArrayBuffer を Blob にして <a download> で保存する
// なぜ: ブラウザ標準のダウンロード API。Pixel 10 Chrome でも動作
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 解放は次のフレームで（DL 開始前に消えると失敗する環境がある）
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───── メインのエクスポート ─────

// 何を: BookEntry → 読み替え適用済みの mkb (ZIP) を生成し、ダウンロード
// なぜ: 仕様書 §16 — 読み替え結果を「新しい原本」として書き出す。
//       適用なしの場合は原本そのままを再パッケージ（タイトル・著者の更新のみ）
//
// options:
//   - title, author: markbook.yaml のメタ書き換え（任意）
//   - applyRewrite: true=読み替え適用 / false=原本そのまま
//   - bookEntry: 必須。fileData / fileType / 元 yaml メタ
//   - rewriteRules: 適用時に必須（applyRewrite=true のとき）
export async function exportMkb({
  bookEntry,
  rewriteRules,
  title,
  author,
  applyRewrite: doApply = true,
}) {
  if (!bookEntry) throw new Error('bookEntry is required');

  // 1) 原本展開（mkb/zip なら ZIP 展開、md/txt なら単一ファイルとして扱う）
  const ft = bookEntry.fileType || 'mkb';
  let zip;
  let chapters; // [{id, title, content, order}]
  let originalMeta = {};
  let originalAssets = []; // [{name, ab}] 旧 assets/* をそのまま引き継ぐ

  if (ft === 'mkb' || ft === 'zip' || ft === 'cbz') {
    zip = await JSZip.loadAsync(bookEntry.fileData);
    // markbook.yaml
    const yamlEntry = zip.file(/^markbook\.ya?ml$/i)[0];
    if (yamlEntry) {
      try {
        const text = await yamlEntry.async('string');
        originalMeta = yaml.load(text) || {};
      } catch { /* ignore */ }
    }
    // chapters
    chapters = [];
    const indexEntry = zip.file(/^index\.md$/i)[0];
    if (indexEntry) {
      const content = await indexEntry.async('string');
      chapters.push({ id: 'index', title: title || originalMeta.title || 'index', content, order: 0 });
    }
    const pageEntries = zip.file(/^pages\/[^/]+\.md$/i);
    for (const pe of pageEntries) {
      const content = await pe.async('string');
      const id = pe.name.replace(/^pages\//, '').replace(/\.md$/i, '');
      chapters.push({ id, title: id, content, order: chapters.length });
    }
    // assets
    const assetEntries = zip.file(/^assets\//);
    for (const ae of assetEntries) {
      if (ae.dir) continue;
      const ab = await ae.async('arraybuffer');
      originalAssets.push({ name: ae.name, ab });
    }
  } else if (ft === 'md') {
    const text = new TextDecoder().decode(bookEntry.fileData);
    chapters = [{ id: 'index', title: title || bookEntry.title || 'index', content: text, order: 0 }];
  } else if (ft === 'txt') {
    const text = new TextDecoder().decode(bookEntry.fileData);
    chapters = [{ id: 'index', title: title || bookEntry.title || 'document', content: text, order: 0, plainText: true }];
  } else {
    throw new Error(`未対応の fileType: ${ft}`);
  }

  // 2) 読み替えを各チャプターに適用
  // 何を: insertedAssets は path 形式で MD に挿入（Blob URL ではなく assets/inserted-xxx.png）
  // なぜ: エクスポートされた mkb は別環境で開かれる前提。Blob URL は無効
  if (doApply && rewriteRules) {
    for (const c of chapters) {
      c.content = applyRewrite(c.content, rewriteRules, c.id, {
        highlight: false, // エクスポートにはハイライトを残さない（仕様 Q2: 機能保留）
        assetUrlOf: (a) => a.path,
      });
    }
  }

  // 3) ZIP 構築（mkb 形式に統一）
  const out = new JSZip();
  const finalMeta = {
    title: title || originalMeta.title || bookEntry.title || 'Untitled',
    author: (author !== undefined ? author : (originalMeta.author || bookEntry.author || '')),
  };
  if (originalMeta.model) finalMeta.model = originalMeta.model;
  if (originalMeta.created_at) finalMeta.created_at = originalMeta.created_at;
  // pages 順序
  const pageOrder = chapters.filter((c) => c.id !== 'index').map((c) => `${c.id}.md`);
  if (pageOrder.length) finalMeta.pages = pageOrder;
  out.file('markbook.yaml', yaml.dump(finalMeta, { lineWidth: -1 }));

  // index + pages
  const idx = chapters.find((c) => c.id === 'index');
  if (idx) out.file('index.md', idx.content);
  for (const c of chapters) {
    if (c.id === 'index') continue;
    out.file(`pages/${c.id}.md`, c.content);
  }

  // 既存 assets を引き継ぎ
  for (const a of originalAssets) {
    out.file(a.name, a.ab);
  }

  // 4) insertedAssets を assets/inserted-xxx.{ext} として追加（適用時のみ）
  if (doApply && rewriteRules?.insertedAssets?.length) {
    for (const a of rewriteRules.insertedAssets) {
      if (a.enabled === false) continue;
      out.file(a.path, a.data);
    }
  }

  // 5) ZIP バイナリ生成 → ダウンロード
  const buf = await out.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = `${safeName(finalMeta.title)}.mkb`;
  downloadBlob(buf, filename);
  return { size: buf.size, filename };
}
