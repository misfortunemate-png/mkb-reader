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
import {
  parseMkbZip, parseImagesZip, zipHasMarkdown,
  buildSingleMdMkb, buildTxtMkb, revokeMkbAssets,
} from '../utils/mkbParser.js';

// 画像拡張子判定（§11 単体・複数画像）
const SINGLE_IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const IMG_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
};

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

  // 何を: File または File[] を受け取る
  // なぜ: 仕様書 §11 — 画像複数選択（input multiple）対応
  const loadFile = useCallback(async (fileOrFiles) => {
    if (!fileOrFiles) return;
    // 配列が来た場合: 全部画像なら ImageViewer、それ以外は先頭ファイルだけ採用
    if (Array.isArray(fileOrFiles) || fileOrFiles instanceof FileList) {
      const list = Array.from(fileOrFiles);
      if (list.length === 0) return;
      const allImg = list.every((f) => SINGLE_IMG_RE.test(f.name || ''));
      if (allImg && list.length >= 2) {
        setError(null); setLoading(true);
        try {
          // 自然順
          list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
          const images = list.map((f) => {
            const ext = (f.name.split('.').pop() || '').toLowerCase();
            const blob = f.type ? f : new Blob([f], { type: IMG_MIME[ext] || 'application/octet-stream' });
            return { name: f.name, url: URL.createObjectURL(blob) };
          });
          const result = {
            type: 'images',
            images,
            name: `${list.length} 枚の画像`,
          };
          revokeContent(prevRef.current);
          prevRef.current = result;
          setContent(result);
        } finally { setLoading(false); }
        return;
      }
      // 複数ファイルだが画像じゃない or 1枚だけ → 先頭ファイルだけ通常処理へ
      return loadFile(list[0]);
    }
    const file = fileOrFiles;
    setError(null);
    setLoading(true);
    try {
      const name = file.name || '';
      const lower = name.toLowerCase();
      let result; // ViewerContent
      if (lower.endsWith('.cbz')) {
        // §11: CBZ は無条件で画像 ZIP として扱う
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const data = await parseImagesZip(zip, name.replace(/\.[^.]+$/, ''));
        result = { type: 'images', images: data.images, name };
      } else if (lower.endsWith('.mkb') || lower.endsWith('.zip')) {
        // §11: ZIP は中身判定。MD があれば mkb、なければ画像 ZIP
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        if (zipHasMarkdown(zip)) {
          const mkb = await parseMkbZip(zip, name.replace(/\.[^.]+$/, ''));
          result = { type: 'mkb', data: mkb };
        } else {
          const data = await parseImagesZip(zip, name.replace(/\.[^.]+$/, ''));
          result = { type: 'images', images: data.images, name };
        }
      } else if (SINGLE_IMG_RE.test(lower)) {
        // §11: 単体画像
        const ext = (lower.split('.').pop() || '').toLowerCase();
        const blob = file.type ? file : new Blob([file], { type: IMG_MIME[ext] || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        result = { type: 'images', images: [{ name, url }], name };
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
        throw new Error('対応していない拡張子です（.mkb / .md / .txt / .html / .json / .cbz / 画像）');
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
