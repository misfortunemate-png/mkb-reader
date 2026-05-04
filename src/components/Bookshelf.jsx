// 何を: 本棚UI（§27 本格化: ソート・リネーム・タグ）
// なぜ: 仕様書 §27 — 日常使いに耐える本棚にする。安定IFのみに依存

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// §23 ファイルタイプ → 絵文字アイコン
const TYPE_ICON = {
  mkb: '📖', md: '📝', markdown: '📝', txt: '📄',
  json: '📋', html: '🌐', htm: '🌐',
  cbz: '🖼', zip: '🖼',
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', avif: '🖼',
  chat: '💬', vertical: '縦',
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

// §27 ソート: localStorage キー
const LS_SORT_BY  = 'bs-sort-by';
const LS_SORT_DIR = 'bs-sort-dir';

// §27 ソート基準ラベル
const SORT_OPTIONS = [
  { key: 'lastOpenedAt', label: '閲覧日' },
  { key: 'addedAt',      label: '追加日' },
  { key: 'title',        label: 'タイトル' },
];

export default function Bookshelf({
  books,
  loading,
  onPickFile,
  onOpenBook,
  onDeleteBook,
  onLoadSample,
  samples,
  onOpenChatImporter,
  error,
  // §27 新規props
  onRenameBook,       // (id, newTitle) => Promise<void>
  onAddTag,           // (id, tag) => Promise<void>
  onRemoveTag,        // (id, tag) => Promise<void>
  onCheckLibraryRefs, // (bookId) => Promise<string[]>  §28完成後にwire
  // §28 切り替えタブ
  shelfView,          // 'bookshelf' | 'library'
  onShelfViewChange,  // (view) => void
  // §32 表紙画像設定
  onSetCoverImage,    // (id, File) => Promise<void>
}) {
  const inputRef = useRef(null);
  // §32 表紙画像設定用
  const coverInputRef = useRef(null);
  const coverTargetIdRef = useRef(null);

  // §27 ソート状態（localStorage で永続化）
  const [sortBy, setSortBy]   = useState(() => localStorage.getItem(LS_SORT_BY)  || 'lastOpenedAt');
  const [sortDir, setSortDir] = useState(() => localStorage.getItem(LS_SORT_DIR) || 'desc');

  // §27 タグフィルタ
  const [activeTag, setActiveTag] = useState(null);

  // スワイプ削除
  const [swipeOffset, setSwipeOffset] = useState({});
  const startRef = useRef({ id: null, x: 0, y: 0, locked: null });

  // §27 アクションメニュー（長押し → メニュー表示）
  const [menuState, setMenuState] = useState(null); // { id, bookTitle } | null
  const longPressTimerRef = useRef(null);

  // §27 リネーム
  const [renaming, setRenaming] = useState(null); // { id, value } | null
  const renameInputRef = useRef(null);

  // §27 タグ追加
  const [tagging, setTagging] = useState(null); // { id, value } | null

  // §27 全タグ一覧（全BookEntryから動的に集計）
  const allTags = useMemo(() => {
    const set = new Set();
    books.forEach((b) => (b.tags || []).forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [books]);

  // §27 ソート + フィルタ済みリスト
  const displayBooks = useMemo(() => {
    let list = activeTag
      ? books.filter((b) => (b.tags || []).includes(activeTag))
      : [...books];

    list.sort((a, b) => {
      if (sortBy === 'title') {
        const cmp = (a.title || '').localeCompare(b.title || '', 'ja');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const va = (sortBy === 'addedAt' ? a.addedAt : a.lastOpenedAt) || 0;
      const vb = (sortBy === 'addedAt' ? b.addedAt : b.lastOpenedAt) || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return list;
  }, [books, sortBy, sortDir, activeTag]);

  // §32: displayBooks の coverImage ArrayBuffer → Blob URL マップ（メモリ管理付き）
  const [coverUrls, setCoverUrls] = useState(new Map());
  useEffect(() => {
    const newUrls = new Map();
    displayBooks.forEach((b) => {
      if (b.coverImage) newUrls.set(b.id, URL.createObjectURL(new Blob([b.coverImage])));
    });
    setCoverUrls(newUrls);
    return () => newUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [displayBooks]);

  // §27 ソート変更（localStorage に保存）
  function handleSortBy(key) {
    if (sortBy === key) {
      const next = sortDir === 'desc' ? 'asc' : 'desc';
      setSortDir(next);
      localStorage.setItem(LS_SORT_DIR, next);
    } else {
      setSortBy(key);
      setSortDir('desc');
      localStorage.setItem(LS_SORT_BY, key);
      localStorage.setItem(LS_SORT_DIR, 'desc');
    }
  }

  function handlePickClick() { inputRef.current?.click(); }
  function handlePickChange(e) {
    const files = e.target.files;
    if (files && files.length > 1) {
      onPickFile(Array.from(files));
    } else if (files && files[0]) {
      onPickFile(files[0]);
    }
    e.target.value = '';
  }

  // スワイプ削除
  function onTouchStart(e, id) {
    const t = e.touches[0];
    startRef.current = { id, x: t.clientX, y: t.clientY, locked: null };
    // 長押し開始
    longPressTimerRef.current = setTimeout(() => {
      startRef.current.longPressed = true;
      const book = books.find((b) => b.id === id);
      setMenuState({ id, bookTitle: book?.title || '' });
    }, 600);
  }
  function onTouchMove(e, id) {
    const s = startRef.current;
    if (s.id !== id) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // 少し動いたら長押しキャンセル
    if (Math.abs(dx) + Math.abs(dy) > 10) {
      clearTimeout(longPressTimerRef.current);
    }
    if (s.locked == null && Math.abs(dx) + Math.abs(dy) > 8) {
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (s.locked === 'x') {
      setSwipeOffset((prev) => ({ ...prev, [id]: Math.min(0, dx) }));
    }
  }
  async function onTouchEnd(e, id, entry) {
    clearTimeout(longPressTimerRef.current);
    const s = startRef.current;
    const off = swipeOffset[id] || 0;
    setSwipeOffset((prev) => ({ ...prev, [id]: 0 }));
    startRef.current = { id: null, x: 0, y: 0, locked: null };
    if (s.longPressed) return; // 長押しは onTouchStart で処理済み
    if (s.locked === 'x' && off < -80) {
      await handleDelete(id, entry);
    }
  }

  // §27+§28 削除（ライブラリ参照チェック付き）
  async function handleDelete(id, entry) {
    let warning = '';
    if (onCheckLibraryRefs) {
      try {
        const libs = await onCheckLibraryRefs(id);
        if (libs && libs.length > 0) {
          warning = `\nこのファイルはライブラリ「${libs.join('」「')}」でも使用されています。削除するとライブラリからも消えます。`;
        }
      } catch { /* ライブラリ未実装時は無視 */ }
    }
    if (confirm(`「${entry.title}」を本棚から削除しますか？${warning}`)) {
      await onDeleteBook(id);
    }
  }

  // §27 リネーム確定
  async function commitRename() {
    if (!renaming) return;
    const { id, value } = renaming;
    if (value.trim()) await onRenameBook?.(id, value);
    setRenaming(null);
  }

  // §27 タグ追加確定
  async function commitTag() {
    if (!tagging) return;
    const { id, value } = tagging;
    if (value.trim()) await onAddTag?.(id, value.trim());
    setTagging(null);
  }

  // メニューから操作
  async function handleMenuDelete(id, title) {
    setMenuState(null);
    const entry = books.find((b) => b.id === id);
    await handleDelete(id, entry || { title });
  }
  function handleMenuRename(id, title) {
    setMenuState(null);
    setRenaming({ id, value: title });
    // 次のレンダリング後にfocus
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }
  function handleMenuTag(id) {
    setMenuState(null);
    setTagging({ id, value: '' });
  }

  // §32: 表紙設定ファイル選択
  function handleCoverChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !coverTargetIdRef.current) return;
    onSetCoverImage?.(coverTargetIdRef.current, file);
    coverTargetIdRef.current = null;
  }
  function handleMenuSetCover(id) {
    setMenuState(null);
    coverTargetIdRef.current = id;
    coverInputRef.current?.click();
  }

  // §28 ライブラリタブがある場合のタブUI
  const showTabs = onShelfViewChange != null;

  return (
    <div className="bookshelf">
      <header className="bookshelf-header">
        <div className="title">mkb-reader</div>
        {onOpenChatImporter && (
          <button type="button" className="pick-btn" onClick={onOpenChatImporter}
            aria-label="チャットログ取り込み" title="チャットログ取り込み">
            💬 取込
          </button>
        )}
        <button type="button" className="pick-btn" onClick={handlePickClick} aria-label="ファイルを開く">
          ＋ 開く
        </button>
        <input ref={inputRef} type="file"
          accept=".mkb,.md,.markdown,.txt,.html,.htm,.json,.cbz,.zip,.jpg,.jpeg,.png,.gif,.webp,.avif"
          multiple onChange={handlePickChange} style={{ display: 'none' }} />
        {/* §32 表紙設定用ファイル入力 */}
        <input ref={coverInputRef} type="file" accept="image/*"
          onChange={handleCoverChange} style={{ display: 'none' }} />
      </header>

      {/* §28 本棚/ライブラリ切り替えタブ */}
      {showTabs && (
        <div className="shelf-tabs">
          <button
            type="button"
            className={`shelf-tab ${shelfView === 'bookshelf' ? 'active' : ''}`}
            onClick={() => onShelfViewChange('bookshelf')}
          >本棚</button>
          <button
            type="button"
            className={`shelf-tab ${shelfView === 'library' ? 'active' : ''}`}
            onClick={() => onShelfViewChange('library')}
          >ライブラリ</button>
        </div>
      )}

      {/* §27 ソートバー */}
      <div className="sort-bar">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`sort-btn ${sortBy === opt.key ? 'active' : ''}`}
            onClick={() => handleSortBy(opt.key)}
          >
            {opt.label}
            {sortBy === opt.key && (
              <span className="sort-dir">{sortDir === 'desc' ? '↓' : '↑'}</span>
            )}
          </button>
        ))}
      </div>

      {/* §27 タグフィルタバー */}
      {allTags.length > 0 && (
        <div className="tag-filter-bar">
          <button
            type="button"
            className={`tag-chip ${activeTag == null ? 'active' : ''}`}
            onClick={() => setActiveTag(null)}
          >すべて</button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-chip ${activeTag === tag ? 'active' : ''}`}
              onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
            >{tag}</button>
          ))}
        </div>
      )}

      {error && <p className="bookshelf-error">エラー: {error}</p>}

      {loading ? (
        <p className="bookshelf-empty">読み込み中…</p>
      ) : displayBooks.length === 0 ? (
        <div className="bookshelf-empty">
          {activeTag ? (
            <p>タグ「{activeTag}」の本はありません</p>
          ) : (
            <>
              <p>本棚は空です</p>
              <p className="hint">右上の「＋ 開く」からファイルを選択してください</p>
              {samples && samples.length > 0 && (
                <>
                  <p className="hint" style={{ marginTop: '1rem' }}>または同梱のテスト用ファイルを開く:</p>
                  <ul className="sample-list">
                    {samples.map((s) => (
                      <li key={s.url}>
                        <button type="button" className="text-sample"
                          onClick={() => onLoadSample?.(s.url, s.name, s.kind)}>
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="bookshelf-list">
            {displayBooks.map((b) => {
              const off = swipeOffset[b.id] || 0;
              const showDelete = off < -20;
              const isRenaming = renaming?.id === b.id;
              const isTagging  = tagging?.id  === b.id;

              return (
                <li key={b.id} className="bookshelf-item-wrap">
                  {/* 削除ボタン（スワイプで露出） */}
                  <div className="bookshelf-item-delete" aria-hidden={!showDelete}>削除</div>

                  <button
                    type="button"
                    className="bookshelf-item"
                    style={{ transform: `translateX(${off}px)` }}
                    onClick={() => off === 0 && !isRenaming && !isTagging && onOpenBook(b)}
                    onTouchStart={(e) => onTouchStart(e, b.id)}
                    onTouchMove={(e) => onTouchMove(e, b.id)}
                    onTouchEnd={(e) => onTouchEnd(e, b.id, b)}
                  >
                    {/* §32 表紙サムネイル（なければアイコン） */}
                    <div className="bk-cover">
                      {coverUrls.get(b.id)
                        ? <img src={coverUrls.get(b.id)} alt="" />
                        : <span className="bk-icon">{fileIcon(b)}</span>
                      }
                    </div>
                    <span className="bk-title">
                      {/* §27 リネーム中はインライン入力 */}
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          className="rename-input"
                          value={renaming.value}
                          onChange={(e) => setRenaming((s) => ({ ...s, value: e.target.value }))}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        b.title
                      )}
                    </span>
                    <span className="bk-meta">
                      {[
                        b.author || null,
                        b.charCount ? `${b.charCount.toLocaleString('ja')}字` : null,
                        (relativeDate(b.lastOpenedAt) || relativeDate(b.addedAt))
                          ? `最終閲覧 ${relativeDate(b.lastOpenedAt) || relativeDate(b.addedAt)}`
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                    {/* §27 タグ表示 */}
                    {(b.tags || []).length > 0 && (
                      <span className="bk-tags">
                        {b.tags.map((tag) => (
                          <span key={tag} className="bk-tag">{tag}</span>
                        ))}
                      </span>
                    )}
                    {/* §27 タグ追加中はインライン入力 */}
                    {isTagging && (
                      <span className="bk-tag-input-wrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="tag-input"
                          placeholder="タグ名"
                          value={tagging.value}
                          onChange={(e) => setTagging((s) => ({ ...s, value: e.target.value }))}
                          onBlur={commitTag}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitTag();
                            if (e.key === 'Escape') setTagging(null);
                          }}
                          autoFocus
                        />
                      </span>
                    )}
                  </button>

                  {/* §27 「…」メニューボタン（タッチデバイス向けの長押し代替） */}
                  <button
                    type="button"
                    className="bk-menu-btn"
                    aria-label="メニュー"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuState((prev) => prev?.id === b.id ? null : { id: b.id, bookTitle: b.title });
                    }}
                  >…</button>
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
                    <button type="button" className="text-sample"
                      onClick={() => onLoadSample?.(s.url, s.name, s.kind)}>
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* §27 アクションメニュー（長押し or … ボタン） */}
      {menuState && (() => {
        const book = books.find((b) => b.id === menuState.id);
        return (
          <div className="bk-menu-overlay" onClick={() => setMenuState(null)}>
            <div className="bk-menu" onClick={(e) => e.stopPropagation()}>
              <p className="bk-menu-title">{menuState.bookTitle}</p>
              <button type="button" className="bk-menu-item"
                onClick={() => handleMenuRename(menuState.id, menuState.bookTitle)}>
                名前を変更
              </button>
              <button type="button" className="bk-menu-item"
                onClick={() => handleMenuTag(menuState.id)}>
                タグを追加
              </button>
              {/* §32 表紙設定 */}
              {onSetCoverImage && (
                <button type="button" className="bk-menu-item"
                  onClick={() => handleMenuSetCover(menuState.id)}>
                  表紙を設定
                </button>
              )}
              {(book?.tags || []).length > 0 && (
                <div className="bk-menu-tags">
                  {book.tags.map((tag) => (
                    <button key={tag} type="button" className="bk-menu-tag-remove"
                      onClick={async () => {
                        await onRemoveTag?.(menuState.id, tag);
                        setMenuState(null);
                      }}>
                      {tag} ✕
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="bk-menu-item danger"
                onClick={() => handleMenuDelete(menuState.id, menuState.bookTitle)}>
                削除
              </button>
              <button type="button" className="bk-menu-item secondary"
                onClick={() => setMenuState(null)}>
                キャンセル
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
