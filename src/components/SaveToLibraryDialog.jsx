// 何を: 書庫への保存先パス入力ダイアログ（§36.3 / §37 共通）
// なぜ: ExportDialog と ChatImporter で同一のPUT経路を使うため共通化
import { useEffect, useRef, useState } from 'react';

export default function SaveToLibraryDialog({
  defaultPath,   // 初期パス（例: "story.mkb"）
  onSave,        // (relPath: string) => void
  onCancel,      // () => void
  busy,          // boolean: 保存中フラグ
}) {
  const [relPath, setRelPath] = useState(defaultPath || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setRelPath(defaultPath || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [defaultPath]);

  function handleSubmit(e) {
    e.preventDefault();
    const p = relPath.trim();
    if (!p) return;
    onSave(p);
  }

  return (
    <>
      <div className="settings-overlay show" onClick={onCancel} />
      <div className="settings-sheet open" role="dialog" aria-modal="true" aria-label="書庫へ保存">
        <div className="settings-handle" onClick={onCancel} />
        <section className="settings-section">
          <h3>書庫へ保存</h3>
          <p className="rw-hint" style={{ marginBottom: '0.6rem' }}>
            LIBRARY_ROOT からの相対パスを入力してください
          </p>
          <form onSubmit={handleSubmit}>
            <div className="rw-row">
              <label className="rw-label">保存先</label>
              <input
                ref={inputRef}
                type="text"
                className="rw-input"
                value={relPath}
                placeholder="例: story.mkb"
                onChange={(e) => setRelPath(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="settings-row" style={{ marginTop: '0.6rem' }}>
              <button type="button" className="settings-btn" onClick={onCancel} disabled={busy}>
                キャンセル
              </button>
              <button type="submit" className="settings-btn active"
                disabled={busy || !relPath.trim()}>
                {busy ? '保存中…' : '書庫へ保存'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
