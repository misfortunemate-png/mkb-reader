// 何を: チャプター一覧ナビ（モバイル: ドロワー / デスクトップ: 左サイドバー）
// なぜ: 仕様書 §3

import { useEffect } from 'react';

export default function ChapterNav({
  metadata,
  chapters,
  currentId,
  onSelect,
  open,
  onClose,
}) {
  // モバイルでドロワーが開いている間は body スクロールロック
  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div
        className={`chapter-nav-overlay ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`chapter-nav ${open ? 'open' : ''}`} aria-label="チャプター">
        <div className="nav-header">
          {metadata?.title || 'MarkBook'}
          {metadata?.author && (
            <div className="text-xs font-normal text-[var(--color-text-secondary)] mt-1">
              {metadata.author}
            </div>
          )}
        </div>
        <ul className="nav-list">
          {chapters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === currentId ? 'active' : ''}
                onClick={() => {
                  onSelect(c.id);
                  onClose?.();
                }}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
