// 何を: Claude.ai conversations.json → MkbData / mkb ZIP バイナリ への変換
// なぜ: 仕様書 Phase 3b §18 — チャットログを「読み替え可能な原本」として取り込む。
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

// 何を: conversations.json の中身を寛容に取り出す
// なぜ: トップレベルが配列でない（{ conversations: [...] } のような）変形にも対応
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
  else throw new Error('Claude.ai の conversations.json 形式と認識できません');

  // 必要最低限のフィールドを正規化
  return arr.map((c) => ({
    uuid: String(c.uuid || c.id || crypto.randomUUID()),
    name: String(c.name || c.title || ''),
    created_at: c.created_at || c.createdAt || null,
    updated_at: c.updated_at || c.updatedAt || null,
    model: c.model || '',
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

// 何を: 1 会話 → MkbData（既存の MkbData 構造に合わせる）
// なぜ: ビューアは MkbData を描画する前提なので、変換結果も同じ形にする
export function conversationToMkbData(conv) {
  const title = titleOf(conv);
  const md = `# ${title}\n\n${messagesToMd(conv.chat_messages || [])}`;
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
export async function conversationToBookEntry(conv) {
  const mkb = conversationToMkbData(conv);
  const ab = await mkbDataToZipBuffer(mkb);
  return {
    id: crypto.randomUUID(),
    title: mkb.metadata.title,
    author: mkb.metadata.author || '',
    fileType: 'mkb',
    fileData: ab,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
    localSettings: undefined,
  };
}
