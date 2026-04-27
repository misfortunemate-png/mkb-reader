// 何を: ウェルカム画面とファイル選択UI
// なぜ: 仕様書 §1 のファイル選択ボタン。mkb / md / txt を accept

import { useRef } from 'react';

export default function FileLoader({ onSelect, error, loading, onLoadSample }) {
  const inputRef = useRef(null);

  function handleChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file) onSelect(file);
    // 同じファイルを再選択した場合に change が再発火するよう reset
    e.target.value = '';
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
        accept=".mkb,.md,.markdown,.txt"
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
