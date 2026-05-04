// 何を: ライブラリ（Library / LibraryNode）の IndexedDB CRUD フック
// なぜ: 仕様書 §28 — 層Bの基盤。BookEntry とは別ストアでツリー構造を管理する

import { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { openDb } from './useBookshelf.js';
import { resizeImage } from './useImageResize.js';

const LIB_STORE = 'libraries';

function libTx(db, mode) {
  return db.transaction(LIB_STORE, mode).objectStore(LIB_STORE);
}
function awaitReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

function newId() { return crypto.randomUUID(); }

export function useLibrary() {
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const dbRef = useRef(null);

  const refresh = useCallback(async () => {
    const db = dbRef.current; if (!db) return;
    const list = await awaitReq(libTx(db, 'readonly').getAll());
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setLibraries(list);
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
        console.error('useLibrary: IndexedDB open failed:', e);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // ───── ライブラリ CRUD ─────

  // 何を: ライブラリを新規作成する
  // なぜ: 仕様書 §28 — useLibrary の createLibrary
  const createLibrary = useCallback(async (name) => {
    const db = dbRef.current; if (!db) throw new Error('db not ready');
    const lib = {
      id: newId(),
      name: name.trim() || '新しいライブラリ',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rootNodes: [],
      nodes: {},
    };
    await awaitReq(libTx(db, 'readwrite').put(lib));
    await refresh();
    return lib;
  }, [refresh]);

  const deleteLibrary = useCallback(async (id) => {
    const db = dbRef.current; if (!db) return;
    await awaitReq(libTx(db, 'readwrite').delete(id));
    await refresh();
  }, [refresh]);

  const renameLibrary = useCallback(async (id, name) => {
    const db = dbRef.current; if (!db) return;
    const store = libTx(db, 'readwrite');
    const lib = await awaitReq(store.get(id));
    if (!lib) return;
    await awaitReq(store.put({ ...lib, name: name.trim() || lib.name, updatedAt: Date.now() }));
    await refresh();
  }, [refresh]);

  // ───── ノード操作（共通: libraryId を引数に取り、Library全体を読み書き） ─────

  // 何を: Library レコードを取得し、コールバックで更新して保存する
  // なぜ: 全操作で同じパターンを使う（DB読み→変更→DB書き）
  const updateLib = useCallback(async (libraryId, mutate) => {
    const db = dbRef.current; if (!db) return;
    const store = libTx(db, 'readwrite');
    const lib = await awaitReq(store.get(libraryId));
    if (!lib) return;
    const updated = mutate(lib);
    await awaitReq(store.put({ ...updated, updatedAt: Date.now() }));
    await refresh();
  }, [refresh]);

  // 何を: フォルダノードを追加する
  // なぜ: 仕様書 §28 — addFolder
  const addFolder = useCallback(async (libraryId, parentId, name) => {
    let created = null;
    await updateLib(libraryId, (lib) => {
      const node = {
        id: newId(),
        type: 'folder',
        name: name.trim() || '新しいフォルダ',
        parentId: parentId || null,
        children: [],
      };
      created = node;
      const nodes = { ...lib.nodes, [node.id]: node };
      // 親の children に追加
      if (parentId && nodes[parentId]) {
        nodes[parentId] = { ...nodes[parentId], children: [...(nodes[parentId].children || []), node.id] };
      }
      const rootNodes = parentId ? lib.rootNodes : [...lib.rootNodes, node.id];
      return { ...lib, nodes, rootNodes };
    });
    return created;
  }, [updateLib]);

  // 何を: アイテムノード（BookEntry参照）を追加する
  // なぜ: 仕様書 §28 — addItem
  const addItem = useCallback(async (libraryId, parentId, sourceBookId, name) => {
    let created = null;
    await updateLib(libraryId, (lib) => {
      const node = {
        id: newId(),
        type: 'item',
        name: name || '',
        parentId: parentId || null,
        sourceBookId,
      };
      created = node;
      const nodes = { ...lib.nodes, [node.id]: node };
      if (parentId && nodes[parentId]) {
        nodes[parentId] = { ...nodes[parentId], children: [...(nodes[parentId].children || []), node.id] };
      }
      const rootNodes = parentId ? lib.rootNodes : [...lib.rootNodes, node.id];
      return { ...lib, nodes, rootNodes };
    });
    return created;
  }, [updateLib]);

  // 何を: ノードを削除する（フォルダは子も再帰削除）
  // なぜ: 仕様書 §28 — removeNode
  const removeNode = useCallback(async (libraryId, nodeId) => {
    await updateLib(libraryId, (lib) => {
      // 削除対象ノードとその子孫を収集
      const toDelete = new Set();
      const collect = (id) => {
        toDelete.add(id);
        const n = lib.nodes[id];
        if (n?.type === 'folder') (n.children || []).forEach(collect);
      };
      collect(nodeId);

      const nodes = { ...lib.nodes };
      toDelete.forEach((id) => delete nodes[id]);

      // 親の children から除去
      const parentId = lib.nodes[nodeId]?.parentId;
      if (parentId && nodes[parentId]) {
        nodes[parentId] = {
          ...nodes[parentId],
          children: (nodes[parentId].children || []).filter((id) => !toDelete.has(id)),
        };
      }

      const rootNodes = lib.rootNodes.filter((id) => !toDelete.has(id));
      return { ...lib, nodes, rootNodes };
    });
  }, [updateLib]);

  // 何を: ノードを別の親に移動する
  // なぜ: 仕様書 §28 — moveNode（ドラッグ並び替え）
  const moveNode = useCallback(async (libraryId, nodeId, newParentId, index) => {
    await updateLib(libraryId, (lib) => {
      const nodes = { ...lib.nodes };
      const node = nodes[nodeId];
      if (!node) return lib;
      const oldParentId = node.parentId;

      // 旧親から除去
      if (oldParentId && nodes[oldParentId]) {
        nodes[oldParentId] = {
          ...nodes[oldParentId],
          children: (nodes[oldParentId].children || []).filter((id) => id !== nodeId),
        };
      }
      let rootNodes = lib.rootNodes.filter((id) => id !== nodeId);

      // 新親に追加
      nodes[nodeId] = { ...node, parentId: newParentId || null };
      if (newParentId && nodes[newParentId]) {
        const children = [...(nodes[newParentId].children || [])];
        children.splice(index ?? children.length, 0, nodeId);
        nodes[newParentId] = { ...nodes[newParentId], children };
      } else {
        rootNodes.splice(index ?? rootNodes.length, 0, nodeId);
      }

      return { ...lib, nodes, rootNodes };
    });
  }, [updateLib]);

  const renameNode = useCallback(async (libraryId, nodeId, name) => {
    await updateLib(libraryId, (lib) => {
      const nodes = { ...lib.nodes };
      if (!nodes[nodeId]) return lib;
      nodes[nodeId] = { ...nodes[nodeId], name: name.trim() || nodes[nodeId].name };
      return { ...lib, nodes };
    });
  }, [updateLib]);

  // 何を: LibraryNode の edits を更新する
  // なぜ: 仕様書 §28/§29 — 層Bの編集データ保存
  const updateNodeEdits = useCallback(async (libraryId, nodeId, edits) => {
    await updateLib(libraryId, (lib) => {
      const nodes = { ...lib.nodes };
      if (!nodes[nodeId]) return lib;
      nodes[nodeId] = { ...nodes[nodeId], edits };
      return { ...lib, nodes };
    });
  }, [updateLib]);

  // 何を: 結合ノード（type:'joined'）を追加する
  // なぜ: §29.1 — 複数 BookEntry を1ノードとして連結して閲覧できるようにする
  //   データモデル: sourceBookIds: string[]（sourceBookId配列方式, PG裁量 D-006）
  const addJoinedItem = useCallback(async (libraryId, parentId, sourceBookIds, name) => {
    let created = null;
    await updateLib(libraryId, (lib) => {
      const node = {
        id: newId(),
        type: 'joined',
        name: name || '結合',
        parentId: parentId || null,
        sourceBookIds: [...sourceBookIds],
      };
      created = node;
      const nodes = { ...lib.nodes, [node.id]: node };
      if (parentId && nodes[parentId]) {
        nodes[parentId] = { ...nodes[parentId], children: [...(nodes[parentId].children || []), node.id] };
      }
      const rootNodes = parentId ? lib.rootNodes : [...lib.rootNodes, node.id];
      return { ...lib, nodes, rootNodes };
    });
    return created;
  }, [updateLib]);

  // §32: ライブラリノードの表紙画像を設定する（400pxにリサイズして保存）
  const updateNodeCoverImage = useCallback(async (libraryId, nodeId, imageFile) => {
    const blob = new Blob([await imageFile.arrayBuffer()], { type: imageFile.type });
    const thumb = await resizeImage(blob, { maxLongSide: 400 });
    const ab = await thumb.arrayBuffer();
    await updateLib(libraryId, (lib) => {
      const nodes = { ...lib.nodes };
      if (!nodes[nodeId]) return lib;
      nodes[nodeId] = { ...nodes[nodeId], coverImage: ab };
      return { ...lib, nodes };
    });
  }, [updateLib]);

  // §33: フォルダ/ルートの表示モードを設定する（'catalog' | 'list'）
  const updateFolderViewMode = useCallback(async (libraryId, nodeId, viewMode) => {
    if (nodeId === null) {
      // ルートレベルのviewModeはLibraryオブジェクト自体に保存
      await updateLib(libraryId, (lib) => ({ ...lib, rootViewMode: viewMode }));
    } else {
      await updateLib(libraryId, (lib) => {
        const nodes = { ...lib.nodes };
        if (!nodes[nodeId]) return lib;
        nodes[nodeId] = { ...nodes[nodeId], viewMode };
        return { ...lib, nodes };
      });
    }
  }, [updateLib]);

  // ───── BookEntry 削除連携（§27 カスケード削除） ─────

  // 何を: 指定 bookId を参照している全ライブラリ名を返す
  // なぜ: 仕様書 §27 — 削除確認ダイアログで警告表示
  const findReferencingLibraries = useCallback(async (bookId) => {
    const db = dbRef.current; if (!db) return [];
    const all = await awaitReq(libTx(db, 'readonly').getAll());
    return all
      .filter((lib) =>
        Object.values(lib.nodes).some(
          (n) => (n.type === 'item' && n.sourceBookId === bookId) ||
                 (n.type === 'joined' && (n.sourceBookIds || []).includes(bookId))
        )
      )
      .map((lib) => lib.name);
  }, []);

  // 何を: 指定 bookId を参照している全ノードを削除する
  // なぜ: 仕様書 §28 D-002 — BookEntry削除時のカスケード削除
  const removeNodesByBookId = useCallback(async (bookId) => {
    const db = dbRef.current; if (!db) return;
    const store = libTx(db, 'readwrite');
    const all = await awaitReq(store.getAll());
    for (const lib of all) {
      const nodeIds = Object.keys(lib.nodes).filter(
        (id) => (lib.nodes[id].type === 'item' && lib.nodes[id].sourceBookId === bookId) ||
                (lib.nodes[id].type === 'joined' && (lib.nodes[id].sourceBookIds || []).includes(bookId))
      );
      if (nodeIds.length === 0) continue;
      let updated = { ...lib };
      for (const nodeId of nodeIds) {
        const node = updated.nodes[nodeId];
        if (!node) continue;
        const nodes = { ...updated.nodes };
        if (node.type === 'joined') {
          // §29: joined ノードは対象 bookId だけ除去し、空になれば削除
          const remaining = (node.sourceBookIds || []).filter((id) => id !== bookId);
          if (remaining.length > 0) {
            nodes[nodeId] = { ...node, sourceBookIds: remaining };
            updated = { ...updated, nodes };
            continue;
          }
        }
        delete nodes[nodeId];
        if (node.parentId && nodes[node.parentId]) {
          nodes[node.parentId] = {
            ...nodes[node.parentId],
            children: (nodes[node.parentId].children || []).filter((id) => id !== nodeId),
          };
        }
        const rootNodes = updated.rootNodes.filter((id) => id !== nodeId);
        updated = { ...updated, nodes, rootNodes };
      }
      await awaitReq(store.put({ ...updated, updatedAt: Date.now() }));
    }
    await refresh();
  }, [refresh]);

  // §34: ライブラリをZIPファイルとしてエクスポートする（D-008: ZIP形式採用）
  // 形式: manifest.json + books/{id} + settings/{id}.json + bookcovers/{id} + nodecovers/{id}
  const exportLibrary = useCallback(async (libraryId, { getAllBooks, getLocalSettings, onProgress }) => {
    const db = dbRef.current; if (!db) return;
    const lib = await awaitReq(libTx(db, 'readonly').get(libraryId));
    if (!lib) return;

    // 参照されている全BookEntry IDを収集
    const bookIds = new Set();
    Object.values(lib.nodes).forEach((n) => {
      if (n.type === 'item' && n.sourceBookId) bookIds.add(n.sourceBookId);
      if (n.type === 'joined') (n.sourceBookIds || []).forEach((id) => bookIds.add(id));
    });

    const allBooks = await getAllBooks();
    const refBooks = allBooks.filter((b) => bookIds.has(b.id));

    const zip = new JSZip();

    // ノードのcoverImageを別ファイルに退避
    const libMeta = { ...lib, nodes: {} };
    for (const [id, node] of Object.entries(lib.nodes)) {
      const { coverImage, ...rest } = node;
      libMeta.nodes[id] = rest;
      if (coverImage) zip.file(`nodecovers/${id}`, coverImage);
    }

    // 各BookEntryをZIPに追加
    const bookMetas = [];
    for (let i = 0; i < refBooks.length; i++) {
      const b = refBooks[i];
      onProgress?.(`書き出し中... (${i + 1}/${refBooks.length})`);
      const { fileData, coverImage, ...meta } = b;
      bookMetas.push(meta);
      if (fileData) zip.file(`books/${b.id}`, fileData);
      if (coverImage) zip.file(`bookcovers/${b.id}`, coverImage);
      const ls = await getLocalSettings(b.id);
      if (ls) zip.file(`settings/${b.id}.json`, JSON.stringify(ls));
    }

    zip.file('manifest.json', JSON.stringify({ library: libMeta, books: bookMetas }));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    onProgress?.(null);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(lib.name || 'library').replace(/[\\/:*?"<>|]/g, '_')}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // §34: ZIPファイルからライブラリをインポートする
  // 重複チェック: title + charCount が一致する既存BookEntryは再利用
  const importLibrary = useCallback(async (file, { findByTitle, saveBook, saveLocalSettings, onProgress }) => {
    const db = dbRef.current; if (!db) return;

    const zip = await JSZip.loadAsync(file);
    const manifestStr = await zip.file('manifest.json')?.async('string');
    if (!manifestStr) throw new Error('manifest.json が見つかりません');
    const { library: libMeta, books: bookMetas } = JSON.parse(manifestStr);

    // 旧ID → 新ID のマッピング
    const idMap = new Map();

    for (let i = 0; i < bookMetas.length; i++) {
      const meta = bookMetas[i];
      onProgress?.(`読み込み中... (${i + 1}/${bookMetas.length})`);

      // 重複チェック（同タイトル + 同文字数）
      const existing = await findByTitle(meta.title);
      if (existing && existing.charCount === meta.charCount) {
        idMap.set(meta.id, existing.id);
        continue;
      }

      const fileDataAb = await zip.file(`books/${meta.id}`)?.async('arraybuffer');
      if (!fileDataAb) { idMap.set(meta.id, meta.id); continue; }

      const coverAb = await zip.file(`bookcovers/${meta.id}`)?.async('arraybuffer');
      const newId = crypto.randomUUID();
      const newEntry = { ...meta, id: newId, fileData: fileDataAb, coverImage: coverAb || undefined };
      await saveBook(newEntry);
      idMap.set(meta.id, newId);

      // localSettings を復元
      const lsFile = zip.file(`settings/${meta.id}.json`);
      if (lsFile) {
        const ls = JSON.parse(await lsFile.async('string'));
        await saveLocalSettings(newId, ls);
      }
    }

    // ライブラリのnodeをID付け替え + nodecover復元
    const newNodes = {};
    for (const [id, node] of Object.entries(libMeta.nodes || {})) {
      let newNode = { ...node };
      if (node.type === 'item' && node.sourceBookId) {
        newNode.sourceBookId = idMap.get(node.sourceBookId) || node.sourceBookId;
      }
      if (node.type === 'joined' && node.sourceBookIds) {
        newNode.sourceBookIds = node.sourceBookIds.map((sid) => idMap.get(sid) || sid);
      }
      const coverAb = await zip.file(`nodecovers/${id}`)?.async('arraybuffer');
      if (coverAb) newNode.coverImage = coverAb;
      newNodes[id] = newNode;
    }

    // 同名ライブラリが既にあれば "(インポート)" を付加
    const allLibs = await awaitReq(libTx(db, 'readonly').getAll());
    const nameConflict = allLibs.some((l) => l.name === libMeta.name);
    const newLib = {
      ...libMeta,
      id: newId(),
      name: nameConflict ? `${libMeta.name} (インポート)` : libMeta.name,
      nodes: newNodes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await awaitReq(libTx(db, 'readwrite').put(newLib));
    onProgress?.(null);
    await refresh();
  }, [refresh]);

  return {
    libraries,
    loading,
    createLibrary,
    deleteLibrary,
    renameLibrary,
    addFolder,
    addItem,
    addJoinedItem,
    removeNode,
    moveNode,
    renameNode,
    updateNodeEdits,
    findReferencingLibraries,
    removeNodesByBookId,
    // §32 新規
    updateNodeCoverImage,
    // §33 新規
    updateFolderViewMode,
    // §34 新規
    exportLibrary,
    importLibrary,
  };
}
