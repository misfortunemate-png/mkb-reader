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

// 何を: メッセージ配列 → MD テキスト
// なぜ: 各メッセージを `**話者名**` + 空行 + 本文 + `---` で連結する
//       Bold 話者名にする理由は読み替え対象（§14）として正規化するため
function messagesToMd(messages) {
  const lines = [];
  for (const m of messages) {
    const sender = String(m.sender || m.role || 'unknown');
    const text = typeof m.text === 'string' ? m.text
      : typeof m.content === 'string' ? m.content
      : '';
    lines.push(`**${sender}**`);
    lines.push('');
    lines.push(text.trim());
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
