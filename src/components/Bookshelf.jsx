// 何を: 本棚UI（仮実装・差替前提）
// なぜ: 仕様書 §8 — 装飾に凝らず、useBookshelf の安定IFだけに依存させ、
//       将来「特別感のあるUI」へ全面差替できる構造にしておく

import { useRef, useState } from 'react';

// §23 ファイルタイプ → 絵文字アイコン
const TYPE_ICON = {
  mkb: '📖', md: '📝', markdown: '📝', txt: '📄',
  json: '📋', html: '🌐', htm: '🌐',
  cbz: '🖼', zip: '🖼',
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', avif: '🖼',
  chat: '💬',
};
function fileIcon(entry) {
  return TYPE_ICON[entry?.fileType] || TYPE_ICON[entry?.format] || '📄';
}

// §23 最終閲覧日の相対表示
const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
function relativeDate(ts) {
  if (!ts) return '';
  const diffMs = ts - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffH = Math.round(diffMin / 60);
  const diffD = Math.round(diffH / 24);
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffH) < 24) return rtf.format(diffH, 'hour');
  if (Math.abs(diffD) < 30) return rtf.format(diffD, 'day');
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function Bookshelf({
  books,
  loading,
  onPickFile,        // (File) => void: 端末からファイルを選択
  onOpenBook,        // (BookEntry) => void: 保存済みを開く
  onDeleteBook,      // (id) => Promise<void>
  onLoadSample,      // (url, displayName) => void: 同梱サンプルを開く（任意）
  samples,           // [{ label, url, name }] 同梱サンプル一覧（任意）
  onOpenChatImporter,// () => void: §18 チャットログ取り込み画面へ（任意）
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
    // 何を: 複数選択時は配列で渡す（仕様書 §11 — 画像複数選択 → 画像ビューア）
    // なぜ: useMkbLoader.loadFile が File[] / FileList を扱えるよう拡張済み
    const files = e.target.files;
    if (files && files.length > 1) {
      onPickFile(Array.from(files));
    } else if (files && files[0]) {
      onPickFile(files[0]);
    }
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
        {onOpenChatImporter && (
          <button
            type="button"
            className="pick-btn"
            onClick={onOpenChatImporter}
            aria-label="チャットログ取り込み"
            title="チャットログ取り込み"
          >
            💬 取込
          </button>
        )}
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
          accept=".mkb,.md,.markdown,.txt,.html,.htm,.json,.cbz,.zip,.jpg,.jpeg,.png,.gif,.webp,.avif"
          multiple
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
          {samples && samples.length > 0 && (
            <>
              <p className="hint" style={{ marginTop: '1rem' }}>または同梱のテスト用ファイルを開く:</p>
              <ul className="sample-list">
                {samples.map((s) => (
                  <li key={s.url}>
                    <button
                      type="button"
                      className="text-sample"
                      onClick={() => onLoadSample?.(s.url, s.name, s.kind)}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <>
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
                  <span className="bk-title">
                    <span className="bk-icon">{fileIcon(b)}</span>
                    {b.title}
                  </span>
                  <span className="bk-meta">
                    {b.author ? `${b.author} — ` : ''}
                    {relativeDate(b.lastOpenedAt) || relativeDate(b.addedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {samples && samples.length > 0 && (
          <div className="bookshelf-samples">
            <p className="hint">同梱のテスト用ファイル:</p>
            <ul>
              {samples.map((s) => (
                <li key={s.url}>
                  <button
                    type="button"
                    className="text-sample"
                    onClick={() => onLoadSample?.(s.url, s.name, s.kind)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
      )}
    </div>
  );
}
