// 何を: 本棚（IndexedDB の books ストア）の CRUD フック
// なぜ: 仕様書 §8 — 開いたファイルを保存しオフラインで再度開けるようにする
//
// 【安定IF・差替不可】このファイルの export しているフックの戻り値（saveBook,
// getBook, getAllBooks, deleteBook, updateLastOpened）と BookEntry 型は
// 「将来 Bookshelf.jsx を全面差替しても変えない」契約として固定する。
// ビューア本体（§1〜§4）と本棚UIの結合点はこのインターフェースのみ。

import { useCallback, useEffect, useRef, useState } from 'react';

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

  const saveBook = useCallback(async (entry) => {
    const db = dbRef.current; if (!db) throw new Error('db not ready');
    await awaitReq(tx(db, 'readwrite').put(entry));
    await refresh();
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

  return {
    books,
    loading,
    saveBook,
    getBook,
    getAllBooks,
    deleteBook,
    updateLastOpened,
    findByTitle,
    refresh,
  };
}

// 何を: File / MkbData → BookEntry へ変換
// なぜ: ビューア本体は File を扱うが、本棚は ArrayBuffer + メタデータで保存する
export async function fileToBookEntry(file, mkbMetadata) {
  const lower = (file.name || '').toLowerCase();
  let fileType = 'md';
  if (lower.endsWith('.mkb') || lower.endsWith('.zip')) fileType = 'mkb';
  else if (lower.endsWith('.txt')) fileType = 'txt';
  const fileData = await file.arrayBuffer();
  const baseTitle = (file.name || 'untitled').replace(/\.[^.]+$/, '');
  return {
    id: crypto.randomUUID(),
    title: mkbMetadata?.title || baseTitle,
    author: mkbMetadata?.author || '',
    fileType,
    fileData,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };
}

// BookEntry → File（ビューアに渡すため）
export function bookEntryToFile(entry) {
  const ext = entry.fileType === 'mkb' ? '.mkb' : entry.fileType === 'txt' ? '.txt' : '.md';
  const name = (entry.title || 'untitled').replace(/[\\/:*?"<>|]/g, '_') + ext;
  const mime = entry.fileType === 'mkb'
    ? 'application/zip'
    : entry.fileType === 'txt'
      ? 'text/plain'
      : 'text/markdown';
  return new File([entry.fileData], name, { type: mime });
}
