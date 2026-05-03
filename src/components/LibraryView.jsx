// 何を: ライブラリUI（§28 層B基盤）
// なぜ: 仕様書 §28 — ツリー構造のドリルダウンナビ + 編集モード（タッチイベントベースのDnD）

import { useCallback, useRef, useState } from 'react';

// ───── ドラッグ並び替えヘルパ ─────

// 何を: ドラッグ中の状態を管理する（touchstart/move/end でノードを並び替える）
// なぜ: HTML5 DnD はモバイルで動作しないため touchEvent で実装（仕様書 §28.3）
function useTouchDrag({ onReorder }) {
  const dragRef = useRef({ dragging: null, startY: 0, targets: [] });

  const onDragStart = useCallback((e, nodeId) => {
    dragRef.current.dragging = nodeId;
    dragRef.current.startY   = e.touches[0].clientY;
  }, []);

  const onDragMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    // ブラウザのスクロールを防止
    e.preventDefault();
  }, []);

  const onDragEnd = useCallback((e, nodes, parentNodeIds) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const endY = e.changedTouches[0].clientY;
    const diffY = endY - d.startY;
    const nodeId = d.dragging;
    d.dragging = null;
    if (Math.abs(diffY) < 20) return; // 閾値未満は無視

    const idx = nodes.indexOf(nodeId);
    if (idx === -1) return;
    const dir = diffY > 0 ? 1 : -1;
    const newIdx = Math.max(0, Math.min(nodes.length - 1, idx + dir));
    if (newIdx !== idx) {
      onReorder(nodeId, newIdx);
    }
  }, [onReorder]);

  return { onDragStart, onDragMove, onDragEnd };
}

// ───── LibraryView 本体 ─────

export default function LibraryView({
  libraries,
  books,           // BookEntry[] — アイテム追加時のピッカー用
  onOpenLibraryItem, // (bookEntry, libraryEdits) => void
  onCreateLibrary,
  onDeleteLibrary,
  onRenameLibrary,
  onAddFolder,
  onAddItem,
  onRemoveNode,
  onMoveNode,
  onRenameNode,
}) {
  // 選択中のライブラリ ID
  const [selectedLibId, setSelectedLibId] = useState(null);
  // ドリルダウンパス（nodeId の配列。空 = ルート）
  const [path, setPath] = useState([]);
  // 編集モード
  const [editMode, setEditMode] = useState(false);
  // ライブラリ名変更
  const [renamingLib, setRenamingLib] = useState(null); // { id, value }
  // ノード名変更
  const [renamingNode, setRenamingNode] = useState(null); // { id, value }
  // アイテム追加ピッカー
  const [pickerOpen, setPickerOpen] = useState(false);
  // 新規ライブラリ名入力
  const [newLibName, setNewLibName] = useState('');
  const [creatingLib, setCreatingLib] = useState(false);

  const selectedLib = libraries.find((l) => l.id === selectedLibId) || null;

  // 現在の階層のノードIDリスト
  const currentNodeIds = (() => {
    if (!selectedLib) return [];
    if (path.length === 0) return selectedLib.rootNodes || [];
    const parentNode = selectedLib.nodes[path[path.length - 1]];
    return parentNode?.children || [];
  })();

  const currentNodes = currentNodeIds.map((id) => selectedLib?.nodes[id]).filter(Boolean);

  // ───── ドラッグ並び替え ─────
  const { onDragStart, onDragMove, onDragEnd } = useTouchDrag({
    onReorder: (nodeId, newIdx) => {
      const parentId = path.length > 0 ? path[path.length - 1] : null;
      onMoveNode?.(selectedLibId, nodeId, parentId, newIdx);
    },
  });

  // ───── ナビゲーション ─────
  function drillDown(nodeId) {
    setPath((prev) => [...prev, nodeId]);
  }
  function breadcrumbNav(idx) {
    setPath((prev) => prev.slice(0, idx + 1));
  }
  function goToRoot() { setPath([]); }

  // ───── ライブラリ選択 ─────
  function selectLib(id) {
    setSelectedLibId(id);
    setPath([]);
    setEditMode(false);
  }

  // ───── アイテムを開く ─────
  function handleOpenItem(node) {
    if (!node.sourceBookId) return;
    const entry = books.find((b) => b.id === node.sourceBookId);
    if (!entry) return;
    onOpenLibraryItem?.(entry, node.edits || null);
  }

  // ───── ライブラリ作成 ─────
  async function handleCreateLib() {
    const name = newLibName.trim() || '新しいライブラリ';
    const lib = await onCreateLibrary?.(name);
    setNewLibName('');
    setCreatingLib(false);
    if (lib) setSelectedLibId(lib.id);
  }

  // ───── ノード追加 ─────
  async function handleAddFolder() {
    const parentId = path.length > 0 ? path[path.length - 1] : null;
    await onAddFolder?.(selectedLibId, parentId, '新しいフォルダ');
  }
  async function handleAddItemFromPicker(bookId) {
    const book = books.find((b) => b.id === bookId);
    const parentId = path.length > 0 ? path[path.length - 1] : null;
    await onAddItem?.(selectedLibId, parentId, bookId, book?.title || '');
    setPickerOpen(false);
  }

  // ───── ノードリネーム ─────
  async function commitNodeRename() {
    if (!renamingNode) return;
    await onRenameNode?.(selectedLibId, renamingNode.id, renamingNode.value);
    setRenamingNode(null);
  }

  // ───── ライブラリリネーム ─────
  async function commitLibRename() {
    if (!renamingLib) return;
    await onRenameLibrary?.(renamingLib.id, renamingLib.value);
    setRenamingLib(null);
  }

  // ───── ライブラリ削除 ─────
  async function handleDeleteLib(id, name) {
    if (confirm(`ライブラリ「${name}」を削除しますか？`)) {
      await onDeleteLibrary?.(id);
      if (selectedLibId === id) {
        setSelectedLibId(null);
        setPath([]);
      }
    }
  }

  // ───── ノード削除 ─────
  async function handleDeleteNode(nodeId, name) {
    const node = selectedLib?.nodes[nodeId];
    const msg = node?.type === 'folder'
      ? `フォルダ「${name}」とその中身を削除しますか？`
      : `「${name}」をライブラリから削除しますか？（元のファイルは消えません）`;
    if (confirm(msg)) {
      await onRemoveNode?.(selectedLibId, nodeId);
    }
  }

  // ─── レンダリング ───

  // ライブラリ未選択 or ライブラリが0件
  if (libraries.length === 0) {
    return (
      <div className="library-view">
        <div className="library-empty">
          <p>ライブラリがありません</p>
          <button type="button" className="pick-btn" onClick={() => setCreatingLib(true)}>
            ＋ ライブラリを作成
          </button>
          {creatingLib && (
            <div className="lib-create-row">
              <input
                className="lib-name-input"
                value={newLibName}
                onChange={(e) => setNewLibName(e.target.value)}
                placeholder="ライブラリ名"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLib(); if (e.key === 'Escape') setCreatingLib(false); }}
                autoFocus
              />
              <button type="button" className="pick-btn" onClick={handleCreateLib}>作成</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="library-view">
      {/* ライブラリ選択バー */}
      <div className="library-selector">
        <div className="library-chips">
          {libraries.map((lib) => (
            <button
              key={lib.id}
              type="button"
              className={`lib-chip ${selectedLibId === lib.id ? 'active' : ''}`}
              onClick={() => selectLib(lib.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setRenamingLib({ id: lib.id, value: lib.name });
              }}
            >
              {renamingLib?.id === lib.id ? (
                <input
                  className="lib-chip-input"
                  value={renamingLib.value}
                  onChange={(e) => setRenamingLib((s) => ({ ...s, value: e.target.value }))}
                  onBlur={commitLibRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitLibRename();
                    if (e.key === 'Escape') setRenamingLib(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                lib.name
              )}
            </button>
          ))}
        </div>
        {/* ライブラリ追加 */}
        {creatingLib ? (
          <div className="lib-create-row">
            <input
              className="lib-name-input"
              value={newLibName}
              onChange={(e) => setNewLibName(e.target.value)}
              placeholder="ライブラリ名"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLib(); if (e.key === 'Escape') setCreatingLib(false); }}
              autoFocus
            />
            <button type="button" className="lib-add-btn" onClick={handleCreateLib}>✓</button>
            <button type="button" className="lib-add-btn" onClick={() => setCreatingLib(false)}>✕</button>
          </div>
        ) : (
          <button type="button" className="lib-add-btn" onClick={() => setCreatingLib(true)} aria-label="ライブラリ追加">＋</button>
        )}
      </div>

      {/* ライブラリ未選択 */}
      {!selectedLib ? (
        <div className="library-empty">
          <p>ライブラリを選んでください</p>
        </div>
      ) : (
        <>
          {/* パンくずリスト + 編集ボタン */}
          <div className="lib-breadcrumb-row">
            <div className="lib-breadcrumb">
              <button type="button" className="breadcrumb-item" onClick={goToRoot}>
                {selectedLib.name}
              </button>
              {path.map((nodeId, idx) => {
                const node = selectedLib.nodes[nodeId];
                return (
                  <span key={nodeId}>
                    <span className="breadcrumb-sep">/</span>
                    <button type="button" className="breadcrumb-item" onClick={() => breadcrumbNav(idx)}>
                      {node?.name || nodeId}
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="lib-toolbar">
              {editMode && (
                <>
                  <button type="button" className="lib-tool-btn" onClick={handleAddFolder}>
                    フォルダ＋
                  </button>
                  <button type="button" className="lib-tool-btn" onClick={() => setPickerOpen(true)}>
                    ファイル＋
                  </button>
                  <button type="button" className="lib-tool-btn danger"
                    onClick={() => handleDeleteLib(selectedLibId, selectedLib.name)}>
                    ライブラリ削除
                  </button>
                  <button type="button" className="lib-tool-btn"
                    onClick={() => setRenamingLib({ id: selectedLibId, value: selectedLib.name })}>
                    名前変更
                  </button>
                </>
              )}
              <button
                type="button"
                className={`lib-tool-btn ${editMode ? 'active' : ''}`}
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode ? '完了' : '編集'}
              </button>
            </div>
          </div>

          {/* ノード一覧 */}
          <ul
            className="lib-node-list"
            onTouchMove={editMode ? onDragMove : undefined}
          >
            {currentNodes.length === 0 ? (
              <li className="lib-node-empty">
                {editMode ? '「ファイル＋」または「フォルダ＋」で追加' : 'ここには何もありません'}
              </li>
            ) : (
              currentNodes.map((node) => (
                <li key={node.id} className={`lib-node ${editMode ? 'edit-mode' : ''}`}>
                  {/* ドラッグハンドル（編集モード時のみ） */}
                  {editMode && (
                    <span
                      className="drag-handle"
                      onTouchStart={(e) => onDragStart(e, node.id)}
                      onTouchEnd={(e) => onDragEnd(e, currentNodeIds, path)}
                    >⠿</span>
                  )}

                  {/* ノード本体 */}
                  <button
                    type="button"
                    className={`lib-node-btn ${node.type}`}
                    onClick={() => {
                      if (node.type === 'folder') drillDown(node.id);
                      else if (!editMode) handleOpenItem(node);
                    }}
                  >
                    <span className="lib-node-icon">
                      {node.type === 'folder' ? '📁' : '📄'}
                    </span>
                    {/* ノードリネーム */}
                    {renamingNode?.id === node.id ? (
                      <input
                        className="node-rename-input"
                        value={renamingNode.value}
                        onChange={(e) => setRenamingNode((s) => ({ ...s, value: e.target.value }))}
                        onBlur={commitNodeRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNodeRename();
                          if (e.key === 'Escape') setRenamingNode(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="lib-node-name">{node.name}</span>
                    )}
                    {node.type === 'folder' && (
                      <span className="lib-node-count">
                        {(node.children || []).length}件
                      </span>
                    )}
                  </button>

                  {/* 編集モード時の操作ボタン */}
                  {editMode && (
                    <div className="lib-node-actions">
                      <button type="button" className="lib-node-act-btn"
                        onClick={() => setRenamingNode({ id: node.id, value: node.name })}>
                        ✏
                      </button>
                      <button type="button" className="lib-node-act-btn danger"
                        onClick={() => handleDeleteNode(node.id, node.name)}>
                        🗑
                      </button>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {/* アイテム追加ピッカー（本棚から選択） */}
      {pickerOpen && (
        <div className="lib-picker-overlay" onClick={() => setPickerOpen(false)}>
          <div className="lib-picker" onClick={(e) => e.stopPropagation()}>
            <div className="lib-picker-header">
              <span>本棚から追加</span>
              <button type="button" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            {books.length === 0 ? (
              <p className="lib-picker-empty">本棚にファイルがありません</p>
            ) : (
              <ul className="lib-picker-list">
                {books.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className="lib-picker-item"
                      onClick={() => handleAddItemFromPicker(b.id)}
                    >
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
