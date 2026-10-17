// 何を: Claude.ai / ChatGPT conversations.json → MkbData / mkb ZIP バイナリ への変換
// なぜ: 仕様書 Phase 3b §18 — チャットログを「読み替え可能な原本」として取り込む。
//   §44: ChatGPT 形式は読込の段階で Claude.ai 形式の会話オブジェクトに正規化し、
//   以降（一覧・空会話の除外・分岐の選択・MD組立・保存）は Claude.ai と同じ経路を通す
//
// 設計思想（§0）への準拠:
//   - 話者名は **human** / **assistant** という Bold MD として埋め込む
//     → §14 の rewriteEngine で「Bold 内の human だけ置換」できるようにするため
//     → 本文中に「human」という単語が混じっていても置換しない
//   - メッセージ間は --- で区切る → §7 の表示方式設定（改ページ／線／余白／装飾）が
//     そのまま効くように。区切りの見た目はユーザーに委ねる
//   - 1 会話 = 1 mkb（chapters[0] にすべて）→ 構造を最小限に保ち、
//     チャプター分割は将来のローカル設定で対応可能

import JSZip from 'jszip';
import yaml from 'js-yaml';

// ───── 入力 JSON のパース ─────

// 何を: 1 メッセージ内の「文字列化できる本文」を取り出す（content[] / text 両対応）
// なぜ: 後段の isReadableConversation が「実質的に読める内容があるか」を判定するため
function extractMessageText(m) {
  if (!m || typeof m !== 'object') return '';
  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim();
  if (Array.isArray(m.content)) {
    const parts = [];
    for (const b of m.content) {
      if (!b) continue;
      if (typeof b === 'string') { parts.push(b); continue; }
      if (typeof b.text === 'string') parts.push(b.text);
      if (typeof b.thinking === 'string') parts.push(b.thinking);
    }
    return parts.join('').trim();
  }
  if (typeof m.content === 'string') return m.content.trim();
  return '';
}

// 何を: 「ビューアで読める会話」かを判定
// なぜ: Claude.ai のエクスポート JSON にはメモリ・プロジェクト・空 stub
//   等が同居することがあり、これらを取り込むと中身ナシのエントリーが本棚を汚す。
//   設計思想: 「会話だけを確実に読めるようにする」を最優先
//
// 判定基準:
//   1. chat_messages（または messages）が配列で 1 件以上ある
//   2. そのうち少なくとも 1 件が非空の本文を持つ（テキスト or thinking 等）
//   3. sender が 'human' / 'assistant' / 'user' のいずれかを少なくとも 1 件含む
//      → メモリやシステムだけのレコードを排除
export function isReadableConversation(c) {
  if (!c || typeof c !== 'object') return false;
  const msgs = Array.isArray(c.chat_messages) ? c.chat_messages
    : Array.isArray(c.messages) ? c.messages
    : null;
  if (!msgs || msgs.length === 0) return false;
  let hasContent = false;
  let hasDialogue = false;
  for (const m of msgs) {
    const sender = String(m?.sender || m?.role || '').toLowerCase();
    if (sender === 'human' || sender === 'assistant' || sender === 'user') hasDialogue = true;
    if (extractMessageText(m).length > 0) hasContent = true;
    if (hasContent && hasDialogue) return true;
  }
  return false;
}

// ───── ChatGPT 形式の正規化（§44） ─────

// 何を: 会話オブジェクトが ChatGPT 形式かを判定する
// なぜ: ChatGPT のエクスポートは発言を mapping（ノード id → ノード）の木で持ち、
//   Claude.ai 形式は持たない。これだけで自動判別できるので、利用者に形式を選ばせない
function isChatGptConversation(c) {
  return !!c && typeof c.mapping === 'object' && c.mapping !== null && !Array.isArray(c.mapping);
}

// 何を: UNIX 秒（小数あり）→ ISO 8601 文字列。数値でなければ null
// なぜ: Claude.ai 形式の created_at / updated_at は ISO 文字列なので、表示・保存側をそのまま使うため
function unixSecToIso(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
  const d = new Date(sec * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// 何を: content.parts のうち文字列だけを返す
// なぜ: multimodal_text の parts には画像ポインタ等のオブジェクトが混じる。画像は取り込まない
function stringParts(content) {
  return Array.isArray(content?.parts) ? content.parts.filter((p) => typeof p === 'string') : [];
}

// 何を: content から取り出せる文字列（content_type 以外の文字列フィールド＋文字列の parts）を集める
// なぜ: 道具の出力や未知の content_type は文字列の置き場が型ごとに違う（text / result / url …）。
//   型ごとの決め打ちにせず拾えるだけ拾い、情報を黙って落とさない
function contentStrings(content) {
  const out = [];
  if (content && typeof content === 'object') {
    for (const [k, v] of Object.entries(content)) {
      if (k === 'content_type') continue;
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
  }
  for (const p of stringParts(content)) if (p.trim()) out.push(p.trim());
  return out.join('\n\n');
}

// 何を: thoughts / reasoning_recap の本文を作る
// なぜ: thoughts は { summary, content } の配列、reasoning_recap は content に「○秒間の思考」等の文字列
function thoughtsText(content) {
  if (content.content_type === 'reasoning_recap') {
    return typeof content.content === 'string' ? content.content.trim() : '';
  }
  const list = Array.isArray(content.thoughts) ? content.thoughts : [];
  return list
    .map((t) => {
      const lines = [];
      if (typeof t?.summary === 'string' && t.summary.trim()) lines.push(`**${t.summary.trim()}**`);
      if (typeof t?.content === 'string' && t.content.trim()) lines.push(t.content.trim());
      return lines.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

// 何を: 本文をコードフェンスで囲む。本文中のバッククォート連続より長いフェンスを使う
// なぜ: コード中に ``` があってもフェンスが途中で閉じないようにする
function codeFence(code, language) {
  const longest = Math.max(0, ...(String(code).match(/`+/g) || []).map((s) => s.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language || ''}\n${code}\n${fence}`;
}

const CHATGPT_THINKING_TYPES = new Set(['thoughts', 'reasoning_recap']);

// 何を: ChatGPT の 1 メッセージ → Claude.ai 形式の content[] ブロック
// なぜ: 既存の messageBodyToMd が text / thinking / tool_result を描き分けるので、
//   その形に写せば思考は claude-thinking、道具は claude-tool の折りたたみにそのまま乗る。
//   道具の見出しには content_type（あれば道具名も）を出す → tool_result の tool_use_id 欄に入れる
function chatGptMessageToBlocks(message) {
  const content = message.content && typeof message.content === 'object' ? message.content : {};
  const ct = String(content.content_type || 'unknown');
  const role = String(message.author?.role || '');

  if (CHATGPT_THINKING_TYPES.has(ct)) {
    const t = thoughtsText(content);
    return t ? [{ type: 'thinking', thinking: t }] : [];
  }
  if (role !== 'tool') {
    if (ct === 'text' || ct === 'multimodal_text') {
      const t = stringParts(content).join('\n').trim();
      return t ? [{ type: 'text', text: t }] : [];
    }
    if (ct === 'code') {
      const code = typeof content.text === 'string' ? content.text : '';
      return code.trim() ? [{ type: 'text', text: codeFence(code, content.language) }] : [];
    }
  }
  // role が tool のもの・execution_output 等の道具出力・未知の型 → 道具の折りたたみ
  const toolName = message.author?.name ? String(message.author.name) : '';
  return [{
    type: 'tool_result',
    tool_use_id: toolName ? `${ct}: ${toolName}` : ct,
    content: contentStrings(content),
  }];
}

// 何を: 表示しないノードかを判定する
// なぜ: ChatGPT の mapping には木の根（message: null）・不可視の system・カスタム指示
//   （user_editable_context）など、画面に出ないノードが混じる
function isExcludedChatGptNode(node) {
  const m = node?.message;
  if (!m || typeof m !== 'object') return true;
  if (m.metadata?.is_visually_hidden_from_conversation) return true;
  if (m.content?.content_type === 'user_editable_context') return true;
  if (m.author?.role === 'system' && !contentStrings(m.content)) return true;
  return false;
}

const CHATGPT_ROLE_TO_SENDER = { user: 'human', assistant: 'assistant', tool: 'assistant' };

// 何を: mapping のノード id を、親が子より先に来る順（根からの深さ優先・children の順）に並べる
// なぜ: mapping はオブジェクトで順序の保証がない。「全分岐」表示と分岐選択のフォールバックは
//   配列順に依存するので、木の順に並べ直す。辿れないノード（循環等）も末尾に残す
function orderChatGptNodeIds(mapping) {
  const ids = Object.keys(mapping);
  const seen = new Set();
  const order = [];
  const roots = ids.filter((id) => {
    const p = mapping[id]?.parent;
    return !p || !mapping[p];
  });
  const stack = [...roots].reverse();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !mapping[id]) continue;
    seen.add(id);
    order.push(id);
    const children = Array.isArray(mapping[id].children) ? mapping[id].children : [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(String(children[i]));
  }
  for (const id of ids) if (!seen.has(id)) order.push(id);
  return order;
}

// 何を: ChatGPT 形式の 1 会話 → Claude.ai 形式の会話オブジェクト
// なぜ: §44 方式 — 読込段階で正規化し、以降は Claude.ai と同じ処理経路を通す
function normalizeChatGptConversation(c) {
  const mapping = c.mapping;
  const excluded = new Set(Object.keys(mapping).filter((id) => isExcludedChatGptNode(mapping[id])));

  // 何を: 除外されていない最も近い祖先（自身を含む）を返す
  // なぜ: 除外ノードを親に持つ発言を、表示される祖先につなぎ直して木を保つため
  const keptAncestor = (startId) => {
    const guard = new Set();
    let cur = startId ? String(startId) : null;
    while (cur && mapping[cur] && !guard.has(cur)) {
      guard.add(cur);
      if (!excluded.has(cur)) return cur;
      cur = mapping[cur].parent ? String(mapping[cur].parent) : null;
    }
    return null;
  };

  const chat_messages = [];
  for (const id of orderChatGptNodeIds(mapping)) {
    if (excluded.has(id)) continue;
    const m = mapping[id].message;
    const role = String(m.author?.role || '');
    const msg = {
      uuid: id, // mapping のキー（= ノード id）。parent の参照先と同じ値に揃える
      parent_message_uuid: keptAncestor(mapping[id].parent),
      sender: CHATGPT_ROLE_TO_SENDER[role] || role || 'unknown',
      content: chatGptMessageToBlocks(m),
    };
    const created = unixSecToIso(m.create_time);
    if (created) msg.created_at = created;
    chat_messages.push(msg);
  }

  const conv = {
    uuid: c.conversation_id || c.id,
    name: c.title,
    created_at: unixSecToIso(c.create_time),
    updated_at: unixSecToIso(c.update_time),
    current_leaf_message_uuid: keptAncestor(c.current_node),
    chat_messages,
  };
  if (c.default_model_slug) conv.model = c.default_model_slug;
  return conv;
}

// 何を: conversations.json の中身を寛容に取り出す
// なぜ: トップレベルが配列でない（{ conversations: [...] } のような）変形にも対応。
//   メモリ／プロジェクトなど「会話以外のレコード」を除外する責務はここではなく、
//   呼び出し側（ChatImporter）で isReadableConversation を使って分離する
export function parseConversationsJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON のパースに失敗しました: ' + (e.message || e));
  }
  let arr;
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.conversations)) arr = data.conversations;
  else if (Array.isArray(data?.data)) arr = data.data;
  else throw new Error('Claude.ai または ChatGPT の conversations.json 形式と認識できません');

  // 必要最低限のフィールドを正規化（ChatGPT 形式は先に Claude.ai 形式へ写す）
  return arr.map((raw) => (isChatGptConversation(raw) ? normalizeChatGptConversation(raw) : raw)).map((c) => ({
    uuid: String(c.uuid || c.id || crypto.randomUUID()),
    name: String(c.name || c.title || ''),
    created_at: c.created_at || c.createdAt || null,
    updated_at: c.updated_at || c.updatedAt || null,
    model: c.model || '',
    current_leaf_message_uuid: c.current_leaf_message_uuid || c.current_leaf || c.leaf_message_uuid || null,
    chat_messages: Array.isArray(c.chat_messages) ? c.chat_messages
      : Array.isArray(c.messages) ? c.messages
      : [],
  }));
}

// ───── MD 組み立て ─────

// 何を: 1 メッセージの中身を MD 文字列に展開する
// なぜ: Claude.ai のエクスポートは新旧フォーマット混在。
//   - 旧: m.text に最終応答が文字列で入っている
//   - 新: m.content[] に { type, ... } のブロック配列。type='text' / 'thinking' /
//         'tool_use' / 'tool_result' 等が混在
//   思考・ツール出力と最終応答を視覚的に区別する（読み手は応答を主、思考を副として読みたい）。
//   <details> で折りたたむことで:
//     - 既定では応答だけ目に入る
//     - タップで思考を展開できる
//     - 読み替えルール（§14）の対象としても扱える（テキストとして MD 内に存在する）
function messageBodyToMd(m) {
  const blocks = Array.isArray(m.content) ? m.content : null;
  // 旧フォーマット（content が string か無い）→ text を使う
  if (!blocks) {
    const t = typeof m.text === 'string' ? m.text
      : typeof m.content === 'string' ? m.content
      : '';
    return t.trim();
  }
  const out = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const type = String(b.type || 'text');
    if (type === 'text') {
      const t = typeof b.text === 'string' ? b.text : '';
      if (t.trim()) out.push(t.trim());
    } else if (type === 'thinking') {
      const t = typeof b.thinking === 'string' ? b.thinking
        : typeof b.text === 'string' ? b.text : '';
      if (t.trim()) {
        out.push('<details class="claude-thinking"><summary>思考</summary>\n\n' + t.trim() + '\n\n</details>');
      }
    } else if (type === 'tool_use') {
      // 簡略表示: name + input(JSON)
      const name = String(b.name || 'tool');
      let body = '';
      try { body = JSON.stringify(b.input ?? {}, null, 2); } catch { body = ''; }
      out.push(`<details class="claude-tool"><summary>tool_use: ${escapeHtml(name)}</summary>\n\n\`\`\`json\n${body}\n\`\`\`\n\n</details>`);
    } else if (type === 'tool_result') {
      const tcid = String(b.tool_use_id || '');
      let bodyText = '';
      // tool_result.content は array or string
      if (Array.isArray(b.content)) {
        bodyText = b.content
          .map((x) => (typeof x === 'string' ? x : (x?.text || '')))
          .filter(Boolean)
          .join('\n\n');
      } else if (typeof b.content === 'string') {
        bodyText = b.content;
      }
      out.push(`<details class="claude-tool"><summary>tool_result${tcid ? ` (${escapeHtml(tcid)})` : ''}</summary>\n\n${bodyText.trim()}\n\n</details>`);
    } else {
      // 未知タイプはコメントとして残す
      out.push(`<!-- ${escapeHtml(type)} block omitted -->`);
    }
  }
  // content[] が空 / 取れなかった場合は m.text にフォールバック
  if (out.length === 0 && typeof m.text === 'string') return m.text.trim();
  return out.join('\n\n');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// 何を: メッセージ配列 → MD テキスト
// なぜ: 各メッセージを `**話者名**` + 空行 + 本文 + `---` で連結する
//       Bold 話者名にする理由は読み替え対象（§14）として正規化するため
function messagesToMd(messages) {
  const lines = [];
  for (const m of messages) {
    const sender = String(m.sender || m.role || 'unknown');
    const body = messageBodyToMd(m);
    lines.push(`**${sender}**`);
    lines.push('');
    lines.push(body);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

// タイトル決定: name が空なら uuid の先頭 8 文字
function titleOf(conv) {
  const t = (conv.name || '').trim();
  if (t) return t;
  return `Untitled-${String(conv.uuid).slice(0, 8)}`;
}

// 何を: 題名からファイル名（拡張子なし）を作る
// なぜ: 書庫へ保存の既定の保存先は「題名.mkb」。Windows では \ / : * ? " < > | が使えず、
//   特に「:」は代替データストリームと解釈されて 0 バイトの実体ができる（mkb-reader#2）。
//   題名の読みやすさを保つため、禁止文字は消さずに全角の同じ形へ置き換える。
//   「/」も置き換えて、題名がフォルダの区切りにならないようにする
const FILENAME_CHAR_MAP = {
  '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜',
};
export function toSafeFileName(title) {
  const replaced = Array.from(String(title ?? ''))
    .filter((ch) => ch.charCodeAt(0) > 0x1f) // 制御文字（U+0000〜U+001F）を取り除く
    .map((ch) => FILENAME_CHAR_MAP[ch] || ch)
    .join('');
  // 末尾の空白・ピリオドは Windows が黙って落とすので、先に取り除いて名前を確定させる
  const trimmed = replaced.replace(/[\s.]+$/u, '');
  return trimmed || 'untitled';
}

// 何を: 会話のツリー構造から「現在表示されている分岐」だけを抽出する
// なぜ: Claude.ai は編集・再生成で枝を作り、古い枝も chat_messages[] に残す。
//   そのまま並べると編集前後の両方が出てしまうので、active leaf からルートまでを
//   parent_message_uuid を辿って復元し、その経路上のメッセージだけ返す。
//
// 戦略:
//   1. conversation.current_leaf_message_uuid があればそれを葉として採用
//   2. 無ければ「他から親として参照されていない（葉である）うち最後のもの」を葉と推定
//   3. parent_message_uuid を辿りながらルートに向けて回収。途中でループや欠損があれば
//      残った部分はフォールバックで全件返す（情報を失わないことを優先）
function selectActiveBranch(messages, leafHint) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const parentOf = (m) => m?.parent_message_uuid || m?.parent_uuid || m?.parent || null;

  // 何を: ツリー情報の有無を判定し、無ければ全件返す
  // なぜ: parent_message_uuid を持つメッセージが 1 件もなく、leafHint も無いなら、
  //   分岐の概念が無い「平坦なメッセージ列」とみなす。この早期 return が無いと、
  //   後段の「葉から遡る」ロジックが最後の 1 件しか拾えず、human の発言が消える事案が出る
  const hasTreeData = leafHint || messages.some((m) => parentOf(m));
  if (!hasTreeData) return messages;

  // uuid → message
  const byId = new Map();
  for (const m of messages) {
    const id = m.uuid || m.id;
    if (id) byId.set(String(id), m);
  }
  // 「親として参照されている uuid 集合」を作って、参照されていない＝葉候補を見つける
  const referencedAsParent = new Set();
  for (const m of messages) {
    const p = parentOf(m);
    if (p) referencedAsParent.add(String(p));
  }
  // 葉候補
  let leafId = leafHint && byId.has(String(leafHint)) ? String(leafHint) : null;
  if (!leafId) {
    // 後方から走査して最初に見つかった「葉」を採用
    for (let i = messages.length - 1; i >= 0; i--) {
      const id = messages[i].uuid || messages[i].id;
      if (id && !referencedAsParent.has(String(id))) {
        leafId = String(id);
        break;
      }
    }
  }
  if (!leafId) return messages; // ツリー判定不能 → 全件返す（フォールバック）
  // leaf → root の順に集めて、最後に reverse
  const path = [];
  const visited = new Set();
  let cur = byId.get(leafId);
  while (cur) {
    const id = String(cur.uuid || cur.id || '');
    if (!id || visited.has(id)) break;
    visited.add(id);
    path.push(cur);
    const pid = parentOf(cur);
    if (!pid) break;
    cur = byId.get(String(pid)) || null;
  }
  // 何を: 葉から root まで完全に辿れず path が短すぎる場合は全件にフォールバック
  // なぜ: ツリー上一部のメッセージしか parent を持たない部分構造で、path が 1 件などに
  //   なって元データを失うのを防ぐ。「全件返す」方が情報保存的に安全
  if (path.length <= 1 && messages.length > 1) return messages;
  if (path.length === 0) return messages;
  return path.reverse();
}

// 何を: 1 会話 → MkbData（既存の MkbData 構造に合わせる）
// なぜ: ビューアは MkbData を描画する前提なので、変換結果も同じ形にする
//
// options:
//   - branch: 'active' | 'all' (default 'active')
//     'active' → 編集後の最終分岐のみ（current_leaf_message_uuid を辿る）
//     'all'    → 全メッセージ（旧分岐も含む。デバッグ用途）
export function conversationToMkbData(conv, options = {}) {
  const branchMode = options.branch || 'active';
  const title = titleOf(conv);
  const all = conv.chat_messages || [];
  const leafHint = conv.current_leaf_message_uuid || conv.current_leaf || conv.leaf_message_uuid || null;
  const messages = branchMode === 'all' ? all : selectActiveBranch(all, leafHint);
  const md = `# ${title}\n\n${messagesToMd(messages)}`;
  return {
    metadata: {
      title,
      author: '', // ユーザーが §14 のローカル設定で読み替える
      model: conv.model || undefined,
      created_at: conv.created_at || undefined,
    },
    chapters: [
      {
        id: 'index',
        title,
        content: md,
        order: 0,
      },
    ],
    assets: new Map(),
  };
}

// ───── MkbData → mkb ZIP バイナリ（本棚保存用） ─────

// 何を: MkbData を mkb 形式（ZIP）にシリアライズして ArrayBuffer を返す
// なぜ: 本棚（IndexedDB）には fileData: ArrayBuffer で保存する。
//       fileType:'mkb' として保存すれば、開き直す時に既存の parseMkbZip がそのまま使える
//       → 設計思想に沿い、変換結果を「ただの mkb」として扱える
export async function mkbDataToZipBuffer(mkb) {
  const zip = new JSZip();
  // markbook.yaml: メタデータ
  const meta = {
    title: mkb.metadata?.title || 'Untitled',
    author: mkb.metadata?.author || '',
  };
  if (mkb.metadata?.model) meta.model = mkb.metadata.model;
  if (mkb.metadata?.created_at) meta.created_at = mkb.metadata.created_at;
  zip.file('markbook.yaml', yaml.dump(meta, { lineWidth: -1 }));
  // index.md は chapters[0]、それ以外は pages/{id}.md として配置
  const ch0 = mkb.chapters[0];
  if (ch0) zip.file('index.md', ch0.content);
  for (let i = 1; i < mkb.chapters.length; i++) {
    const c = mkb.chapters[i];
    zip.file(`pages/${c.id}.md`, c.content);
  }
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// 何を: 1 会話 → BookEntry（本棚一括保存用）
// なぜ: ChatImporter の「複数選択 → 一括保存」で使う
export async function conversationToBookEntry(conv, options = {}) {
  const mkb = conversationToMkbData(conv, options);
  const charCount = mkb.chapters.reduce((sum, c) => sum + (c.content?.length || 0), 0);
  const ab = await mkbDataToZipBuffer(mkb);
  return {
    id: crypto.randomUUID(),
    title: mkb.metadata.title,
    author: mkb.metadata.author || '',
    fileType: 'mkb',
    fileData: ab,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
    charCount,
    localSettings: undefined,
  };
}
