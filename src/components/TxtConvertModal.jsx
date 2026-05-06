// 何を: txt 読み込み時の変換確認ダイアログ
// なぜ: §33 D-009 — txtをMarkdownに変換するか、テキストのままにするかをユーザーが選択する
//       縦書き確認ダイアログと同じ導線・スタイルを踏襲する

import { useState } from 'react';

/**
 * Props:
 *   fileName       {string}   読み込んだファイル名
 *   originalText   {string}   変換前テキスト
 *   convertedText  {string}   変換後 Markdown テキスト
 *   onConvert      {Function} 「Markdownに変換」押下時
 *   onKeepTxt      {Function} 「テキストのまま」押下時
 *   onCancel       {Function} キャンセル押下時
 */
export default function TxtConvertModal({
  fileName,
  originalText,
  convertedText,
  onConvert,
  onKeepTxt,
  onCancel,
}) {
  const [tab, setTab] = useState('converted'); // 'converted' | 'original'

  return (
    <div className="vertical-pending-overlay" onClick={onCancel}>
      <div className="txt-convert-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="hint">{fileName}</p>

        {/* タブ切替: 変換後 / 変換前 */}
        <div className="txt-convert-tabs">
          <button
            type="button"
            className={tab === 'converted' ? 'active' : ''}
            onClick={() => setTab('converted')}
          >
            変換後
          </button>
          <button
            type="button"
            className={tab === 'original' ? 'active' : ''}
            onClick={() => setTab('original')}
          >
            変換前
          </button>
        </div>

        {/* プレビュー */}
        <pre className="txt-convert-preview">
          {tab === 'converted' ? convertedText : originalText}
        </pre>

        {/* アクションボタン */}
        <div className="vertical-confirm-btns">
          <button type="button" className="file-btn" onClick={onConvert}>
            Markdownに変換
          </button>
          <button type="button" className="file-btn" onClick={onKeepTxt}>
            テキストのまま
          </button>
          <button type="button" className="file-btn" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
