// 何を: 画像差し込みダイアログ（仕様書 Phase 3b §15）
// なぜ: ファイルピッカーで画像選択 → §12 のリサイズ → InsertedAsset として localSettings に保存
//
// 設計:
//   - RewritePanel の「＋ 画像を差し込む」から呼ばれる
//   - 挿入位置のデフォルトは「現在のチャプター末尾」（CSS multi-column 上の
//     現在表示ページ末尾の特定が難しいため）
//   - ユーザーが行番号を変更可能。原本プレビュー（RewritePanel 側）で確認できる

import { useRef, useState } from 'react';
import { resizeImage } from '../hooks/useImageResize.js';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif';

function extOf(mime) {
  return ({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/avif': 'avif',
  }[mime] || 'png');
}

export default function ImageInserter({
  open,
  onClose,
  currentChapter,
  onAdd,           // (asset: InsertedAsset) => Promise<void>
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [altText, setAltText] = useState('');
  const [lineNumber, setLineNumber] = useState(() => {
    return (currentChapter?.content || '').split('\n').length;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function pick() { inputRef.current?.click(); }
  function onPickChange(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setAltText(f.name.replace(/\.[^.]+$/, ''));
  }

  async function handleAdd() {
    if (!file || !currentChapter) return;
    setBusy(true);
    setError(null);
    try {
      // §12 リサイズ（長辺 2048px）
      const resized = await resizeImage(file);
      const buf = await resized.arrayBuffer();
      const id = crypto.randomUUID();
      const ext = extOf(resized.type || file.type);
      const asset = {
        id,
        path: `assets/inserted-${id}.${ext}`,
        data: buf,
        mimeType: resized.type || file.type || 'image/png',
        insertAfter: {
          chapterId: currentChapter.id,
          lineNumber: Math.max(0, Number(lineNumber) || 0),
        },
        altText: altText || '',
        enabled: true,
      };
      await onAdd(asset);
      // クリーンアップして閉じる
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      setAltText('');
      onClose?.();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const totalLines = (currentChapter?.content || '').split('\n').length;
  return (
    <>
      <div className="settings-overlay show" onClick={onClose} />
      <div className="settings-sheet open" role="dialog" aria-modal="true" aria-label="画像差し込み">
        <div className="settings-handle" onClick={onClose} />
        <section className="settings-section">
          <h3>画像差し込み</h3>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={onPickChange}
            style={{ display: 'none' }}
          />
          {!file ? (
            <button type="button" className="settings-btn active" onClick={pick}>＋ 画像を選択</button>
          ) : (
            <>
              {previewUrl && (
                <div className="ii-preview">
                  <img src={previewUrl} alt="" />
                </div>
              )}
              <div className="rw-row">
                <label className="rw-label">alt</label>
                <input
                  type="text" className="rw-input"
                  value={altText}
                  placeholder="代替テキスト（任意）"
                  onChange={(e) => setAltText(e.target.value)}
                />
              </div>
              <div className="rw-row">
                <label className="rw-label">行番号</label>
                <input
                  type="number" className="rw-num"
                  min="0" max={totalLines}
                  value={lineNumber}
                  onChange={(e) => setLineNumber(Number(e.target.value) || 0)}
                />
                <span className="rw-hint">この行の後に挿入（0 = 先頭、{totalLines} = 末尾）</span>
              </div>
              {error && <p className="bookshelf-error" style={{ margin: '0.4rem 0' }}>{error}</p>}
              <div className="settings-row" style={{ marginTop: '0.6rem' }}>
                <button type="button" className="settings-btn" onClick={pick}>別の画像を選ぶ</button>
                <button type="button" className="settings-btn active" onClick={handleAdd} disabled={busy}>
                  {busy ? '処理中…' : '追加'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
