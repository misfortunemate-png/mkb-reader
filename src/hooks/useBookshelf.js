// 何を: 本棚（IndexedDB の books ストア）の CRUD フック
// なぜ: 仕様書 §8 — 開いたファイルを保存しオフラインで再度開けるようにする
//
// 【安定IF・差替不可】このファイルの export しているフックの戻り値（saveBook,
// getBook, getAllBooks, deleteBook, updateLastOpened）と BookEntry 型は
// 「将来 Bookshelf.jsx を全面差替しても変えない」契約として固定する。
// ビューア本体（§1〜§4）と本棚UIの結合点はこのインターフェースのみ。

import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { resizeImage, resizeImagesInZip } from './useImageResize.js';

const DB_NAME = 'mkb-reader';
const DB_VERSION = 1;
const STORE = 'books';

// 何を: IndexedDB を開く（必要ならスキーマを upgrade）
// なぜ: 仕様書 §8 の DB 設計（DB名, ストア名, キー id, インデックス lastOpenedAt）
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}
function awaitReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function useBookshelf() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  // §12 リサイズ進捗（保存中のファイルのみ。null = 進行中なし）
  const [resizeProgress, setResizeProgress] = useState(null);
  const dbRef = useRef(null);

  const refresh = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    // 何を: lastOpenedAt 降順で全件取得
    // なぜ: 仕様書 §8 — 直近に読んだものを上に並べる
    const list = await awaitReq(tx(db, 'readonly').getAll());
    list.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
    setBooks(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDb();
        if (cancelled) { db.close(); return; }
        dbRef.current = db;
        await refresh();
      } catch (e) {
        console.error('IndexedDB open failed:', e);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; dbRef.current?.close(); };
  }, [refresh]);

  // ───── 安定IF（差替不可） ─────

  // 何を: BookEntry を保存する。保存前に画像リサイズを適用
  // なぜ: 仕様書 §12 — 長辺 2048px 超を縮める。mkb/cbz/zip は ZIP 展開→各画像処理→再ZIP化、
  //       単体画像は単純にリサイズ。閲覧のみの画像（ImageViewer の File[]）は本棚保存しない経路。
  const saveBook = useCallback(async (entry) => {
    const db = dbRef.current; if (!db) throw new Error('db not ready');
    try {
      const e = { ...entry };
      const t = e.fileType;
      if (t === 'mkb' || t === 'cbz' || t === 'zip') {
        // ZIP を展開して内部画像を順にリサイズ
        const zip = await JSZip.loadAsync(e.fileData);
        const total = zip.file(/\.(jpe?g|png|gif|webp|avif|bmp)$/i).length;
        if (total > 0) {
          setResizeProgress({ done: 0, total });
          await resizeImagesInZip(zip, (done, t, name) => {
            setResizeProgress({ done, total: t, current: name });
          });
          // 再 ZIP 化
          const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
          e.fileData = buf;
        }
      } else if (['jpg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(t)) {
        // 単体画像
        const mime = MIME_BY_TYPE[t] || 'image/png';
        const inputBlob = new Blob([e.fileData], { type: mime });
        setResizeProgress({ done: 0, total: 1 });
        const out = await resizeImage(inputBlob);
        e.fileData = await out.arrayBuffer();
        setResizeProgress({ done: 1, total: 1 });
      }
      await awaitReq(tx(db, 'readwrite').put(e));
      await refresh();
    } finally {
      setResizeProgress(null);
    }
  }, [refresh]);

  const getBook = useCallback(async (id) => {
    const db = dbRef.current; if (!db) return null;
    return (await awaitReq(tx(db, 'readonly').get(id))) || null;
  }, []);

  const getAllBooks = useCallback(async () => {
    const db = dbRef.current; if (!db) return [];
    const list = await awaitReq(tx(db, 'readonly').getAll());
    list.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
    return list;
  }, []);

  const deleteBook = useCallback(async (id) => {
    const db = dbRef.current; if (!db) return;
    await awaitReq(tx(db, 'readwrite').delete(id));
    await refresh();
  }, [refresh]);

  // 何を: 本棚の全エントリーを削除
  // なぜ: 設計思想に反するが、検証中の利便性のため設定から呼ぶ。
  //   呼び出し側で confirm() を入れる責務（誤操作防止）
  const deleteAllBooks = useCallback(async () => {
    const db = dbRef.current; if (!db) return;
    await awaitReq(tx(db, 'readwrite').clear());
    await refresh();
  }, [refresh]);

  const updateLastOpened = useCallback(async (id) => {
    const db = dbRef.current; if (!db) return;
    const store = tx(db, 'readwrite');
    const entry = await awaitReq(store.get(id));
    if (!entry) return;
    entry.lastOpenedAt = Date.now();
    await awaitReq(store.put(entry));
    await refresh();
  }, [refresh]);

  // ───── ヘルパ（書庫UIから扱いやすく） ─────

  // 同タイトルの既存エントリ検索（上書き判定用）
  const findByTitle = useCallback(async (title) => {
    const db = dbRef.current; if (!db) return null;
    const list = await awaitReq(tx(db, 'readonly').getAll());
    return list.find((b) => b.title === title) || null;
  }, []);

  // 何を: ローカル設定の取得
  // なぜ: 仕様書 Phase 3a §4.6 — 本ごとの上書き設定を BookEntry.localSettings に保存
  const getLocalSettings = useCallback(async (id) => {
    const db = dbRef.current; if (!db || !id) return null;
    const entry = await awaitReq(tx(db, 'readonly').get(id));
    return entry?.localSettings || null;
  }, []);

  // 何を: ローカル設定の保存（null を渡すと削除）
  // なぜ: useSettings から「グローバルに戻す」を呼べるように null も受ける
  const saveLocalSettings = useCallback(async (id, ls) => {
    const db = dbRef.current; if (!db || !id) return;
    const store = tx(db, 'readwrite');
    const entry = await awaitReq(store.get(id));
    if (!entry) return;
    if (ls === null || ls === undefined) {
      delete entry.localSettings;
    } else {
      entry.localSettings = ls;
    }
    await awaitReq(store.put(entry));
    await refresh();
  }, [refresh]);

  // §26 中断箇所の保存
  // なぜ: localSettings.lastPosition のみを更新する。display/rewrite は一切触れない。
  //   読書中のページ送りのたびに呼ばれるため refresh() は呼ばない（再描画コスト回避）
  const saveLastPosition = useCallback(async (bookId, position) => {
    const db = dbRef.current; if (!db || !bookId) return;
    try {
      const entry = await awaitReq(tx(db, 'readonly').get(bookId));
      if (!entry) return;
      const ls = entry.localSettings || {};
      await awaitReq(tx(db, 'readwrite').put({ ...entry, localSettings: { ...ls, lastPosition: position } }));
    } catch (e) {
      console.error('saveLastPosition failed:', e);
    }
  }, []);

  return {
    books,
    loading,
    saveBook,
    getBook,
    getAllBooks,
    deleteBook,
    deleteAllBooks,
    updateLastOpened,
    findByTitle,
    getLocalSettings,
    saveLocalSettings,
    saveLastPosition,
    refresh,
    resizeProgress,
  };
}

// 何を: ファイル拡張子 → fileType を決める（拡張: §11）
// なぜ: 本棚は ArrayBuffer + 拡張子情報で保存する。元ファイル名の拡張子も復元時に必要
const TYPE_BY_EXT = {
  mkb: 'mkb', zip: 'zip', cbz: 'cbz',
  md: 'md', markdown: 'md', txt: 'txt',
  html: 'html', htm: 'html', json: 'json',
  jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', avif: 'avif',
};
const MIME_BY_TYPE = {
  mkb: 'application/zip', zip: 'application/zip', cbz: 'application/zip',
  md: 'text/markdown', txt: 'text/plain',
  html: 'text/html', json: 'application/json',
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
};

// 何を: File → BookEntry へ変換
// なぜ: 仕様書 §8 — 開いたファイルを ArrayBuffer + メタデータで保存する。
//       Phase 3a §11 で対応拡張子が増えたため fileType の判定を拡張
export async function fileToBookEntry(file, mkbMetadata) {
  const name = file.name || 'untitled';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const fileType = TYPE_BY_EXT[ext] || 'md';
  const fileData = await file.arrayBuffer();
  const baseTitle = name.replace(/\.[^.]+$/, '');
  return {
    id: crypto.randomUUID(),
    title: mkbMetadata?.title || baseTitle,
    author: mkbMetadata?.author || '',
    fileType,
    fileData,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
    // localSettings は Phase 3a §4.6 で予約フィールドとして追加
    localSettings: undefined,
  };
}

// BookEntry → File（ビューアに渡すため）
export function bookEntryToFile(entry) {
  const ext = entry.fileType || 'md';
  const safeName = (entry.title || 'untitled').replace(/[\\/:*?"<>|]/g, '_');
  const name = `${safeName}.${ext === 'jpg' ? 'jpg' : ext}`;
  const mime = MIME_BY_TYPE[ext] || 'application/octet-stream';
  return new File([entry.fileData], name, { type: mime });
}
