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
  imageDisplayMode = 'balance',
  rewriteRules,
  rewriteHighlight = true,
  insertedAssetUrl,
  // §24 タップゾーン設定
  tapZone,
  showTapZoneOverlay = false,
  // §26 中断箇所の再開
  initialPage,
  initialScrollRatio,
  onPageChange,
  onScrollRatioChange,
  // §21 コンテキストメニュー（長押し検出 → 呼び出し元へ通知）
  onContextMenu,
  onInsertedAssetTap,
  // §30 縦書きモード（スクロール固定、writing-mode: vertical-rl）
  vertical = false,
  // §31 チャプター境界突破コールバック
  onChapterAdvance,
  onChapterRetreat,
}) {
  // §30: vertical モード時はページネーションを無効にしてスクロール固定
  const enabled = !vertical && mode === 'page';
  const frameRef = useRef(null);
  const trackRef = useRef(null);

  const { page, total, next, prev } = usePagination({
    frameRef,
    trackRef,
    enabled,
    deps: [chapter?.id, chapter?.content],
    initialPage,
    // §31: ページモード時のチャプター境界コールバック
    onAdvance: onChapterAdvance,
    onRetreat: onChapterRetreat,
  });

  // インジケーターのフェード（操作後一定時間表示）
  const [active, setActive] = useState(true);
  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 1500);
    return () => clearTimeout(t);
  }, [page, total, mode]);

  // §26 ページ変更を親に通知（debounce 500ms）
  const pageChangeTimerRef = useRef(null);
  useEffect(() => {
    if (!enabled || !onPageChange) return;
    if (pageChangeTimerRef.current) clearTimeout(pageChangeTimerRef.current);
    pageChangeTimerRef.current = setTimeout(() => onPageChange(page), 500);
    return () => clearTimeout(pageChangeTimerRef.current);
  }, [page, enabled, onPageChange]);

  // §26 スクロールモードの位置復元と保存
  useEffect(() => {
    if (enabled) return; // ページモード時は不要
    const frame = frameRef.current;
    if (!frame) return;
    // 初回マウント時にスクロール比率を復元
    if (initialScrollRatio != null && initialScrollRatio > 0) {
      requestAnimationFrame(() => {
        if (frame.scrollHeight > 0) {
          frame.scrollTop = frame.scrollHeight * initialScrollRatio;
        }
      });
    }
    // スクロール時に比率を通知（debounce 1000ms）
    if (!onScrollRatioChange) return;
    let timer = null;
    function onScroll() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const ratio = frame.scrollHeight > 0 ? frame.scrollTop / frame.scrollHeight : 0;
        onScrollRatioChange(ratio);
      }, 1000);
    }
    frame.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      frame.removeEventListener('scroll', onScroll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, initialScrollRatio, onScrollRatioChange]);

  // §31: スクロールモード／縦書きモードのチャプター境界突破
  // 何を: スクロール末尾/先頭でさらにスワイプしたとき次/前チャプターへ
  // なぜ: ページモードは usePagination の next/prev で処理済み。スクロール系は別途検知が必要
  useEffect(() => {
    if (enabled) return; // ページモードは usePagination 側で処理
    if (!onChapterAdvance && !onChapterRetreat) return;
    const frame = frameRef.current;
    if (!frame) return;

    let atEnd = false;
    let atStart = true;

    function updateEdgeState() {
      if (vertical) {
        // 縦書き: 横スクロール（scrollLeft は負またはゼロ、RTL）
        const sl = Math.abs(frame.scrollLeft);
        atStart = sl < 2;
        atEnd = sl + frame.clientWidth >= frame.scrollWidth - 2;
      } else {
        atStart = frame.scrollTop < 2;
        atEnd = frame.scrollTop + frame.clientHeight >= frame.scrollHeight - 2;
      }
    }

    let touchStartX = null;
    let touchStartY = null;

    function onScroll() { updateEdgeState(); }
    function onTouchStart(e) {
      updateEdgeState();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
    function onTouchEnd(e) {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      touchStartX = touchStartY = null;
      if (vertical) {
        // 縦書き: 横スワイプで判定（左スワイプ=前進、右スワイプ=後退）
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0 && atEnd) onChapterAdvance?.();
          if (dx > 0 && atStart) onChapterRetreat?.({ fromEnd: true });
        }
      } else {
        // スクロールモード: 縦スワイプで判定（上スワイプ=前進、下スワイプ=後退）
        if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
          if (dy < 0 && atEnd) onChapterAdvance?.();
          if (dy > 0 && atStart) onChapterRetreat?.({ fromEnd: true });
        }
      }
    }

    frame.addEventListener('scroll', onScroll, { passive: true });
    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      frame.removeEventListener('scroll', onScroll);
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, vertical, onChapterAdvance, onChapterRetreat, frameRef]);

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

  // §21 長押し検出（700ms、指移動 10px 以下でメニュー表示）
  // 設計:
  //   - タップゾーン内の長押しはページ送り操作の延長として扱いメニューを出さない
  //   - 指移動 10px 超はスワイプと見なしキャンセル
  //   - contextmenu イベントをキャンセルしてブラウザネイティブのテキスト選択メニューを抑制
  //   - onContextMenu が未設定（MD/txt 以外のフォーマット）ならセットアップしない
  useEffect(() => {
    if (!onContextMenu) return;
    const frame = frameRef.current;
    if (!frame) return;

    let timer = null;
    let sx = 0, sy = 0;

    function isInTapZone(cx, cy) {
      const rect = frame.getBoundingClientRect();
      const xPct = ((cx - rect.left) / rect.width) * 100;
      const preset = tapZone?.preset ?? 'bottom-corners';
      const h = tapZone?.height ?? 80;
      const w = tapZone?.width ?? 30;
      if (preset === 'fullpage') return true;
      if (preset === 'bottom-corners') {
        return cy > window.innerHeight - h && (xPct < w || xPct > 100 - w);
      }
      if (preset === 'sides') return xPct < w || xPct > 100 - w;
      return false;
    }

    function onTouchStart(e) {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      if (isInTapZone(sx, sy)) return; // タップゾーン内は長押しメニューなし
      timer = setTimeout(() => {
        onContextMenu({ target: e.target, x: sx, y: sy });
        timer = null;
      }, 700);
    }
    function onTouchMove(e) {
      if (timer == null) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) {
        clearTimeout(timer); timer = null; // 移動量が大きければスワイプ扱いでキャンセル
      }
    }
    function onTouchEnd() { clearTimeout(timer); timer = null; }
    // contextmenu イベント: ブラウザのネイティブメニュー（長押し選択UI）を抑制
    function onCtxMenu(e) {
      if (!isInTapZone(e.clientX, e.clientY)) e.preventDefault();
    }

    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchmove', onTouchMove, { passive: true });
    frame.addEventListener('touchend', onTouchEnd, { passive: true });
    frame.addEventListener('contextmenu', onCtxMenu, { passive: false });
    return () => {
      clearTimeout(timer);
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
      frame.removeEventListener('contextmenu', onCtxMenu);
    };
  }, [onContextMenu, tapZone]);

  // 何を: フレーム全体のクリックをハンドルし、tapZone 内のみページ送り、ゾーン外はスルー
  // なぜ: §24 — タップゾーン設定により本文エリアでネイティブ操作（テキスト選択・details展開・
  //       リンクタップ）を有効にする。overlay div を重ねると wikilinks クリックを横取りするため、
  //       フレーム全体を onClick で受けて座標で判定する方式を維持する
  function handleFrameClick(e) {
    if (!enabled) return;
    // インタラクティブ要素の上ならページ送りしない
    const interactive = e.target.closest('a, button, input, textarea, select, label, [role="button"]');
    if (interactive) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const xPct = (x / rect.width) * 100;
    const preset = tapZone?.preset ?? 'bottom-corners';
    const height = tapZone?.height ?? 80;
    const width = tapZone?.width ?? 30;

    if (preset === 'fullpage') {
      // 現行互換: 画面全体の左右半分
      if (x < rect.width / 2) prev(); else next();
    } else if (preset === 'bottom-corners') {
      // 画面下部かつ左右端のコーナーのみページ送り。それ以外はネイティブ挙動スルー
      const inBottom = e.clientY > window.innerHeight - height;
      const inCorner = xPct < width || xPct > 100 - width;
      if (inBottom && inCorner) {
        if (xPct < width) prev(); else next();
      }
      // ゾーン外はイベントを消費しない（return なし — onClick はキャプチャ済みだが
      // ネイティブの選択/details/リンクは pointerdown/click ハンドラで動く）
    } else if (preset === 'sides') {
      // 左右の縦帯内のみページ送り
      if (xPct < width) prev();
      else if (xPct > 100 - width) next();
    }
  }

  // §24 タップゾーンの半透明オーバーレイ（設定変更時の3秒間のみ表示）
  // なぜ: ユーザーが実際の領域を視覚的に確認できるようにする
  const tzPreset = tapZone?.preset ?? 'bottom-corners';
  const tzH = tapZone?.height ?? 80;
  const tzW = tapZone?.width ?? 30;
  const overlayBase = {
    position: 'fixed',
    background: 'var(--color-accent)',
    opacity: 0.15,
    pointerEvents: 'none',
    zIndex: 100,
    transition: 'opacity 0.3s',
  };

  return (
    <>
      <div
        ref={frameRef}
        className={`paginator-frame ${enabled ? '' : 'scroll-mode'}${vertical ? ' vertical-mode' : ''}`}
        onClick={handleFrameClick}
      >
        <div ref={trackRef} className="paginator-track">
          <MarkdownRenderer
            chapter={chapter}
            chapters={chapters}
            onWikiLinkClick={onWikiLinkClick}
            hrStyle={hrStyle}
            imageDisplayMode={imageDisplayMode}
            rewriteRules={rewriteRules}
            rewriteHighlight={rewriteHighlight}
            insertedAssetUrl={insertedAssetUrl}
            onInsertedAssetTap={onInsertedAssetTap}
            vertical={vertical}
          />
        </div>
      </div>
      {enabled && (
        <div className={`page-indicator ${active ? '' : 'faded'}`}>
          {page + 1} / {total}
        </div>
      )}
      {/* §24 タップゾーンオーバーレイ: 設定変更時の3秒間のみ表示 */}
      {enabled && showTapZoneOverlay && (
        <>
          {tzPreset === 'bottom-corners' && (
            <>
              <div style={{ ...overlayBase, bottom: 0, left: 0, width: `${tzW}%`, height: `${tzH}px` }} />
              <div style={{ ...overlayBase, bottom: 0, right: 0, width: `${tzW}%`, height: `${tzH}px` }} />
            </>
          )}
          {tzPreset === 'sides' && (
            <>
              <div style={{ ...overlayBase, top: 0, left: 0, width: `${tzW}%`, height: '100vh' }} />
              <div style={{ ...overlayBase, top: 0, right: 0, width: `${tzW}%`, height: '100vh' }} />
            </>
          )}
          {tzPreset === 'fullpage' && (
            <>
              <div style={{ ...overlayBase, top: 0, left: 0, width: '50%', height: '100vh' }} />
              <div style={{ ...overlayBase, top: 0, right: 0, width: '50%', height: '100vh' }} />
            </>
          )}
        </>
      )}
    </>
  );
}
