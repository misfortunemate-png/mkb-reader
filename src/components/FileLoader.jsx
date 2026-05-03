// 何を: ウェルカム画面とファイル選択UI
// なぜ: 仕様書 §1 のファイル選択ボタン。mkb / md / txt を accept
//       §30: md/txt/markdown 選択時に縦書き確認ダイアログを表示

import { useRef, useState } from 'react';

// 何を: 縦書き確認ダイアログを表示する拡張子
// なぜ: §30 D-005 — インポート時に縦書き/横書きを確定する。他の形式には不要
const VERTICAL_EXT_RE = /\.(md|markdown|txt)$/i;

export default function FileLoader({ onSelect, error, loading, onLoadSample }) {
  const inputRef = useRef(null);
  // 何を: md/txt 選択時の一時保留ファイル（縦書き確認待ち）
  // なぜ: §30 — 選択直後に読み込まず、チェックボックスで縦書きかどうかを確認してから loadFile に渡す
  const [pendingFile, setPendingFile] = useState(null);
  const [isVertical, setIsVertical] = useState(false);

  function handleChange(e) {
    const files = e.target.files;
    if (files && files.length > 1) {
      onSelect(Array.from(files));
    } else if (files && files[0]) {
      const file = files[0];
      if (VERTICAL_EXT_RE.test(file.name || '')) {
        // md/txt/markdown → 縦書き確認ダイアログへ
        setPendingFile(file);
        setIsVertical(false);
      } else {
        onSelect(file);
      }
    }
    e.target.value = '';
  }

  function handleConfirm() {
    if (!pendingFile) return;
    onSelect(pendingFile, { vertical: isVertical });
    setPendingFile(null);
  }

  // 縦書き確認ダイアログ表示中
  if (pendingFile) {
    return (
      <div className="welcome">
        <h1>mkb-reader</h1>
        <p className="hint">{pendingFile.name}</p>
        <label className="vertical-check">
          <input
            type="checkbox"
            checked={isVertical}
            onChange={(e) => setIsVertical(e.target.checked)}
          />
          縦書きとして読み込む
        </label>
        <div className="vertical-confirm-btns">
          <button type="button" className="file-btn" onClick={handleConfirm} disabled={loading}>
            {loading ? '読込中…' : '読み込む'}
          </button>
          <button type="button" className="file-btn" onClick={() => setPendingFile(null)}>
            キャンセル
          </button>
        </div>
        {error && <p className="error">エラー: {error}</p>}
      </div>
    );
  }

  return (
    <div className="welcome">
      <h1>mkb-reader</h1>
      <p className="hint">
        MarkBook（.mkb）/ Markdown（.md）/ テキスト（.txt）を読み込みます
      </p>
      <button
        type="button"
        className="file-btn"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? '読込中…' : 'ファイルを選択'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".mkb,.md,.markdown,.txt,.html,.htm,.json,.cbz,.zip,.jpg,.jpeg,.png,.gif,.webp,.avif"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <p className="hint">.mkb / .md / .txt</p>
      {onLoadSample && (
        <button
          type="button"
          className="text-sm underline text-[var(--color-text-secondary)]"
          onClick={onLoadSample}
          disabled={loading}
        >
          同梱のテスト用 mkb を開く
        </button>
      )}
      {error && <p className="error">エラー: {error}</p>}
    </div>
  );
}
