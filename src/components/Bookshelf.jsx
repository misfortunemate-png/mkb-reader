// 何を: 本棚UI（仮実装・差替前提）
// なぜ: 仕様書 §8 — 装飾に凝らず、useBookshelf の安定IFだけに依存させ、
//       将来「特別感のあるUI」へ全面差替できる構造にしておく

import { useRef, useState } from 'react';

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Bookshelf({
  books,
  loading,
  onPickFile,        // (File) => void: 端末からファイルを選択
  onOpenBook,        // (BookEntry) => void: 保存済みを開く
  onDeleteBook,      // (id) => Promise<void>
  onLoadSample,      // () => void: 同梱の test.mkb を開く（任意）
  error,
}) {
  const inputRef = useRef(null);
  // スワイプで X 方向に引いた量を一時保持（id → px）
  const [swipeOffset, setSwipeOffset] = useState({});
  const startRef = useRef({ id: null, x: 0, y: 0, locked: null });

  function handlePickClick() {
    inputRef.current?.click();
  }
  function handlePickChange(e) {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
    e.target.value = '';
  }

  function onTouchStart(e, id) {
    const t = e.touches[0];
    startRef.current = { id, x: t.clientX, y: t.clientY, locked: null };
  }
  function onTouchMove(e, id) {
    const s = startRef.current;
    if (s.id !== id) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.locked == null && Math.abs(dx) + Math.abs(dy) > 8) {
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (s.locked === 'x') {
      // 左方向（負）にだけ追従。仕様書: 「左スワイプ → 削除確認」
      setSwipeOffset((prev) => ({ ...prev, [id]: Math.min(0, dx) }));
    }
  }
  async function onTouchEnd(e, id, entry) {
    const s = startRef.current;
    const off = swipeOffset[id] || 0;
    setSwipeOffset((prev) => ({ ...prev, [id]: 0 }));
    startRef.current = { id: null, x: 0, y: 0, locked: null };
    if (s.locked === 'x' && off < -80) {
      // 削除確認
      if (confirm(`「${entry.title}」を本棚から削除しますか？`)) {
        await onDeleteBook(id);
      }
    }
  }

  return (
    <div className="bookshelf">
      <header className="bookshelf-header">
        <div className="title">mkb-reader</div>
        <button
          type="button"
          className="pick-btn"
          onClick={handlePickClick}
          aria-label="ファイルを開く"
        >
          ＋ 開く
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mkb,.md,.markdown,.txt,.html,.htm,.json"
          onChange={handlePickChange}
          style={{ display: 'none' }}
        />
      </header>

      {error && <p className="bookshelf-error">エラー: {error}</p>}

      {loading ? (
        <p className="bookshelf-empty">読み込み中…</p>
      ) : books.length === 0 ? (
        <div className="bookshelf-empty">
          <p>本棚は空です</p>
          <p className="hint">右上の「＋ 開く」からファイルを選択してください</p>
          {onLoadSample && (
            <button type="button" className="text-sample" onClick={onLoadSample}>
              同梱のテスト用 mkb を開く
            </button>
          )}
        </div>
      ) : (
        <ul className="bookshelf-list">
          {books.map((b) => {
            const off = swipeOffset[b.id] || 0;
            const showDelete = off < -20;
            return (
              <li
                key={b.id}
                className="bookshelf-item-wrap"
              >
                {/* 削除ボタン（スワイプで露出） */}
                <div className="bookshelf-item-delete" aria-hidden={!showDelete}>
                  削除
                </div>
                <button
                  type="button"
                  className="bookshelf-item"
                  style={{ transform: `translateX(${off}px)` }}
                  onClick={() => off === 0 && onOpenBook(b)}
                  onTouchStart={(e) => onTouchStart(e, b.id)}
                  onTouchMove={(e) => onTouchMove(e, b.id)}
                  onTouchEnd={(e) => onTouchEnd(e, b.id, b)}
                >
                  <span className="bk-title">{b.title}</span>
                  <span className="bk-meta">
                    {b.author ? `${b.author} — ` : ''}
                    {fmtDate(b.addedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
