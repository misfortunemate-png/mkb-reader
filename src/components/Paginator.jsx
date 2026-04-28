// 何を: ページネーションコンテナ
// なぜ: 仕様書 §4 - MarkdownRenderer をラップし、CSS multi-column + タップ/スワイプ/キーボードで送る

import { useEffect, useRef, useState } from 'react';
import { usePagination } from '../hooks/usePagination.js';
import MarkdownRenderer from './MarkdownRenderer.jsx';

export default function Paginator({
  chapter,
  chapters,
  onWikiLinkClick,
  mode,
  swipeDirection = 'horizontal',
  hrStyle = 'page-break',
}) {
  const enabled = mode === 'page';
  const frameRef = useRef(null);
  const trackRef = useRef(null);

  const { page, total, next, prev } = usePagination({
    frameRef,
    trackRef,
    enabled,
    deps: [chapter?.id, chapter?.content],
  });

  // インジケーターのフェード（操作後一定時間表示）
  const [active, setActive] = useState(true);
  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 1500);
    return () => clearTimeout(t);
  }, [page, total, mode]);

  // キーボード操作（仕様書 §4）
  useEffect(() => {
    if (!enabled) return;
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, next, prev]);

  // スワイプ操作（touchstart/touchend の deltaX。閾値50px）
  useEffect(() => {
    if (!enabled) return;
    const frame = frameRef.current;
    if (!frame) return;
    let startX = null;
    let startY = null;
    function onStart(e) {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    }
    function onEnd(e) {
      if (startX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // 何を: スワイプ方向設定で X/Y を出し分け
      // なぜ: 仕様書 §7 — 左右/上下のトグル
      if (swipeDirection === 'vertical') {
        if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
          if (dy < 0) next(); else prev();
        }
      } else {
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) next(); else prev();
        }
      }
      startX = startY = null;
    }
    frame.addEventListener('touchstart', onStart, { passive: true });
    frame.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      frame.removeEventListener('touchstart', onStart);
      frame.removeEventListener('touchend', onEnd);
    };
  }, [enabled, next, prev, swipeDirection]);

  return (
    <>
      <div
        ref={frameRef}
        className={`paginator-frame ${enabled ? '' : 'scroll-mode'}`}
      >
        {enabled && (
          <>
            {/* タップ領域: 左半分→前ページ / 右半分→次ページ */}
            <div className="tap-zone left" onClick={prev} aria-label="前のページ" />
            <div className="tap-zone right" onClick={next} aria-label="次のページ" />
          </>
        )}
        <div ref={trackRef} className="paginator-track">
          <MarkdownRenderer
            chapter={chapter}
            chapters={chapters}
            onWikiLinkClick={onWikiLinkClick}
            hrStyle={hrStyle}
          />
        </div>
      </div>
      {enabled && (
        <div className={`page-indicator ${active ? '' : 'faded'}`}>
          {page + 1} / {total}
        </div>
      )}
    </>
  );
}
