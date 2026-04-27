// 何を: ファイル読み込みフック（.mkb / .md / .txt → MkbData）
// なぜ: 仕様書 §1 の読み込みロジックを App から切り離すため

import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { parseMkbZip, buildSingleMdMkb, buildTxtMkb, revokeMkbAssets } from '../utils/mkbParser.js';

export function useMkbLoader() {
  const [mkb, setMkb] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const prevMkbRef = useRef(null);

  // 古い mkb の Blob URL を破棄
  useEffect(() => {
    return () => {
      revokeMkbAssets(prevMkbRef.current);
    };
  }, []);

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const name = file.name || '';
      const lower = name.toLowerCase();
      let result;
      if (lower.endsWith('.mkb') || lower.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        result = await parseMkbZip(zip, name.replace(/\.[^.]+$/, ''));
      } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
        const text = await file.text();
        result = buildSingleMdMkb(text, name);
      } else if (lower.endsWith('.txt')) {
        const text = await file.text();
        result = buildTxtMkb(text, name);
      } else {
        throw new Error('対応していない拡張子です（.mkb / .md / .txt）');
      }
      // 古いリソース解放してから差し替え
      revokeMkbAssets(prevMkbRef.current);
      prevMkbRef.current = result;
      setMkb(result);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setMkb(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // URL 経由で fetch して読み込む（test.mkb の自動読み込み等に利用）
  const loadFromUrl = useCallback(async (url, displayName) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
      const blob = await res.blob();
      // Blob → File 化（name を持たせる）
      const file = new File([blob], displayName || url.split('/').pop() || 'file.mkb');
      await loadFile(file);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setLoading(false);
    }
  }, [loadFile]);

  return { mkb, error, loading, loadFile, loadFromUrl };
}
