// 何を: Claude.ai conversations.json を読み込み、会話を選択して mkb に変換する画面
// なぜ: 仕様書 Phase 3b §18 — チャットログを「読み替え可能な原本」に取り込む入口

import { useMemo, useRef, useState } from 'react';
import { parseConversationsJson, conversationToMkbData, conversationToBookEntry, mkbDataToZipBuffer } from '../utils/chatConverter.js';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ChatImporter({
  onCancel,            // () => void: キャンセル（本棚に戻る）
  onOpenSingle,        // (file: File) => void: 1 つだけ変換してビューアで開く
  saveBook,            // (BookEntry) => Promise<void>: 一括保存
}) {
  const inputRef = useRef(null);
  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // 何を: ツリー構造の扱いを切替
  // なぜ: 既定は active（編集後の最終分岐のみ）。デバッグ等で全分岐見たい場合は all
  const [branchMode, setBranchMode] = useState('active');

  // ───── ファイル選択 ─────
  function handlePickClick() {
    inputRef.current?.click();
  }
  async function handlePickChange(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    setLoading(true);
    try {
      const text = await f.text();
      const list = parseConversationsJson(text);
      setConversations(list);
      // デフォルトは全選択
      setSelected(new Set(list.map((c) => c.uuid)));
    } catch (e2) {
      console.error(e2);
      setError(e2.message || String(e2));
      setConversations(null);
    } finally {
      setLoading(false);
    }
  }

  // ───── 選択操作 ─────
  function toggle(uuid) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }
  function selectAll() {
    if (!conversations) return;
    setSelected(new Set(conversations.map((c) => c.uuid)));
  }
  function selectNone() {
    setSelected(new Set());
  }

  const selectedCount = selected.size;
  const total = conversations?.length || 0;

  // ───── 変換実行 ─────
  async function handleConvert() {
    if (!conversations || selectedCount === 0) return;
    const targets = conversations.filter((c) => selected.has(c.uuid));
    setLoading(true);
    setError(null);
    try {
      if (targets.length === 1) {
        // 1 つだけ → ビューアで開く（mkb ZIP として渡す）
        const conv = targets[0];
        const mkb = conversationToMkbData(conv, { branch: branchMode });
        const ab = await mkbDataToZipBuffer(mkb);
        const blob = new Blob([ab], { type: 'application/zip' });
        const file = new File([blob], `${mkb.metadata.title}.mkb`, { type: 'application/zip' });
        await onOpenSingle?.(file);
      } else {
        // 複数 → 全部本棚保存
        for (const conv of targets) {
          const entry = await conversationToBookEntry(conv, { branch: branchMode });
          await saveBook(entry);
        }
        alert(`${targets.length} 件の会話を本棚に保存しました`);
        onCancel?.(); // 本棚に戻る
      }
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // ───── 表示 ─────
  return (
    <div className="chat-importer">
      <header className="bookshelf-header">
        <button
          type="button"
          className="pick-btn"
          onClick={() => onCancel?.()}
          aria-label="本棚に戻る"
          title="本棚に戻る"
        >← 戻る</button>
        <div className="title">チャットログ取り込み</div>
        {!conversations && (
          <button type="button" className="pick-btn" onClick={handlePickClick} disabled={loading}>
            {loading ? '読込中…' : 'JSON 選択'}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          onChange={handlePickChange}
          style={{ display: 'none' }}
        />
      </header>

      {error && <p className="bookshelf-error">エラー: {error}</p>}

      {!conversations && !loading && (
        <div className="bookshelf-empty">
          <p>Claude.ai の <code>conversations.json</code> を選択してください</p>
          <p className="hint">Settings → Privacy → Export Data で取得した ZIP に同梱されています</p>
          <button type="button" className="file-btn" onClick={handlePickClick}>
            JSON を選択
          </button>
        </div>
      )}

      {conversations && (
        <>
          <div className="chat-importer-toolbar">
            <span>{selectedCount} / {total} 選択中</span>
            <button type="button" className="settings-btn" onClick={selectAll}>すべて選択</button>
            <button type="button" className="settings-btn" onClick={selectNone}>選択解除</button>
            <div className="toggle" style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                className={branchMode === 'active' ? 'active' : ''}
                onClick={() => setBranchMode('active')}
                title="編集後の最終分岐のみ取り込む"
              >最終分岐のみ</button>
              <button
                type="button"
                className={branchMode === 'all' ? 'active' : ''}
                onClick={() => setBranchMode('all')}
                title="編集前後を含めて全メッセージ取り込む"
              >全分岐</button>
            </div>
            <button
              type="button"
              className="settings-btn active"
              onClick={handleConvert}
              disabled={loading || selectedCount === 0}
            >
              {loading ? '変換中…' : selectedCount === 1 ? '変換して開く' : `${selectedCount} 件を本棚に保存`}
            </button>
          </div>
          <ul className="chat-list">
            {conversations.map((c) => {
              const checked = selected.has(c.uuid);
              return (
                <li key={c.uuid} className={`chat-item ${checked ? 'selected' : ''}`}>
                  <label>
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.uuid)} />
                    <span className="chat-name">{c.name || `Untitled-${c.uuid.slice(0,8)}`}</span>
                    <span className="chat-meta">
                      {fmtDate(c.created_at)} · {c.chat_messages.length} msg
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
