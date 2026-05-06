// 何を: 複数ファイル・フォルダの一括本棚登録UI
// なぜ: §31 D-008 — ビューアを経由せず直接本棚に複数ファイルを取り込む導線を提供する
//       対応形式: .mkb .md .txt .html .json .cbz .zip .jpg/.jpeg/.png/.gif/.webp/.avif .pdf

import { useRef, useState } from 'react';
import { fileToBookEntry } from '../hooks/useBookshelf.js';
import { decodeText, convertTxtToMd } from '../utils/txtToMd.js';

// 何を: 拡張子 → fileType マッピング（useBookshelf の TYPE_BY_EXT と同一）
// なぜ: BatchImport はフック外で動くためローカル定数として保持
const TYPE_BY_EXT_LOCAL = {
  mkb: 'mkb', zip: 'zip', cbz: 'cbz',
  md: 'md', markdown: 'md', txt: 'txt',
  html: 'html', htm: 'html', json: 'json',
  jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', avif: 'avif',
  pdf: 'pdf',
};

// 何を: バイト数を人間が読みやすい文字列に変換
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 何を: webkitRelativePath から直近の親フォルダ名を取得
// なぜ: §31 — フォルダ選択時に親フォルダ名をタグとして自動付与する
function parentFolder(file) {
  const rel = file.webkitRelativePath || '';
  const parts = rel.split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

// 最大一括登録数
const MAX_FILES = 100;

/**
 * Props:
 *   onSaveBook(entry)            本棚へ保存する関数（useBookshelf の saveBook）
 *   findByTitle(title) → entry  重複チェック用（useBookshelf の findByTitle）
 *   onClose()                   閉じるコールバック
 */
export default function BatchImport({ onSaveBook, findByTitle, onClose }) {
  const [stage, setStage] = useState('select'); // 'select' | 'preview' | 'running' | 'done'
  const [items, setItems] = useState([]);       // { file, fileType, tag, supported }
  const [convertToMd, setConvertToMd] = useState({}); // { index: boolean }
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [skippedList, setSkippedList] = useState([]);
  const [savedCount, setSavedCount] = useState(0);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // 何を: File[] をアイテム一覧に変換してプレビュー表示
  function buildItems(files) {
    const list = Array.from(files).map((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const fileType = TYPE_BY_EXT_LOCAL[ext] || null;
      const tag = parentFolder(f);
      return { file: f, fileType, tag, supported: !!fileType };
    });
    setItems(list);
    setConvertToMd({});
    setStage('preview');
  }

  // 何を: 登録ループ — プレビュー確定後に実行
  async function runImport() {
    const targets = items.filter((it) => it.supported);
    setStage('running');
    setProgress({ done: 0, total: targets.length });
    const skipped = [];
    let saved = 0;

    for (let i = 0; i < targets.length; i++) {
      const it = targets[i];
      let file = it.file;

      // §33: txt の「MD変換」トグルが ON の場合は変換してから保存
      if (convertToMd[i] && /\.txt$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const { text } = decodeText(buf);
        if (text) {
          const md = convertTxtToMd(text);
          file = new File([md], file.name.replace(/\.txt$/i, '.md'), { type: 'text/markdown' });
        }
      }

      // 重複チェック（タイトルが一致する既存エントリがあればスキップ）
      const title = file.name.replace(/\.[^.]+$/, '');
      const dup = await findByTitle(title);
      if (dup) {
        skipped.push(it.file.name);
        setProgress({ done: i + 1, total: targets.length });
        continue;
      }

      // BookEntry を生成して保存
      const entry = await fileToBookEntry(file, {}, {});
      if (it.tag) entry.tags = [it.tag];
      await onSaveBook(entry);
      saved++;
      setProgress({ done: i + 1, total: targets.length });
    }

    setSkippedList(skipped);
    setSavedCount(saved);
    setStage('done');
  }

  // ────── レンダリング ──────

  if (stage === 'select') {
    return (
      <div className="batch-import-overlay" onClick={onClose}>
        <div className="batch-import-dialog" onClick={(e) => e.stopPropagation()}>
          <h2 className="batch-import-title">まとめて追加</h2>
          <p className="hint">複数のファイルまたはフォルダを本棚に一括登録します</p>
          <div className="batch-import-select-btns">
            <button
              type="button"
              className="file-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              ファイルを選択
            </button>
            <button
              type="button"
              className="file-btn"
              onClick={() => folderInputRef.current?.click()}
            >
              フォルダを選択
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mkb,.md,.markdown,.txt,.html,.htm,.json,.cbz,.zip,.jpg,.jpeg,.png,.gif,.webp,.avif,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.length) buildItems(e.target.files); e.target.value = ''; }}
          />
          {/* webkitdirectory: Chrome/Edge/Firefox 対応。Safari iOS 非対応だが Pixel 10 Chrome が主ターゲット */}
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.length) buildItems(e.target.files); e.target.value = ''; }}
          />
          <button type="button" className="file-btn" style={{ marginTop: '1rem', opacity: 0.6 }} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'preview') {
    const supported = items.filter((it) => it.supported);
    const overLimit = supported.length > MAX_FILES;
    return (
      <div className="batch-import-overlay" onClick={onClose}>
        <div className="batch-import-dialog batch-import-dialog--wide" onClick={(e) => e.stopPropagation()}>
          <h2 className="batch-import-title">登録内容の確認</h2>
          {overLimit && (
            <p className="error">
              対応ファイルが {supported.length} 件あります。一度に登録できるのは {MAX_FILES} ファイルまでです。
            </p>
          )}
          <div className="batch-import-list-wrap">
            <table className="batch-import-table">
              <thead>
                <tr>
                  <th>ファイル名</th>
                  <th>種別</th>
                  <th>サイズ</th>
                  <th>タグ</th>
                  <th>変換</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className={it.supported ? '' : 'batch-import-unsupported'}>
                    <td className="batch-import-name">{it.file.name}</td>
                    <td>{it.supported ? it.fileType : '対応外'}</td>
                    <td>{formatSize(it.file.size)}</td>
                    <td>{it.tag || '—'}</td>
                    <td>
                      {it.supported && /\.txt$/i.test(it.file.name) ? (
                        <label className="batch-import-toggle">
                          <input
                            type="checkbox"
                            checked={!!convertToMd[idx]}
                            onChange={(e) =>
                              setConvertToMd((prev) => ({ ...prev, [idx]: e.target.checked }))
                            }
                          />
                          MD変換
                        </label>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            {supported.length} 件登録
            {items.length - supported.length > 0 && `（${items.length - supported.length} 件は対応外のためスキップ）`}
          </p>
          <div className="vertical-confirm-btns">
            <button
              type="button"
              className="file-btn"
              disabled={overLimit || supported.length === 0}
              onClick={runImport}
            >
              すべて登録
            </button>
            <button type="button" className="file-btn" onClick={() => setStage('select')}>
              戻る
            </button>
            <button type="button" className="file-btn" onClick={onClose}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'running') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="batch-import-overlay">
        <div className="batch-import-dialog">
          <h2 className="batch-import-title">登録中…</h2>
          <p className="hint">{progress.done} / {progress.total} 件処理中</p>
          <div className="batch-import-progress-bar">
            <div className="batch-import-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // stage === 'done'
  return (
    <div className="batch-import-overlay">
      <div className="batch-import-dialog">
        <h2 className="batch-import-title">登録完了</h2>
        <p>{savedCount} 件を本棚に追加しました</p>
        {skippedList.length > 0 && (
          <>
            <p className="hint">以下のファイルは既に本棚にあるためスキップしました:</p>
            <ul className="batch-import-skip-list">
              {skippedList.map((name, i) => <li key={i}>{name}</li>)}
            </ul>
          </>
        )}
        <button type="button" className="file-btn" onClick={onClose} style={{ marginTop: '1rem' }}>
          閉じる
        </button>
      </div>
    </div>
  );
}
