// 何を: MKB エクスポート ダイアログ（仕様書 Phase 3b §16 + Phase 6 §36.3）
// なぜ: タイトル / 著者 / 読み替え適用 を確認してエクスポートを実行する小ダイアログ
//       §36.3: 書庫が接続中の場合「書庫へ保存」ボタンを追加

import { useEffect, useState } from 'react';
import { buildMkbBuffer, exportMkb, exportMd } from '../hooks/useExport.js';

export default function ExportDialog({
  open,
  onClose,
  bookEntry,
  defaultTitle = '',
  defaultAuthor = '',
  rewriteRules,
  // §36.3
  remoteConnected,             // boolean: 書庫が接続中か
  onRequestSaveToLibrary,      // (buf: ArrayBuffer, suggestedPath: string) => void
  remoteItemPath,              // string | null: 書庫から開いたファイルの相対パス
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState(defaultAuthor);
  const [applyRw, setApplyRw] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) { setTitle(defaultTitle); setAuthor(defaultAuthor); setError(null); }
  }, [open, defaultTitle, defaultAuthor]);

  if (!open) return null;

  async function run() {
    if (!bookEntry) return;
    setBusy(true);
    setError(null);
    try {
      await exportMkb({ bookEntry, rewriteRules, title: title || undefined, author, applyRewrite: applyRw });
      onClose?.();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runMd() {
    if (!bookEntry) return;
    setBusy(true);
    setError(null);
    try {
      await exportMd({ bookEntry, rewriteRules, title: title || undefined, applyRewrite: applyRw });
      onClose?.();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!bookEntry || !onRequestSaveToLibrary) return;
    setBusy(true);
    setError(null);
    try {
      const { buf, filename } = await buildMkbBuffer({
        bookEntry, rewriteRules, title: title || undefined, author, applyRewrite: applyRw,
      });
      const suggestedPath = remoteItemPath || filename;
      onRequestSaveToLibrary(buf, suggestedPath);
      onClose?.();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="settings-overlay show" onClick={onClose} />
      <div className="settings-sheet open" role="dialog" aria-modal="true" aria-label="MKBエクスポート">
        <div className="settings-handle" onClick={onClose} />
        <section className="settings-section">
          <h3>MKB エクスポート</h3>
          <div className="rw-row">
            <label className="rw-label">タイトル</label>
            <input
              type="text"
              className="rw-input"
              value={title}
              placeholder="（変更しない）"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="rw-row">
            <label className="rw-label">著者</label>
            <input
              type="text"
              className="rw-input"
              value={author}
              placeholder="（変更しない）"
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <label className="rw-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={applyRw} onChange={(e) => setApplyRw(e.target.checked)} />
            <span>読み替えを適用する</span>
            <span className="rw-hint" style={{ marginLeft: 'auto' }}>
              {applyRw ? '読み替え後の状態で書き出し' : '原本そのまま'}
            </span>
          </label>
          {error && <p className="bookshelf-error" style={{ margin: '0.4rem 0' }}>{error}</p>}
          <div className="settings-row" style={{ marginTop: '0.6rem' }}>
            <button type="button" className="settings-btn" onClick={onClose}>キャンセル</button>
            {remoteConnected && onRequestSaveToLibrary && (
              <button type="button" className="settings-btn"
                onClick={handleSaveToLibrary}
                disabled={busy || !bookEntry}>
                {busy ? '処理中…' : '書庫へ保存'}
              </button>
            )}
            <button
              type="button"
              className="settings-btn"
              onClick={runMd}
              disabled={busy || !bookEntry}
            >
              {busy ? '書き出し中…' : '↓ MD'}
            </button>
            <button
              type="button"
              className="settings-btn active"
              onClick={run}
              disabled={busy || !bookEntry}
            >
              {busy ? '書き出し中…' : '↓ エクスポート'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
