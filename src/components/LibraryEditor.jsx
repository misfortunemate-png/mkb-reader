// 何を: §29 編集機能UI — ファイル接続（結合ノード作成）と画像切り出し先選択
// なぜ: 仕様書 §29.1 — 複数アイテムを結合ノードとして保存
//       仕様書 §29.2 — 切り出し先ライブラリノードをドリルダウンで選択

import { useState } from 'react';

// ───── ファイル接続ダイアログ ─────
// 何を: 編集モードで選択した複数アイテムを「結合」ノードとして保存する
// なぜ: §29.1 — sourceBookIds配列方式で joined ノードを作成（PG裁量: D-006）
export function JoinDialog({ selectedNodes, libraryId, parentId, addJoinedItem, onDone, onCancel }) {
  const [name, setName] = useState(selectedNodes.map((n) => n.name).join(' + '));
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (selectedNodes.length < 2) return;
    setBusy(true);
    try {
      // joined/item 両タイプに対応して sourceBookIds を収集
      const sourceBookIds = selectedNodes.flatMap((n) =>
        n.type === 'joined'
          ? (n.sourceBookIds || [])
          : (n.sourceBookId ? [n.sourceBookId] : [])
      );
      const node = await addJoinedItem(libraryId, parentId, sourceBookIds, name);
      onDone?.(node);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lib-picker-overlay" onClick={onCancel}>
      <div className="lib-picker" onClick={(e) => e.stopPropagation()}>
        <div className="lib-picker-header">
          <span>ファイルを結合</span>
          <button type="button" onClick={onCancel}>✕</button>
        </div>
        <p className="lib-picker-desc">以下のファイルを結合して1つのノードにします：</p>
        <ul className="join-item-list">
          {selectedNodes.map((n) => (
            <li key={n.id} className="join-item">📄 {n.name}</li>
          ))}
        </ul>
        <div className="lib-name-row">
          <label className="rw-label">結合後の名前</label>
          <input
            className="lib-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="join-dialog-actions">
          <button
            type="button"
            className="pick-btn"
            onClick={handleConfirm}
            disabled={busy || selectedNodes.length < 2}
          >
            {busy ? '処理中…' : '結合'}
          </button>
          <button type="button" className="lib-add-btn" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

// ───── 画像切り出し先選択ダイアログ ─────
// 何を: ライブラリ→フォルダ→ノードのドリルダウンで、画像の保存先ノードを選択する
// なぜ: §29.2 — 切り出した画像をどのノードの edits に追加するかユーザーが指定する
export function ImportTargetDialog({ libraries, onSelect, onCancel }) {
  const [selectedLibId, setSelectedLibId] = useState(null);
  const [path, setPath] = useState([]);

  const selectedLib = libraries.find((l) => l.id === selectedLibId);
  const currentNodeIds = selectedLib
    ? (path.length === 0
        ? (selectedLib.rootNodes || [])
        : (selectedLib.nodes[path[path.length - 1]]?.children || []))
    : [];
  const currentNodes = currentNodeIds.map((id) => selectedLib?.nodes[id]).filter(Boolean);

  return (
    <div className="lib-picker-overlay" onClick={onCancel}>
      <div className="lib-picker" onClick={(e) => e.stopPropagation()}>
        <div className="lib-picker-header">
          <span>切り出し先を選択</span>
          <button type="button" onClick={onCancel}>✕</button>
        </div>

        {!selectedLib ? (
          <>
            <p className="lib-picker-desc">ライブラリを選択：</p>
            {libraries.length === 0 ? (
              <p className="lib-picker-empty">ライブラリがありません</p>
            ) : (
              <ul className="lib-picker-list">
                {libraries.map((lib) => (
                  <li key={lib.id}>
                    <button
                      type="button"
                      className="lib-picker-item"
                      onClick={() => { setSelectedLibId(lib.id); setPath([]); }}
                    >
                      {lib.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            {/* パンくず */}
            <div className="lib-breadcrumb import-breadcrumb">
              <button
                type="button"
                className="breadcrumb-item"
                onClick={() => { setSelectedLibId(null); setPath([]); }}
              >
                ライブラリ
              </button>
              <span className="breadcrumb-sep">/</span>
              <button
                type="button"
                className="breadcrumb-item"
                onClick={() => setPath([])}
              >
                {selectedLib.name}
              </button>
              {path.map((nodeId, idx) => {
                const node = selectedLib.nodes[nodeId];
                return (
                  <span key={nodeId}>
                    <span className="breadcrumb-sep">/</span>
                    <button
                      type="button"
                      className="breadcrumb-item"
                      onClick={() => setPath((p) => p.slice(0, idx + 1))}
                    >
                      {node?.name || nodeId}
                    </button>
                  </span>
                );
              })}
            </div>

            {currentNodes.length === 0 ? (
              <p className="lib-picker-empty">ここにはアイテムがありません</p>
            ) : (
              <ul className="lib-picker-list">
                {currentNodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className="lib-picker-item"
                      onClick={() => {
                        if (node.type === 'folder') {
                          setPath((p) => [...p, node.id]);
                        } else {
                          // item / joined 両タイプで切り出し先として選択可
                          onSelect?.({ libraryId: selectedLibId, nodeId: node.id });
                        }
                      }}
                    >
                      {node.type === 'folder' ? '📁 ' : '📄 '}{node.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
