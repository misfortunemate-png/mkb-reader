// 何を: JSON 整形表示（折りたたみ可能・自前シンタックスハイライト）
// なぜ: 仕様書 §10 — Claude.ai エクスポート JSON 等を読みやすく見たい
//
// 設計:
// - JSON.parse → React 再帰でレンダリング
// - キー/文字列/数値/真偽値を span でクラス分け（CSS 変数のテーマカラーで色分け）
// - object/array は左の三角タップで折りたたみ
// - 巨大 JSON（1MB 超）の場合は最初の N 行で打ち切り「続きを表示」

import { useMemo, useState } from 'react';

const MAX_PREVIEW_BYTES = 1024 * 1024; // 1MB
const MAX_PREVIEW_LINES = 1000;

export default function JsonRenderer({ content, name }) {
  const [showFull, setShowFull] = useState(false);
  const [parseError, setParseError] = useState(null);

  // パース（失敗時はエラー表示）
  const parsed = useMemo(() => {
    try {
      return { ok: true, value: JSON.parse(content) };
    } catch (e) {
      setParseError(e.message || String(e));
      return { ok: false, value: null };
    }
  }, [content]);

  // 大規模時の打ち切り（pretty-printed 行数で判定）
  const tooLarge = content.length > MAX_PREVIEW_BYTES;

  if (!parsed.ok) {
    return (
      <div className="json-view error">
        <p>JSON のパースに失敗しました</p>
        <pre>{parseError}</pre>
      </div>
    );
  }

  return (
    <div className="json-view">
      {name && <div className="json-filename">{name}</div>}
      {tooLarge && !showFull && (
        <Truncated value={parsed.value} maxLines={MAX_PREVIEW_LINES} onShowFull={() => setShowFull(true)} />
      )}
      {(!tooLarge || showFull) && <Node value={parsed.value} keyPath="$" depth={0} />}
    </div>
  );
}

// ───── 1MB 超の場合のフォールバック表示 ─────
function Truncated({ value, maxLines, onShowFull }) {
  const text = JSON.stringify(value, null, 2);
  const lines = text.split('\n').slice(0, maxLines).join('\n');
  return (
    <>
      <pre className="json-truncated">{lines}</pre>
      <div className="json-more">
        <button type="button" onClick={onShowFull} className="settings-btn">続きを表示（重い可能性あり）</button>
      </div>
    </>
  );
}

// ───── 再帰レンダリング ─────
function Node({ value, keyPath, depth }) {
  if (value === null) return <span className="json-null">null</span>;
  switch (typeof value) {
    case 'string':  return <span className="json-string">"{escape(value)}"</span>;
    case 'number':  return <span className="json-number">{String(value)}</span>;
    case 'boolean': return <span className="json-boolean">{String(value)}</span>;
    default: break; // object/array は下で扱う
  }
  if (Array.isArray(value)) return <Collapsible kind="array" value={value} keyPath={keyPath} depth={depth} />;
  if (typeof value === 'object') return <Collapsible kind="object" value={value} keyPath={keyPath} depth={depth} />;
  return <span>{String(value)}</span>;
}

function Collapsible({ kind, value, keyPath, depth }) {
  const isArray = kind === 'array';
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  const [open, setOpen] = useState(depth < 2); // デフォルトは深さ2まで開く

  if (entries.length === 0) {
    return <span className="json-empty">{isArray ? '[]' : '{}'}</span>;
  }

  return (
    <span className="json-collapsible">
      <button
        type="button"
        className="json-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? '折りたたむ' : '開く'}
      >
        {open ? '▼' : '▶'}
      </button>
      <span className="json-bracket">{isArray ? '[' : '{'}</span>
      {!open && <span className="json-summary">{` ${entries.length} 件 `}</span>}
      {open && (
        <div className="json-children" style={{ marginLeft: '1.2em' }}>
          {entries.map(([k, v], i) => (
            <div className="json-row" key={String(k)}>
              {!isArray && (
                <>
                  <span className="json-key">"{escape(String(k))}"</span>
                  <span className="json-colon">: </span>
                </>
              )}
              <Node value={v} keyPath={`${keyPath}.${k}`} depth={depth + 1} />
              {i < entries.length - 1 && <span className="json-comma">,</span>}
            </div>
          ))}
        </div>
      )}
      <span className="json-bracket">{isArray ? ']' : '}'}</span>
    </span>
  );
}

// 何を: 文字列値内の制御文字・引用符をエスケープ
// なぜ: HTML としての安全性 + 視認性
function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}
