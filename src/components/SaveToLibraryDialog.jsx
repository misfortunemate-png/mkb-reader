// 何を: 書庫への保存先パス入力ダイアログ（§36.3 / §37 共通）
// なぜ: ExportDialog と ChatImporter で同一のPUT経路を使うため共通化
import { useEffect, useRef, useState } from 'react';

// 何を: 保存先の相対パスが書庫（Windows のファイルシステム）で使えない形かを判定する
// なぜ: 「:」は代替データストリームと解釈されて 0 バイトの実体ができ、禁止文字・空の部分・
//   . / .. ・末尾の空白やピリオドも、意図と違う場所・名前に保存される原因になる（mkb-reader#2）。
//   送ってから失敗させるのではなく、PUT を送る前にダイアログで止める。
//   「/」はフォルダの区切りとして受け付け、区切った各部分を調べる
const INVALID_PATH_CHARS = new Set(['\\', ':', '*', '?', '"', '<', '>', '|']);
const INVALID_PATH_MESSAGE =
  '保存先に使えない文字や形があります（\\ : * ? " < > | ・空の部分・. ・..・末尾の空白やピリオド）';
function isInvalidSegment(seg) {
  if (seg === '' || seg === '.' || seg === '..') return true;
  if (/[\s.]$/u.test(seg)) return true;
  return Array.from(seg).some((ch) => INVALID_PATH_CHARS.has(ch) || ch.charCodeAt(0) <= 0x1f);
}
function isInvalidLibraryPath(p) {
  return p.split('/').some(isInvalidSegment);
}

export default function SaveToLibraryDialog({
  defaultPath,   // 初期パス（例: "story.mkb"）
  onSave,        // (relPath: string) => void
  onCancel,      // () => void
  busy,          // boolean: 保存中フラグ
}) {
  const [relPath, setRelPath] = useState(defaultPath || '');
  const [pathError, setPathError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setRelPath(defaultPath || '');
    setPathError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [defaultPath]);

  function handleSubmit(e) {
    e.preventDefault();
    const p = relPath.trim();
    if (!p) return;
    if (isInvalidLibraryPath(p)) {
      setPathError(INVALID_PATH_MESSAGE);
      return;
    }
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
                onChange={(e) => {
                  setRelPath(e.target.value);
                  setPathError(null); // 入力を直したら文言を消す
                }}
                disabled={busy}
              />
            </div>
            {pathError && <p className="bookshelf-error" style={{ margin: '0.4rem 0' }}>{pathError}</p>}
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
