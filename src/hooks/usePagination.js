// 何を: CSS multi-column によるページ分割の状態管理
// なぜ: 仕様書 §4 - scrollWidth / viewportWidth でページ数算出、translateX でページ送り

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePagination({ frameRef, trackRef, enabled, deps, initialPage, onAdvance, onRetreat }) {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  // §26: 次の recalc で一度だけ適用するページ番号（適用後 null に戻す）
  const pendingInitialPageRef = useRef(null);
  // §31: チャプター境界コールバックを ref で保持（stale closure 回避）
  const onAdvanceRef = useRef(onAdvance);
  const onRetreatRef = useRef(onRetreat);
  useEffect(() => { onAdvanceRef.current = onAdvance; }, [onAdvance]);
  useEffect(() => { onRetreatRef.current = onRetreat; }, [onRetreat]);

  // ページ数再計算（リサイズ・コンテンツ変更時）
  const recalc = useCallback(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    if (!frame || !track) return;
    if (!enabled) {
      setTotal(1);
      setPage(0);
      return;
    }
    // 何を: ページ幅は track 自身の clientWidth（= frame の content box 幅）を採用
    // なぜ: frame に padding を持たせているため、frame.clientWidth は padding を含み
    //       column-width とずれる。track の幅を基準にするとステップ量が一致する
    const w = track.clientWidth;
    if (w <= 0) return;
    setPageWidth(w);
    track.style.columnWidth = `${w}px`;
    track.style.columnCount = 'auto';
    // レイアウト計算を強制
    // eslint-disable-next-line no-unused-expressions
    track.scrollWidth;
    const sw = track.scrollWidth;
    const t = Math.max(1, Math.ceil(sw / w));
    setTotal(t);
    // §26: pendingInitialPage があれば適用（最終ページへのフォールバック含む）
    if (pendingInitialPageRef.current !== null) {
      const target = Math.min(pendingInitialPageRef.current, t - 1);
      pendingInitialPageRef.current = null;
      setPage(target);
    } else {
      setPage((p) => Math.min(p, t - 1));
    }
  }, [frameRef, trackRef, enabled]);

  // ResizeObserver でフレームサイズ変更を監視
  useEffect(() => {
    if (!enabled) return;
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => {
      // 次フレームで再計算（反映待ち）
      requestAnimationFrame(recalc);
    });
    ro.observe(frame);
    // 初回
    requestAnimationFrame(recalc);
    return () => ro.disconnect();
  }, [enabled, frameRef, recalc]);

  // 依存が変わったら再計算（チャプター切替など）
  // 何を: フォントと画像の読み込みを待ってから再計算
  // なぜ: 仕様書 §13 — フォント変更・画像 load 後にページ数がずれる問題への対策
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const handles = [];
    const safeRecalc = () => { if (!cancelled) recalc(); };
    // 即時 + フォント完了待ち + 画像 load 待ち（タイムアウト 5 秒）
    handles.push(requestAnimationFrame(safeRecalc));
    handles.push(setTimeout(safeRecalc, 250));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(safeRecalc).catch(() => {});
    }
    const track = trackRef.current;
    if (track) {
      const imgs = Array.from(track.querySelectorAll('img'));
      const pending = imgs.filter((i) => !i.complete);
      if (pending.length) {
        const onLoad = () => safeRecalc();
        pending.forEach((i) => {
          i.addEventListener('load', onLoad, { once: true });
          i.addEventListener('error', onLoad, { once: true });
        });
        // タイムアウト
        const to = setTimeout(safeRecalc, 5000);
        handles.push(to);
      }
    }
    return () => {
      cancelled = true;
      handles.forEach((h) => {
        if (typeof h === 'number') { clearTimeout(h); cancelAnimationFrame(h); }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...(deps || [])]);

  // 何を: フォントが入れ替わったら再計算（仕様書 §13）
  // なぜ: useSettings.font の変更で <link> 差替→フォント再ロードが起きるため
  useEffect(() => {
    if (!enabled) return;
    if (!document.fonts || !document.fonts.addEventListener) return;
    function onChange() { recalc(); }
    document.fonts.addEventListener('loadingdone', onChange);
    return () => document.fonts.removeEventListener('loadingdone', onChange);
  }, [enabled, recalc]);

  // チャプター切替時はページ0へ戻す（§26: initialPage があれば次のrecalcで適用）
  useEffect(() => {
    pendingInitialPageRef.current = (initialPage != null && initialPage > 0) ? initialPage : null;
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...(deps || [])]);

  // translateX を track に反映
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (!enabled) {
      track.style.transform = 'none';
      return;
    }
    track.style.transform = `translateX(${-page * pageWidth}px)`;
  }, [enabled, page, pageWidth, trackRef]);

  // §31: 最終ページで next → onAdvance、先頭ページで prev → onRetreat
  const next = useCallback(() => {
    setPage((p) => {
      if (p >= total - 1) { onAdvanceRef.current?.(); return p; }
      return p + 1;
    });
  }, [total]);
  const prev = useCallback(() => {
    setPage((p) => {
      if (p <= 0) { onRetreatRef.current?.(); return p; }
      return p - 1;
    });
  }, []);

  return { page, total, next, prev, recalc, setPage };
}
