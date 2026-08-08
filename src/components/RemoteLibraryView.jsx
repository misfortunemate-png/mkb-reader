// 何を: 書庫一覧UI（§36.1）+ 全文検索（§43）
// なぜ: 索引JSONから取得したファイル一覧を表示し、タップで既存読込パイプラインへ合流させる
//       §43: 書庫全文検索バーと結果表示を追加
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

// §43 キーワードを <mark> で強調するヘルパ
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlightText(text, query) {
  if (!query || !text) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i}>{part}</mark>
      : part
  );
}

export default function RemoteLibraryView({
  items, fetching, error, onRescan, onOpenItem,
  searchLibrary, searchResults, searching, searchError, onClearSearch,
}) {
  const [sortBy, setSortBy] = useState('mtime');
  const [sortDir, setSortDir] = useState('desc');
  const [filterText, setFilterText] = useState('');
  const [kindFilter, setKindFilter] = useState(null);
  // §43
  const [searchQuery, setSearchQuery] = useState('');
  const [includeMkb, setIncludeMkb] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState(new Set());

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

  function handleSearch() {
    if (!searchQuery.trim() || !searchLibrary) return;
    setExpandedPaths(new Set());
    searchLibrary(searchQuery.trim(), includeMkb);
  }

  function handleClearSearch() {
    setSearchQuery('');
    setExpandedPaths(new Set());
    onClearSearch?.();
  }

  function toggleExpanded(filePath) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }

  // §43 検索バー（常に表示）
  const searchBar = (
    <div className="library-search-bar">
      <input
        type="search"
        className="chat-filter-input"
        placeholder="書庫内を検索…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <label className="library-search-mkb">
        <input
          type="checkbox"
          checked={includeMkb}
          onChange={(e) => setIncludeMkb(e.target.checked)}
        />
        MKBも検索
      </label>
      <button
        type="button"
        className="sort-btn"
        onClick={handleSearch}
        disabled={searching || !searchQuery.trim()}
      >
        {searching ? '検索中…' : '🔍'}
      </button>
    </div>
  );

  // §43 検索結果表示（searchResults がある場合は通常一覧の代わりに表示）
  if (searchResults !== null) {
    return (
      <div>
        {searchBar}
        <div className="library-search-status">
          <button type="button" className="search-clear-btn" onClick={handleClearSearch}>
            ✕ 検索を解除
          </button>
          <span className="rw-hint">
            「{searchResults.query}」— {searchResults.results.length} ファイルにヒット
            （{searchResults.searchedFiles} / {searchResults.totalFiles} ファイル検索）
          </span>
        </div>
        {searchError && <p className="bookshelf-error" style={{ margin: '0.4rem 0.75rem' }}>{searchError}</p>}
        {searchResults.results.length === 0 ? (
          <p className="bookshelf-empty">一致する結果がありません</p>
        ) : (
          <ul className="search-results-list">
            {searchResults.results.map((result) => (
              <li key={result.path} className="search-result-card">
                <button
                  type="button"
                  className="search-result-header"
                  onClick={() => toggleExpanded(result.path)}
                >
                  <span>{KIND_ICON[result.kind] || '📁'}</span>
                  <span className="bk-title">{result.title}</span>
                  <span className="rw-hint" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {result.totalMatches} 件マッチ
                  </span>
                  <span>{expandedPaths.has(result.path) ? '▲' : '▼'}</span>
                </button>
                <span className="bk-meta" style={{ padding: '0 0.75rem 0.25rem', fontSize: '0.75em', opacity: 0.6, display: 'block' }}>
                  {result.path}
                </span>
                {expandedPaths.has(result.path) && (
                  <div className="search-result-detail">
                    {result.matches.map((m, idx) => (
                      <div key={idx} className="search-match-item">
                        <div className="search-match-meta">行 {m.lineNumber}</div>
                        <pre className="search-context">
                          {m.context.map((line, li) => {
                            const matchIdx = Math.min(m.lineNumber - 1, 2);
                            return (
                              <div key={li} className={li === matchIdx ? 'search-match-line' : ''}>
                                {highlightText(line, searchResults.query)}
                              </div>
                            );
                          })}
                        </pre>
                      </div>
                    ))}
                    {result.totalMatches > 10 && (
                      <p className="rw-hint" style={{ marginBottom: '0.5rem' }}>
                        他に {result.totalMatches - 10} 件のマッチ
                      </p>
                    )}
                    <button
                      type="button"
                      className="sort-btn"
                      style={{ marginBottom: '0.5rem' }}
                      onClick={() => onOpenItem({ path: result.path, kind: result.kind, title: result.title })}
                    >
                      このファイルを開く
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // 通常の書庫一覧
  if (fetching && items.length === 0) {
    return (
      <div>
        {searchBar}
        <p className="bookshelf-empty">書庫を読み込み中…</p>
      </div>
    );
  }

  // C-2: エラー時はメッセージ＋再試行ボタンを表示
  if (!fetching && items.length === 0 && error) {
    return (
      <div>
        {searchBar}
        <div className="bookshelf-empty">
          <p>書庫の読み込みに失敗しました</p>
          <p className="hint">{error}</p>
          {onRescan && (
            <button type="button" className="sort-btn" style={{ marginTop: '1rem' }} onClick={onRescan}>
              再試行
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!fetching && items.length === 0) {
    return (
      <div>
        {searchBar}
        <div className="bookshelf-empty">
          <p>書庫にファイルがありません</p>
          <p className="hint">LIBRARY_ROOT にファイルを追加してください</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* §43 検索バー */}
      {searchBar}
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
      {/* タイトルフィルタ */}
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
