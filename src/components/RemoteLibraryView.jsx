// 何を: 書庫一覧UI（§36.1）
// なぜ: 索引JSONから取得したファイル一覧を表示し、タップで既存読込パイプラインへ合流させる
import { useMemo, useState } from 'react';

const KIND_ICON = {
  mkb: '📖', md: '📝', text: '📄', pdf: '📕',
  epub: '📗', html: '🌐', json: '📋',
  cbz: '🖼', image: '🖼', video: '🎬', other: '📁',
};

const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
function relDate(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.round(ms / 86400000);
  if (Math.abs(d) < 1) return '今日';
  if (Math.abs(d) < 30) return rtf.format(d, 'day');
  const dt = new Date(iso);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const SORT_OPTIONS = [
  { key: 'mtime', label: '更新日' },
  { key: 'title', label: 'タイトル' },
  { key: 'kind', label: '種別' },
];

export default function RemoteLibraryView({ items, fetching, error, onRescan, onOpenItem }) {
  const [sortBy, setSortBy] = useState('mtime');
  const [sortDir, setSortDir] = useState('desc');
  const [filterText, setFilterText] = useState('');
  const [kindFilter, setKindFilter] = useState(null);

  const allKinds = useMemo(() => {
    const set = new Set(items.map((f) => f.kind));
    return [...set].sort();
  }, [items]);

  const displayItems = useMemo(() => {
    let list = items;
    if (kindFilter) list = list.filter((f) => f.kind === kindFilter);
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'title') cmp = (a.title || '').localeCompare(b.title || '', 'ja');
      else if (sortBy === 'kind') cmp = (a.kind || '').localeCompare(b.kind || '');
      else cmp = (a.mtime || '') < (b.mtime || '') ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [items, filterText, kindFilter, sortBy, sortDir]);

  function handleSort(key) {
    if (sortBy === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  }

  if (fetching && items.length === 0) {
    return <p className="bookshelf-empty">書庫を読み込み中…</p>;
  }

  // C-2: エラー時はメッセージ＋再試行ボタンを表示
  if (!fetching && items.length === 0 && error) {
    return (
      <div className="bookshelf-empty">
        <p>書庫の読み込みに失敗しました</p>
        <p className="hint">{error}</p>
        {onRescan && (
          <button type="button" className="sort-btn" style={{ marginTop: '1rem' }} onClick={onRescan}>
            再試行
          </button>
        )}
      </div>
    );
  }

  if (!fetching && items.length === 0) {
    return (
      <div className="bookshelf-empty">
        <p>書庫にファイルがありません</p>
        <p className="hint">LIBRARY_ROOT にファイルを追加してください</p>
      </div>
    );
  }

  return (
    <div>
      {/* ソートバー */}
      <div className="sort-bar">
        {SORT_OPTIONS.map((opt) => (
          <button key={opt.key} type="button"
            className={`sort-btn ${sortBy === opt.key ? 'active' : ''}`}
            onClick={() => handleSort(opt.key)}
          >
            {opt.label}
            {sortBy === opt.key && <span className="sort-dir">{sortDir === 'desc' ? '↓' : '↑'}</span>}
          </button>
        ))}
      </div>
      {/* 種別フィルタ */}
      {allKinds.length > 1 && (
        <div className="tag-filter-bar">
          <button type="button"
            className={`tag-chip ${kindFilter == null ? 'active' : ''}`}
            onClick={() => setKindFilter(null)}>すべて</button>
          {allKinds.map((k) => (
            <button key={k} type="button"
              className={`tag-chip ${kindFilter === k ? 'active' : ''}`}
              onClick={() => setKindFilter((prev) => prev === k ? null : k)}>
              {KIND_ICON[k] || '📁'} {k}
            </button>
          ))}
        </div>
      )}
      {/* 検索 */}
      <div className="chat-filter">
        <input type="search" className="chat-filter-input"
          placeholder="タイトルで絞り込み…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)} />
        {filterText && (
          <span className="rw-hint" style={{ marginLeft: '0.5rem' }}>
            {displayItems.length} 件表示
          </span>
        )}
      </div>
      {/* ファイル一覧 */}
      <ul className="bookshelf-list">
        {displayItems.map((item) => (
          <li key={item.path} className="bookshelf-item-wrap">
            <button type="button" className="bookshelf-item"
              onClick={() => onOpenItem(item)}>
              <div className="bk-cover">
                <span className="bk-icon">{KIND_ICON[item.kind] || '📁'}</span>
              </div>
              <span className="bk-title">{item.title}</span>
              <span className="bk-meta">
                {[
                  item.meta?.tags?.length ? item.meta.tags.join(' · ') : null,
                  fmtSize(item.size),
                  item.mtime ? `更新 ${relDate(item.mtime)}` : null,
                ].filter(Boolean).join(' · ')}
              </span>
              {item.path !== item.title && (
                <span className="bk-meta" style={{ fontSize: '0.75em', opacity: 0.6 }}>
                  {item.path}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
