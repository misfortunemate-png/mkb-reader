// 何を: ファイル読み込みフック → ViewerContent を返す
// なぜ: Phase 3a §10〜§11 で対応フォーマットが拡張されるため、
//       App.jsx で型ごとに分岐できるよう ViewerContent で抽象化する。
//
// ViewerContent =
//   | { type: 'mkb',    data: MkbData }
//   | { type: 'html',   content: string, name: string }
//   | { type: 'json',   content: string, name: string }
//   | { type: 'images', images: ImageEntry[], name: string }   // §11 で追加
//
// 既存の `mkb` 名（戻り値）も後方互換のため残し、
// `data` フィールドが mkb 型のときだけ参照するよう App.jsx を更新する。

import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { parseMkbZip, buildSingleMdMkb, buildTxtMkb, revokeMkbAssets } from '../utils/mkbParser.js';

// 何を: 旧 mkb 用 Blob URL 解放（型問わず統一して呼べるように）
// なぜ: ViewerContent 切替時のメモリリーク防止
function revokeContent(c) {
  if (!c) return;
  if (c.type === 'mkb') revokeMkbAssets(c.data);
  if (c.type === 'images' && Array.isArray(c.images)) {
    for (const img of c.images) {
      try { if (img.url) URL.revokeObjectURL(img.url); } catch { /* ignore */ }
    }
  }
}

export function useMkbLoader() {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const prevRef = useRef(null);

  useEffect(() => () => revokeContent(prevRef.current), []);

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const name = file.name || '';
      const lower = name.toLowerCase();
      let result; // ViewerContent
      if (lower.endsWith('.mkb') || lower.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const mkb = await parseMkbZip(zip, name.replace(/\.[^.]+$/, ''));
        result = { type: 'mkb', data: mkb };
      } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
        const text = await file.text();
        result = { type: 'mkb', data: buildSingleMdMkb(text, name) };
      } else if (lower.endsWith('.txt')) {
        const text = await file.text();
        result = { type: 'mkb', data: buildTxtMkb(text, name) };
      } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        // §10: HTML はサンドボックス表示
        const text = await file.text();
        result = { type: 'html', content: text, name };
      } else if (lower.endsWith('.json')) {
        // §10: JSON は整形表示
        const text = await file.text();
        result = { type: 'json', content: text, name };
      } else {
        throw new Error('対応していない拡張子です（.mkb / .md / .txt / .html / .json）');
      }
      revokeContent(prevRef.current);
      prevRef.current = result;
      setContent(result);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromUrl = useCallback(async (url, displayName) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], displayName || url.split('/').pop() || 'file.mkb');
      await loadFile(file);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setLoading(false);
    }
  }, [loadFile]);

  // 何を: 後方互換エイリアス（旧 API 名 mkb は data を返す）
  const mkb = content?.type === 'mkb' ? content.data : null;

  return { content, mkb, error, loading, loadFile, loadFromUrl };
}
