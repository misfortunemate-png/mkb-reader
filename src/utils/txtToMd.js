// 何を: テキストデコード（UTF-8→Shift_JISフォールバック）+ txt→md変換ロジック
// なぜ: §33 D-009 / D-011 — txtファイル読み込み時の変換を一元管理する

/**
 * 何を: ArrayBuffer → 文字列（UTF-8 → Shift_JIS フォールバック）
 * なぜ: 日本語 txt は Shift_JIS で保存されているケースが多いため
 * @param {ArrayBuffer} buffer
 * @returns {{ text: string|null, encoding: string|null }}
 *   text=null は判定不能（エラー表示が必要）
 */
export function decodeText(buffer) {
  // まず UTF-8 で試みる
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) {
    return { text: utf8, encoding: 'UTF-8' };
  }
  // UTF-8 で文字化け → Shift_JIS（CP932）で再試行
  try {
    const sjis = new TextDecoder('shift_jis').decode(buffer);
    if (!sjis.includes('�')) {
      return { text: sjis, encoding: 'Shift_JIS' };
    }
  } catch {
    // shift_jis 非対応環境（稀）
  }
  // 両方で文字化け → 判定不能
  return { text: null, encoding: null };
}

/**
 * 何を: プレーンテキスト → Markdown 変換
 * なぜ: §33 — txt をそのまま本棚登録するより Markdown にすると書式設定や見出しが使える
 *
 * 変換ルール:
 *  1. 先頭の空行をスキップ
 *  2. 最初の非空行を # 見出し（既に # で始まる場合はそのまま）
 *  3. Markdown 記法（#, *, -, ```, > で始まる行）はそのまま保持
 *  4. 空行はそのまま保持（段落区切り）
 *  5. 一般テキスト行は行末に2スペース付与（Markdown での改行保持）
 *
 * @param {string} text プレーンテキスト
 * @returns {string} Markdown 文字列
 */
export function convertTxtToMd(text) {
  const lines = text.split(/\r?\n/);
  let titleDone = false;
  const out = [];

  for (const line of lines) {
    if (!titleDone) {
      // 先頭の空行はスキップ
      if (line.trim() === '') continue;
      titleDone = true;
      // 既に # で始まる場合はそのまま、そうでなければ # を付与
      out.push(line.startsWith('#') ? line : `# ${line.trim()}`);
    } else {
      // Markdown 記法行・空行はそのまま保持
      if (/^(#|\*|-|```|>)/.test(line) || line.trim() === '') {
        out.push(line);
      } else {
        // Markdown では行末2スペースで改行を保持する
        out.push(line + '  ');
      }
    }
  }

  return out.join('\n');
}
