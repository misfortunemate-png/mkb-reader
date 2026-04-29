// 何を: 本文長押しで表示するコンテキストメニュー（§21）
// なぜ: 読書体験を中断せずに読み替え操作（行非表示・テキスト読み替え・画像差し込み）を行う
//
// 設計:
//   - 長押し位置に position: fixed で表示（画面端はみ出し補正あり）
//   - contextmenu イベントを preventDefault してブラウザネイティブメニューを抑制
//   - 3つのビュー: 'menu'（メインメニュー）| 'edit'（インライン編集）| 'size'（画像サイズ選択）
//   - メニュー外 pointerdown で閉じる（100ms 遅延で長押し解放直後の誤発火を防ぐ）
//   - undo スタック: type + targetId で直前の操作を取り消す
//   - 対象フォーマット: MD/txt のみ（HTML/JSON/画像は App.jsx 側で非表示に制御）

import { useEffect, useRef, useState } from 'react';

const MENU_W = 220;

export default function ContextMenu({
  event,           // { x, y, target } | null — null のとき非表示
  onClose,
  chapterContent,  // 現在チャプターの原本 MD テキスト（段落抽出用）
  chapterId,
  onHideLine,      // (lineNumber) => void
  onEditLine,      // (lineNumber, original, display) => void
  onInsertImage,   // ({ lineNumber, displaySize, file }) => void
  onUndo,          // () => void
  canUndo,
  onOpenRewrite,
}) {
  // 'menu' | 'edit' | 'size'
  const [view, setView] = useState('menu');
  const [editText, setEditText] = useState('');
  const [displaySize, setDisplaySize] = useState('block');
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  // event が変わったらビューをリセット
  useEffect(() => {
    if (event) {
      setView('menu');
      setDisplaySize('block');
    }
  }, [event]);

  // メニュー外 pointerdown で閉じる（長押し終了直後の誤閉じ防止のため 100ms 遅延）
  useEffect(() => {
    if (!event) return;
    let active = false;
    const t = setTimeout(() => {
      active = true;
      function onOutside(e) {
        if (menuRef.current && !menuRef.current.contains(e.target)) onClose?.();
      }
      document.addEventListener('pointerdown', onOutside);
      return () => document.removeEventListener('pointerdown', onOutside);
    }, 100);
    return () => {
      clearTimeout(t);
      if (!active) return;
    };
  }, [event, onClose]);

  if (!event) return null;

  // 長押し対象から最寄りの data-source-line を持つ要素を探す
  const lineEl = event.target?.closest?.('[data-source-line]');
  const lineNumber = parseInt(lineEl?.dataset?.sourceLine || '0', 10) || null;

  // 段落の原本テキストを抽出（data-source-line の行から次の空行まで）
  // なぜ: lineNumber 基準でソース MD の段落全体を取得し、編集 UI の初期値にする
  function getSourceParagraph() {
    if (!lineNumber || !chapterContent) return '';
    const lines = chapterContent.split('\n');
    const start = lineNumber - 1; // 0-indexed
    if (start < 0 || start >= lines.length) return '';
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++;
    return lines.slice(start, end + 1).join('\n');
  }

  // 画面端はみ出し補正
  const menuH = view === 'menu' ? 250 : view === 'edit' ? 220 : 200;
  const posX = Math.max(8, Math.min(event.x, window.innerWidth - MENU_W - 8));
  const posY = Math.max(8, Math.min(event.y, window.innerHeight - menuH - 8));

  const baseStyle = {
    position: 'fixed',
    left: posX,
    top: posY,
    width: MENU_W,
    zIndex: 9000,
  };

  // ───── ビュー: メインメニュー ─────
  if (view === 'menu') {
    return (
      <div
        ref={menuRef}
        className="context-menu"
        style={baseStyle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button" className="ctx-item"
          disabled={!lineNumber}
          onClick={() => {
            if (!lineNumber) return;
            onHideLine?.(lineNumber);
            onClose?.();
          }}
        >この行を非表示にする</button>
        <button
          type="button" className="ctx-item"
          disabled={!lineNumber}
          onClick={() => {
            if (!lineNumber) return;
            setEditText(getSourceParagraph());
            setView('edit');
          }}
        >テキストを読み替える</button>
        <button
          type="button" className="ctx-item"
          disabled={!lineNumber}
          onClick={() => {
            if (!lineNumber) return;
            setView('size');
          }}
        >ここに画像を差し込む</button>
        <div className="ctx-divider" />
        <button
          type="button" className="ctx-item"
          disabled={!canUndo}
          onClick={() => { onUndo?.(); onClose?.(); }}
        >元に戻す</button>
        <button
          type="button" className="ctx-item"
          onClick={() => { onOpenRewrite?.(); onClose?.(); }}
        >読み替え設定を開く</button>
      </div>
    );
  }

  // ───── ビュー: インライン編集 ─────
  // なぜ: 段落テキストを直接編集させる（行番号+original で完全一致キーを生成）
  if (view === 'edit') {
    return (
      <div
        ref={menuRef}
        className="context-menu context-edit"
        style={baseStyle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <textarea
          className="ctx-textarea"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={4}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <div className="ctx-actions">
          <button
            type="button" className="ctx-btn"
            onClick={() => {
              const original = getSourceParagraph();
              onEditLine?.(lineNumber, original, editText);
              onClose?.();
            }}
          >適用</button>
          <button
            type="button" className="ctx-btn secondary"
            onClick={() => setView('menu')}
          >キャンセル</button>
        </div>
      </div>
    );
  }

  // ───── ビュー: 画像サイズ選択 ─────
  // なぜ: §21 §15 — ファイルピッカーの前にサイズを選ばせることで意図した表示になる
  if (view === 'size') {
    return (
      <div
        ref={menuRef}
        className="context-menu context-size"
        style={baseStyle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="ctx-label">画像サイズを選択</p>
        {[
          { key: 'inline', label: '行内（小）' },
          { key: 'block', label: 'ブロック（中）' },
          { key: 'fullpage', label: '全面（大）' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            className={`ctx-item ${displaySize === s.key ? 'active' : ''}`}
            onClick={() => setDisplaySize(s.key)}
          >{s.label}</button>
        ))}
        <div className="ctx-actions">
          <button
            type="button" className="ctx-btn"
            onClick={() => fileInputRef.current?.click()}
          >ファイルを選択</button>
          <button
            type="button" className="ctx-btn secondary"
            onClick={() => setView('menu')}
          >戻る</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onInsertImage?.({ lineNumber, displaySize, file });
            onClose?.();
          }}
        />
      </div>
    );
  }

  return null;
}
