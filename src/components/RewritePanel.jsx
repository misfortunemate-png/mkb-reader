// 何を: 読み替え設定パネル（仕様書 Phase 3b §14）
// なぜ: ビューア画面のヘッダー ✏ ボタンから開く。話者名・テキスト置換・行非表示の CRUD UI
//
// 設計原則:
//   - UI から useRewrite に渡し、useRewrite が rewriteEngine を意識せずに rules を CRUD する
//   - SettingsPanel と同じボトムシート操作体系
//   - 話者名のテキスト入力は内部で 300ms debounce してから IndexedDB に保存
//   - 「原本プレビュー」セクションを折りたたみで提供（行番号付き）
//     → 仕様書 Q3 への暫定対応。Phase 3b では本文長押しメニューは未実装

import { useEffect, useRef, useState } from 'react';

function useDebouncedSave(initial, save, delay = 300) {
  const [value, setValue] = useState(initial);
  const timer = useRef(null);
  useEffect(() => { setValue(initial); }, [initial]);
  function onChange(v) {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), delay);
  }
  // unmount で flush
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      save(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [value, onChange];
}

function SpeakerNameRow({ sender, label, current, onChange }) {
  const [val, setVal] = useDebouncedSave(current || '', (v) => onChange(sender, v));
  return (
    <div className="rw-row">
      <label className="rw-label">{label}</label>
      <span className="rw-arrow">→</span>
      <input
        type="text"
        className="rw-input"
        value={val}
        placeholder={`${sender}（変更しない）`}
        onChange={(e) => setVal(e.target.value)}
      />
    </div>
  );
}

function ReplacementRow({ rep, onUpdate, onRemove }) {
  const [pattern, setPattern] = useDebouncedSave(rep.pattern || '', (v) => onUpdate(rep.id, { pattern: v }));
  const [display, setDisplay] = useDebouncedSave(rep.display || '', (v) => onUpdate(rep.id, { display: v }));
  return (
    <div className="rw-rep">
      <input type="checkbox" checked={!!rep.enabled}
        onChange={(e) => onUpdate(rep.id, { enabled: e.target.checked })}
        aria-label="有効化" />
      <input type="text" className="rw-input" placeholder="検索文字列"
        value={pattern} onChange={(e) => setPattern(e.target.value)} />
      <span className="rw-arrow">→</span>
      <input type="text" className="rw-input" placeholder="表示文字列"
        value={display} onChange={(e) => setDisplay(e.target.value)} />
      <button type="button" className="rw-x" onClick={() => onRemove(rep.id)} aria-label="削除">✕</button>
    </div>
  );
}

function HiddenRangeRow({ range, onUpdate, onRemove }) {
  const [s, setS] = useDebouncedSave(range.startLine ?? 1, (v) => onUpdate(range.id, { startLine: Number(v) || 1 }));
  const [e, setE] = useDebouncedSave(range.endLine ?? 1, (v) => onUpdate(range.id, { endLine: Number(v) || 1 }));
  return (
    <div className="rw-range">
      <input type="checkbox" checked={!!range.enabled}
        onChange={(ev) => onUpdate(range.id, { enabled: ev.target.checked })}
        aria-label="有効化" />
      <input type="number" min="1" className="rw-num" value={s}
        onChange={(ev) => setS(ev.target.value)} aria-label="開始行" />
      <span className="rw-arrow">〜</span>
      <input type="number" min="1" className="rw-num" value={e}
        onChange={(ev) => setE(ev.target.value)} aria-label="終了行" />
      <span className="rw-hint">行を非表示</span>
      <button type="button" className="rw-x" onClick={() => onRemove(range.id)} aria-label="削除">✕</button>
    </div>
  );
}

export default function RewritePanel({
  open,
  onClose,
  rules,
  setSpeakerName,
  addReplacement, updateReplacement, removeReplacement,
  addHiddenRange, updateHiddenRange, removeHiddenRange,
  // 原本プレビュー用（チャプターの content）
  currentChapter,
  // 画像差し込み（§15）入口
  onAddImage,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // 原本プレビュー（行番号付き）
  const lines = (currentChapter?.content || '').split('\n');

  return (
    <>
      <div className={`settings-overlay ${open ? 'show' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`settings-sheet ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="読み替え設定">
        <div className="settings-handle" onClick={onClose} />

        <section className="settings-section">
          <h3>話者名</h3>
          <SpeakerNameRow sender="human" label="human" current={rules.speakerNames?.human} onChange={setSpeakerName} />
          <SpeakerNameRow sender="assistant" label="assistant" current={rules.speakerNames?.assistant} onChange={setSpeakerName} />
        </section>

        <section className="settings-section">
          <header className="rw-sec-header">
            <h3 style={{ flex: 1 }}>テキスト置換</h3>
            <button type="button" className="settings-btn" onClick={() => addReplacement()}>＋ 追加</button>
          </header>
          {(rules.replacements || []).length === 0 ? (
            <p className="rw-empty">なし</p>
          ) : (
            <div className="rw-list">
              {rules.replacements.map((r) => (
                <ReplacementRow key={r.id} rep={r} onUpdate={updateReplacement} onRemove={removeReplacement} />
              ))}
            </div>
          )}
        </section>

        <section className="settings-section">
          <header className="rw-sec-header">
            <h3 style={{ flex: 1 }}>非表示範囲（行）</h3>
            <button
              type="button"
              className="settings-btn"
              onClick={() => addHiddenRange({ chapterId: currentChapter?.id || 'all', startLine: 1, endLine: 1 })}
            >＋ 追加</button>
          </header>
          {(rules.hiddenRanges || []).length === 0 ? (
            <p className="rw-empty">なし</p>
          ) : (
            <div className="rw-list">
              {rules.hiddenRanges.map((r) => (
                <HiddenRangeRow key={r.id} range={r} onUpdate={updateHiddenRange} onRemove={removeHiddenRange} />
              ))}
            </div>
          )}
          <button
            type="button"
            className="details-toggle"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? '▾ 原本プレビューを閉じる' : '▸ 原本プレビュー（行番号確認）'}
          </button>
          {previewOpen && (
            <pre className="rw-preview">
              {lines.map((line, i) => (
                <div key={i} className="rw-prev-line">
                  <span className="rw-prev-num">{i + 1}</span>
                  <span className="rw-prev-text">{line || ' '}</span>
                </div>
              ))}
            </pre>
          )}
        </section>

        {onAddImage && (
          <section className="settings-section">
            <h3>画像</h3>
            <button type="button" className="settings-btn" onClick={onAddImage}>＋ 画像を差し込む</button>
          </section>
        )}
      </div>
    </>
  );
}
