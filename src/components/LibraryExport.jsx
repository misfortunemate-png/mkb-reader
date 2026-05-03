// 何を: ライブラリ/フォルダを mkb ファイルとしてエクスポートする UI
// なぜ: 仕様書 §29.3 — ツリー走査→BookEntry取得→rewrite適用→edits適用→フォルダ→
//       チャプター構造マッピング→JSZip→.mkbダウンロード

import { useState } from 'react';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { applyRewrite } from '../utils/rewriteEngine.js';

// ───── 内部ユーティリティ ─────

function safeName(s) {
  return String(s || 'untitled').replace(/[\\/:*?"<>|]/g, '_');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 何を: BookEntry の fileData をチャプター配列に変換する（Blob URL を作らない）
// なぜ: エクスポート時は Blob URL 不要。生 MD テキストと assets の ArrayBuffer のみ必要
async function extractRawChapters(bookEntry) {
  const ft = bookEntry.fileType || 'mkb';
  if (ft === 'mkb' || ft === 'zip') {
    const zip = await JSZip.loadAsync(bookEntry.fileData);
    let meta = {};
    const yamlEntry = zip.file(/^markbook\.ya?ml$/i)[0];
    if (yamlEntry) {
      try { meta = yaml.load(await yamlEntry.async('string')) || {}; } catch { /* ignore */ }
    }
    // assets を ArrayBuffer のまま収集
    const assetsMap = new Map();
    for (const ae of zip.file(/^assets\//)) {
      if (ae.dir) continue;
      assetsMap.set(ae.name, await ae.async('arraybuffer'));
    }
    // チャプター取得（order を保持）
    const chapters = [];
    const indexEntry = zip.file(/^index\.md$/i)[0];
    if (indexEntry) {
      chapters.push({
        id: 'index',
        title: meta.title || bookEntry.title || 'index',
        content: await indexEntry.async('string'),
        order: 0,
      });
    }
    let orderedNames;
    if (Array.isArray(meta.pages) && meta.pages.length) {
      orderedNames = meta.pages
        .map((p) => String(p).replace(/^pages\//, ''))
        .filter((n) => zip.file(`pages/${n}`));
      const allPages = zip.file(/^pages\/[^/]+\.md$/i).map((e) =>
        e.name.replace(/^pages\//, '')
      );
      const remaining = allPages.filter((n) => !orderedNames.includes(n)).sort();
      orderedNames = [...orderedNames, ...remaining];
    } else {
      orderedNames = zip.file(/^pages\/[^/]+\.md$/i).map((e) =>
        e.name.replace(/^pages\//, '')
      ).sort();
    }
    for (const name of orderedNames) {
      const pe = zip.file(`pages/${name}`);
      if (!pe) continue;
      chapters.push({
        id: name.replace(/\.md$/i, ''),
        title: name.replace(/\.md$/i, ''),
        content: await pe.async('string'),
        order: chapters.length,
      });
    }
    return { chapters, assetsMap };
  } else if (ft === 'md') {
    const text = new TextDecoder().decode(bookEntry.fileData);
    return {
      chapters: [{ id: 'index', title: bookEntry.title || 'index', content: text, order: 0 }],
      assetsMap: new Map(),
    };
  } else if (ft === 'txt') {
    const text = new TextDecoder().decode(bookEntry.fileData);
    return {
      chapters: [{ id: 'index', title: bookEntry.title || 'document', content: text, order: 0 }],
      assetsMap: new Map(),
    };
  }
  return { chapters: [], assetsMap: new Map() };
}

// 何を: ライブラリまたはフォルダを走査して mkb を生成・ダウンロード
// なぜ: §29.3 — フォルダ→チャプター構造マッピング、importedAssets を assets/ に収集
export async function exportLibraryMkb({ library, targetNodeId, books, getLocalSettings }) {
  // 走査対象ノードの決定（library 全体 or 特定フォルダ）
  const rootNodeIds = targetNodeId
    ? (library.nodes[targetNodeId]?.children || [])
    : (library.rootNodes || []);

  const outChapters = []; // { id, title, content }
  const outAssets = new Map(); // assetPath → ArrayBuffer
  const outImportedAssets = []; // ImportedAsset[]

  // 章 ID の衝突回避用カウンタ
  const idCounter = new Map();
  function uniqueId(base) {
    const n = (idCounter.get(base) || 0) + 1;
    idCounter.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  }

  // 何を: ノードを再帰走査してチャプターに変換する
  // なぜ: §29.3 — フォルダを区切りチャプターとして挿入し、配下ノードを展開する
  async function processNode(nodeId) {
    const node = library.nodes[nodeId];
    if (!node) return;

    if (node.type === 'folder') {
      // フォルダ → 区切りチャプター（見出し1行）+ 子を再帰
      outChapters.push({
        id: uniqueId(`folder-${node.name}`),
        title: node.name,
        content: `# ${node.name}\n`,
      });
      for (const childId of (node.children || [])) {
        await processNode(childId);
      }

    } else if (node.type === 'item') {
      const entry = books.find((b) => b.id === node.sourceBookId);
      if (!entry) return;

      const { chapters, assetsMap } = await extractRawChapters(entry);
      const ls = await getLocalSettings?.(entry.id);
      const layerA = ls?.rewrite || null;
      const edits = node.edits || {};

      // 層A + 層B を合成したルール（エクスポート用）
      const combinedRules = {
        ...(layerA || {}),
        hiddenRanges: [...(layerA?.hiddenRanges || []), ...(edits.hiddenRanges || [])],
        insertedAssets: [
          ...(layerA?.insertedAssets || []),
          ...(edits.insertedAssets || []),
          ...(edits.importedAssets || []),
        ],
        lineEdits: [...(layerA?.lineEdits || []), ...(edits.lineEdits || [])],
      };

      for (const c of chapters) {
        const content = applyRewrite(c.content, combinedRules, c.id, {
          highlight: false,
          assetUrlOf: (a) => a.path || '',
        });
        const cTitle = chapters.length > 1 ? `${node.name} - ${c.title}` : node.name;
        outChapters.push({ id: uniqueId(`${node.id}-${c.id}`), title: cTitle, content });
      }

      // assets（元の zip 内）を収集
      for (const [path, ab] of assetsMap) {
        outAssets.set(path, ab);
      }
      // 層A の insertedAssets バイナリを収集
      for (const a of (layerA?.insertedAssets || [])) {
        if (a.enabled !== false && a.path && a.data) {
          outAssets.set(a.path, a.data);
        }
      }
      // importedAssets を収集（後段で assets/imported-xxx として追加）
      outImportedAssets.push(
        ...(edits.importedAssets || []).filter((a) => a.enabled !== false)
      );

    } else if (node.type === 'joined') {
      // 結合ノード → 各 sourceBook をチャプターとして展開
      for (const bookId of (node.sourceBookIds || [])) {
        const entry = books.find((b) => b.id === bookId);
        if (!entry) continue;

        const { chapters, assetsMap } = await extractRawChapters(entry);
        const ls = await getLocalSettings?.(entry.id);
        const layerA = ls?.rewrite || null;

        for (const c of chapters) {
          const content = applyRewrite(c.content, layerA, c.id, {
            highlight: false,
            assetUrlOf: (a) => a.path || '',
          });
          const cTitle = chapters.length > 1 ? `${entry.title} - ${c.title}` : entry.title;
          outChapters.push({ id: uniqueId(`${node.id}-${bookId}-${c.id}`), title: cTitle, content });
        }
        for (const [path, ab] of assetsMap) {
          outAssets.set(path, ab);
        }
      }
      // joined ノード自身の importedAssets
      const edits = node.edits || {};
      outImportedAssets.push(
        ...(edits.importedAssets || []).filter((a) => a.enabled !== false)
      );
    }
  }

  for (const nodeId of rootNodeIds) {
    await processNode(nodeId);
  }

  if (outChapters.length === 0) {
    throw new Error('エクスポートできるチャプターがありません。アイテムを追加してください。');
  }

  // ───── ZIP 構築 ─────

  const title = targetNodeId
    ? (library.nodes[targetNodeId]?.name || library.name)
    : library.name;

  const out = new JSZip();
  const [firstChapter, ...restChapters] = outChapters;
  const pageOrder = restChapters.map((c) => `${c.id}.md`);

  const finalMeta = { title };
  if (pageOrder.length) finalMeta.pages = pageOrder;
  out.file('markbook.yaml', yaml.dump(finalMeta, { lineWidth: -1 }));
  out.file('index.md', firstChapter.content);
  for (const c of restChapters) {
    out.file(`pages/${c.id}.md`, c.content);
  }

  // 元の assets
  for (const [path, ab] of outAssets) {
    out.file(path, ab);
  }

  // §29.2 importedAssets → assets/imported-{id}.{ext} として収集
  for (const a of outImportedAssets) {
    if (!a.data) continue;
    const ext = (a.mimeType || 'image/jpeg').split('/')[1] || 'jpg';
    const assetPath = a.path || `assets/imported-${a.id}.${ext}`;
    out.file(assetPath, a.data);
  }

  const buf = await out.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = `${safeName(title)}.mkb`;
  downloadBlob(buf, filename);
  return { size: buf.size, filename };
}

// ───── LibraryExport UI コンポーネント ─────
// 何を: エクスポート確認ダイアログ（ExportDialog と同じボトムシートスタイル）
// なぜ: §29.3 — 「MKBとして出力」ボタン押下で表示し、ユーザーがダウンロードを確認する
export default function LibraryExport({
  library,       // Library オブジェクト
  targetNodeId,  // null = ライブラリ全体、それ以外 = フォルダ ID
  books,         // BookEntry[] — 全本棚
  getLocalSettings, // (bookId) => Promise<LocalSettings>
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!library) return null;

  const targetName = targetNodeId
    ? (library.nodes[targetNodeId]?.name || library.name)
    : library.name;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await exportLibraryMkb({ library, targetNodeId, books, getLocalSettings });
      onClose?.();
    } catch (e) {
      console.error('LibraryExport:', e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="settings-overlay show" onClick={onClose} />
      <div className="settings-sheet open" role="dialog" aria-modal="true" aria-label="ライブラリMKBエクスポート">
        <div className="settings-handle" onClick={onClose} />
        <section className="settings-section">
          <h3>MKB エクスポート（ライブラリ）</h3>
          <p className="rw-hint">
            「{targetName}」のすべてのアイテムを、チャプター構造を保ったまま .mkb ファイルとして出力します。
          </p>
          {error && (
            <p className="bookshelf-error" style={{ margin: '0.4rem 0' }}>{error}</p>
          )}
          <div className="settings-row" style={{ marginTop: '0.6rem' }}>
            <button type="button" className="settings-btn" onClick={onClose}>
              キャンセル
            </button>
            <button
              type="button"
              className="settings-btn active"
              onClick={run}
              disabled={busy}
            >
              {busy ? '書き出し中…' : '↓ エクスポート'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
