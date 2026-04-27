// 何を: CSS multi-column によるページ分割の状態管理
// なぜ: 仕様書 §4 - scrollWidth / viewportWidth でページ数算出、translateX でページ送り

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePagination({ frameRef, trackRef, enabled, deps }) {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);

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
    setPage((p) => Math.min(p, t - 1));
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
  useEffect(() => {
    if (!enabled) return;
    // 画像ロード完了後にも再計算したいので少し待つ
    const t1 = requestAnimationFrame(recalc);
    const t2 = setTimeout(recalc, 250);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...(deps || [])]);

  // チャプター切替時はページ0へ戻す
  useEffect(() => {
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

  const next = useCallback(() => setPage((p) => Math.min(total - 1, p + 1)), [total]);
  const prev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);

  return { page, total, next, prev, recalc, setPage };
}
