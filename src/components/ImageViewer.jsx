// 何を: 1ページ1画像の画像ビューア（CBZ / 画像のみ ZIP / 画像複数選択 / 単体画像）
// なぜ: 仕様書 Phase 3a §11
//
// - 画像は 100vw × 100vh の枠内に object-fit: contain で配置
// - タップ: 右半分→次、左半分→前（インタラクティブ要素は素通し）
// - スワイプ: §7 設定（horizontal / vertical）に従う
// - キーボード: ←→ で前後
// - ピンチズーム: 二本指 / ダブルタップで等倍/フィット切替
// - ズーム中はスワイプ無効化

import { useCallback, useEffect, useRef, useState } from 'react';

export default function ImageViewer({ images, swipeDirection = 'horizontal' }) {
  const [page, setPage] = useState(0);
  const [active, setActive] = useState(true);
  // ズーム関連: scale と translate（CSS transform）
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const frameRef = useRef(null);

  const total = images.length;
  const next = useCallback(() => setPage((p) => Math.min(total - 1, p + 1)), [total]);
  const prev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);

  // ページ変更時にズームとパンをリセット
  useEffect(() => {
    setScale(1); setTx(0); setTy(0);
  }, [page]);

  // インジケーターのフェード
  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 1500);
    return () => clearTimeout(t);
  }, [page]);

  // キーボード操作
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // タッチ: スワイプ + ピンチ + ダブルタップ
  // 何を: ピンチ中（2本指）は scale を更新、1本指は移動量を測ってスワイプ判定
  // なぜ: 仕様書 §11 — ズーム中はスワイプによるページ送りを無効にする
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let startX = null, startY = null, startDist = null, startScale = 1;
    let lastTap = 0;

    function dist(t0, t1) {
      const dx = t0.clientX - t1.clientX, dy = t0.clientY - t1.clientY;
      return Math.hypot(dx, dy);
    }
    function onStart(e) {
      if (e.touches.length === 2) {
        startDist = dist(e.touches[0], e.touches[1]);
        startScale = scale;
        startX = startY = null;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
        // ダブルタップ判定
        const now = Date.now();
        if (now - lastTap < 280) {
          // toggle 等倍/フィット
          if (scale > 1.05) { setScale(1); setTx(0); setTy(0); }
          else { setScale(2); }
        }
        lastTap = now;
      }
    }
    function onMove(e) {
      if (e.touches.length === 2 && startDist) {
        const d = dist(e.touches[0], e.touches[1]);
        const s = Math.max(1, Math.min(5, startScale * (d / startDist)));
        setScale(s);
      }
    }
    function onEnd(e) {
      if (e.touches.length > 0) return;
      // ズーム中はスワイプ無効
      if (scale > 1.05) { startX = startY = startDist = null; return; }
      if (startX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (swipeDirection === 'vertical') {
        if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
          if (dy < 0) next(); else prev();
        }
      } else {
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) next(); else prev();
        }
      }
      startX = startY = startDist = null;
    }
    frame.addEventListener('touchstart', onStart, { passive: true });
    frame.addEventListener('touchmove', onMove, { passive: true });
    frame.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      frame.removeEventListener('touchstart', onStart);
      frame.removeEventListener('touchmove', onMove);
      frame.removeEventListener('touchend', onEnd);
    };
  }, [scale, swipeDirection, next, prev]);

  function handleFrameClick(e) {
    if (scale > 1.05) return; // ズーム中は無効
    const interactive = e.target.closest('a, button, input, textarea, select, label');
    if (interactive) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) prev(); else next();
  }

  if (!images || images.length === 0) {
    return <div className="image-empty">画像がありません</div>;
  }
  const cur = images[page];

  return (
    <>
      <div
        ref={frameRef}
        className="image-frame"
        onClick={handleFrameClick}
      >
        <img
          src={cur.url}
          alt={cur.name || ''}
          className="image-page"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          draggable="false"
        />
      </div>
      <div className={`page-indicator ${active ? '' : 'faded'}`}>
        {page + 1} / {total}
      </div>
    </>
  );
}
