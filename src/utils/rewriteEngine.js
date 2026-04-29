// 何を: 読み替えルールを「原本 MD テキスト」に適用して「表示用 MD テキスト」を返す純粋関数群
// なぜ: 仕様書 Phase 3b §0 の設計思想に従い、ビューアは「読み替え装置」として機能する。
//       読み替えは描画の直前で行い、原本（BookEntry.fileData）には一切手を入れない。
//
// 設計原則（厳守）:
//   1. ここに書かれる関数はすべて pure function（副作用ゼロ・引数だけで結果が決まる）
//   2. UI コンポーネントから完全に分離する（将来の長押しメニュー等での再利用に備える）
//   3. 適用順序: speakerNames → replacements → hiddenRanges → insertedAssets
//      - speakerNames は最初。Bold 化された話者名を先に正規化
//      - replacements は次。任意のテキスト一致置換
//      - hiddenRanges は次。指定行を除去（読み替え後の行番号ではなく原本基準で計算）
//      - insertedAssets は最後（§15 で実装）。非表示範囲の中に画像を挿入しないため

// ───── 型（参考、JS なので JSDoc コメント） ─────
//
// type RewriteRules = {
//   speakerNames?: { human?: string; assistant?: string };
//   replacements?: { id, pattern, display, scope, enabled }[];
//   hiddenRanges?: { id, chapterId, startLine, endLine, enabled }[];
//   insertedAssets?: { id, path, data, mimeType, insertAfter, altText, enabled }[];
// };

// 何を: 文字列内の「特定パターン」を一括置換する
// なぜ: replace は最初の 1 件しか置き換えない。全件置換は split/join で実装するのが無難
function replaceAll(str, pattern, replacement) {
  if (!pattern) return str;
  return str.split(pattern).join(replacement);
}

// 何を: 話者名 Bold 記法（**human** / **assistant**）を読み替える
// なぜ: 仕様書 §14 — 本文中の「human」という単語ではなく、Bold 内の話者名だけ対象にする
//   `**human**` のように行頭〜行末の Bold 記号で囲まれた sender 名のみ置換
function applySpeakerNames(md, speakerNames) {
  if (!speakerNames) return md;
  let out = md;
  for (const [from, to] of Object.entries(speakerNames)) {
    if (!to || to === from) continue;
    // **from** または **from** の前後に空白がある形を許容
    const re = new RegExp(`(\\*\\*)\\s*${escapeRegExp(from)}\\s*(\\*\\*)`, 'g');
    out = out.replace(re, `$1${to}$2`);
  }
  return out;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 何を: テキスト置換ルールを適用する
// なぜ: 仕様書 §14 — 完全一致のみ（正規表現は採用しない）。enabled が false のものはスキップ
//   置換箇所には HTML マーカー <mark class="rewritten">...</mark> を付与（CSS で薄く着色）
function applyReplacements(md, replacements, chapterId, highlight) {
  if (!Array.isArray(replacements) || replacements.length === 0) return md;
  let out = md;
  for (const r of replacements) {
    if (!r || !r.enabled) continue;
    if (!r.pattern) continue;
    if (r.scope && r.scope !== 'all' && r.scope !== chapterId) continue;
    const replacement = highlight
      ? `<mark class="rewritten">${escapeHtml(r.display ?? '')}</mark>`
      : (r.display ?? '');
    out = replaceAll(out, r.pattern, replacement);
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// 何を: 指定行範囲を非表示にする
// なぜ: 仕様書 §14 — hiddenRanges は原本の行番号基準で除去
//   行番号は 1-origin で扱う（ユーザー入力に直感的）
function applyHiddenRanges(md, ranges, chapterId) {
  if (!Array.isArray(ranges) || ranges.length === 0) return md;
  const lines = md.split('\n');
  const drop = new Set();
  for (const r of ranges) {
    if (!r || !r.enabled) continue;
    if (r.chapterId && r.chapterId !== chapterId && r.chapterId !== 'all') continue;
    const s = Math.max(1, Number(r.startLine) || 1);
    const e = Math.max(s, Number(r.endLine) || s);
    for (let i = s; i <= e; i++) drop.add(i);
  }
  if (drop.size === 0) return md;
  return lines.filter((_, i) => !drop.has(i + 1)).join('\n');
}

// 何を: 画像差し込み（§15）。指定行の後に画像 MD 記法を挿入
// なぜ: assetUrlOf は呼び出し側で「id → blob URL or assets/...パス」を解決する
//   閲覧時は Blob URL、エクスポート時は assets パスに切替できるよう関数を外注する
function applyInsertedAssets(md, assets, chapterId, assetUrlOf) {
  if (!Array.isArray(assets) || assets.length === 0) return md;
  // 同一行に複数挿入する場合は配列順を保ったまま、行番号の昇順で処理する
  const targets = assets
    .filter((a) => a && a.enabled !== false)
    .filter((a) => !a.insertAfter?.chapterId || a.insertAfter.chapterId === chapterId)
    .sort((a, b) => (a.insertAfter?.lineNumber || 0) - (b.insertAfter?.lineNumber || 0));
  if (targets.length === 0) return md;

  const lines = md.split('\n');
  // 後ろから挿入していけば挿入位置がずれない
  // line 0 の後 = 先頭、line.length の後 = 末尾
  for (let i = targets.length - 1; i >= 0; i--) {
    const a = targets[i];
    const ln = Math.max(0, Math.min(lines.length, Number(a.insertAfter?.lineNumber) || lines.length));
    const url = assetUrlOf?.(a) || a.path || '';
    const alt = (a.altText || '').replace(/"/g, '&quot;');
    // §21 §15 拡張: displaySize に応じた CSS クラスを付与
    // <img> HTML を直接生成して rehype-raw で描画（img-inline/img-block/img-fullpage）
    const cls = `img-${a.displaySize || 'block'}`;
    const imgMd = `\n<img src="${url}" alt="${alt}" class="${cls}" data-asset-id="${a.id}">\n`;
    lines.splice(ln, 0, imgMd);
  }
  return lines.join('\n');
}

// §21: 行単位の完全一致読み替え
// なぜ: lineEdits は replacements より先に適用する。
//   具体的なルール（行番号+テキスト特定）が汎用ルール（パターンマッチ）に上書きされないため。
//   lineNumber は data-source-line の値（1-origin）。start行から次の空行までを段落として扱う
function applyLineEdits(md, lineEdits, chapterId) {
  if (!Array.isArray(lineEdits) || lineEdits.length === 0) return md;
  const targets = lineEdits.filter(
    (e) => e && e.enabled !== false &&
      (!e.chapterId || e.chapterId === chapterId || e.chapterId === 'all'),
  );
  if (targets.length === 0) return md;

  const lines = md.split('\n');
  // 後ろから適用して行番号のずれを防ぐ
  const sorted = [...targets].sort((a, b) => (b.lineNumber || 0) - (a.lineNumber || 0));
  for (const edit of sorted) {
    const startIdx = (edit.lineNumber || 1) - 1; // 0-indexed
    if (startIdx < 0 || startIdx >= lines.length) continue;
    // 段落末尾（次の空行 or ファイル末尾）を探す
    let endIdx = startIdx;
    while (endIdx + 1 < lines.length && lines[endIdx + 1].trim() !== '') endIdx++;
    // original が指定されていれば簡易一致確認（内容が変わっていたらスキップ）
    if (edit.original) {
      const current = lines.slice(startIdx, endIdx + 1).join('\n');
      if (current.trim() !== edit.original.trim()) continue;
    }
    lines.splice(startIdx, endIdx - startIdx + 1, edit.display ?? '');
  }
  return lines.join('\n');
}

// 何を: 読み替え全体を適用する（純粋関数のエントリポイント）
// なぜ: MarkdownRenderer から「描画直前にこれを呼ぶだけ」で読み替えが完了する設計
//   適用順序（厳守）: speakerNames → lineEdits → replacements → hiddenRanges → insertedAssets
//   lineEdits（具体・行単位）を replacements（汎用・パターンマッチ）より先にする理由:
//   具体的なルールを汎用ルールが再上書きしないようにする
export function applyRewrite(originalMd, rules, chapterId = 'index', options = {}) {
  if (!originalMd) return '';
  if (!rules) return originalMd;
  const { highlight = true, assetUrlOf = null } = options;
  let out = originalMd;
  out = applySpeakerNames(out, rules.speakerNames);
  out = applyLineEdits(out, rules.lineEdits, chapterId);
  out = applyReplacements(out, rules.replacements, chapterId, highlight);
  out = applyHiddenRanges(out, rules.hiddenRanges, chapterId);
  out = applyInsertedAssets(out, rules.insertedAssets, chapterId, assetUrlOf);
  return out;
}

// 何を: ルールが「実質空」かを判定（全部 disabled / 空配列など）
// なぜ: ルールがあるのに見た目に変化が無いケースを UI でわかりやすく扱うため
export function isEmptyRules(rules) {
  if (!rules) return true;
  const sn = rules.speakerNames || {};
  if (sn.human || sn.assistant) return false;
  if ((rules.lineEdits || []).some((e) => e?.enabled !== false)) return false;
  if ((rules.replacements || []).some((r) => r?.enabled && r.pattern)) return false;
  if ((rules.hiddenRanges || []).some((r) => r?.enabled)) return false;
  if ((rules.insertedAssets || []).some((a) => a?.enabled !== false)) return false;
  return true;
}
