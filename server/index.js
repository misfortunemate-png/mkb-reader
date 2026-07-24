// 何を: mkb-reader 書庫サーバ（§35）
// なぜ: フラン上のファイルを Pixel 10 から Tailscale 経由で閲覧・保存できる基盤を提供する
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveSafe } from './resolveSafe.js';
import yaml from 'js-yaml';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '8788', 10);
const LIBRARY_ROOT = path.resolve(process.env.LIBRARY_ROOT || 'D:\\AI\\mkb-library\\public');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const VERSION = '0.2.0';

// §35.3 索引スキーマ: 拡張子 → kind
const KIND_MAP = {
  '.mkb': 'mkb', '.md': 'md', '.markdown': 'md',
  '.txt': 'text', '.pdf': 'pdf', '.epub': 'epub',
  '.html': 'html', '.htm': 'html', '.json': 'json',
  '.cbz': 'cbz', '.zip': 'cbz',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
  '.gif': 'image', '.webp': 'image', '.avif': 'image', '.bmp': 'image',
  // §41 動画
  '.mp4': 'video', '.webm': 'video', '.mkv': 'video', '.mov': 'video', '.avi': 'video',
};

// Content-Type マッピング
const CONTENT_TYPES = {
  '.mkb': 'application/zip',
  '.cbz': 'application/zip',
  '.zip': 'application/zip',
  '.epub': 'application/epub+zip',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  // §41 動画（Express sendFile が Range 対応済みのためストリーミングも機能する）
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
};

// §35.3 mkb ヘッダ抽出（パース失敗時はファイル名にフォールバック）
async function extractMkbMeta(abs) {
  try {
    const buf = await fs.promises.readFile(abs); // S-1: 非同期化
    const zip = await JSZip.loadAsync(buf);
    const yamlEntry = zip.file(/^markbook\.ya?ml$/i)[0];
    if (!yamlEntry) return {};
    const text = await yamlEntry.async('string');
    const meta = yaml.load(text) || {};
    const pageCount = zip.file(/^pages\/[^/]+\.md$/i).length;
    const hasIndex = !!zip.file(/^index\.md$/i)[0];
    return {
      title: meta.title || null,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      chapters: pageCount + (hasIndex ? 1 : 0),
    };
  } catch {
    return {};
  }
}

// §35.3 索引生成（LIBRARY_ROOT を再帰走査）
// S-1: readdirSync/statSync → 非同期化。Promise.all で batch 50 並行 stat
async function buildIndex() {
  console.time('buildIndex'); // S-4
  if (!fs.existsSync(LIBRARY_ROOT)) {
    console.warn(`LIBRARY_ROOT not found: ${LIBRARY_ROOT}`);
    console.timeEnd('buildIndex');
    return { version: 1, generatedAt: new Date().toISOString(), files: [] };
  }
  const entries = [];
  const BATCH = 50;
  async function walk(dir, base) {
    let names;
    try { names = await fs.promises.readdir(dir); } catch { return; }
    for (let i = 0; i < names.length; i += BATCH) {
      await Promise.all(names.slice(i, i + BATCH).map(async (name) => {
        const rel = (base ? `${base}/${name}` : name).replace(/\\/g, '/');
        const abs = path.join(dir, name);
        let stat;
        try { stat = await fs.promises.stat(abs); } catch { return; }
        if (stat.isDirectory()) { await walk(abs, rel); return; }
        entries.push({ abs, rel, stat });
      }));
    }
  }
  await walk(LIBRARY_ROOT, '');

  const files = [];
  for (const { abs, rel, stat } of entries) {
    const ext = path.extname(rel).toLowerCase();
    const kind = KIND_MAP[ext] || 'other';
    let title = path.basename(rel, path.extname(rel));
    let meta = { chapters: 0, tags: [] };
    if (kind === 'mkb') {
      const m = await extractMkbMeta(abs);
      if (m.title) title = m.title;
      meta = { chapters: m.chapters || 0, tags: m.tags || [] };
    }
    files.push({
      path: rel,
      kind,
      title,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      meta,
    });
  }
  console.timeEnd('buildIndex'); // S-4
  console.log(`buildIndex: ${files.length} files`);
  return { version: 1, generatedAt: new Date().toISOString(), files };
}

// 索引メモリキャッシュ（起動時生成、rescan=1 で再生成）
let indexCache = null;

async function getIndex(rescan = false) {
  if (!indexCache || rescan) indexCache = await buildIndex();
  return indexCache;
}

// ───── Express ─────
const app = express();

// S-2: PUT ボディを raw バイナリとして受信（PUT ルートのみに適用）
const rawParser = express.raw({ type: '*/*', limit: '200mb' });

// §35.5: /api/ と /healthz はキャッシュ禁止ヘッダを付与
app.use(['/api/', '/healthz'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// GET /healthz — サーバ稼働確認
app.get('/healthz', async (req, res) => {
  const idx = await getIndex();
  res.json({ ok: true, version: VERSION, files: idx.files.length });
});

// GET /api/library/index — 索引取得（?rescan=1 で再スキャン）
app.get('/api/library/index', async (req, res) => {
  const idx = await getIndex(req.query.rescan === '1');
  res.json(idx);
});

// GET /api/library/file?path=<相対パス> — ファイル実体取得
app.get('/api/library/file', async (req, res) => {
  const safe = resolveSafe(LIBRARY_ROOT, req.query.path || '');
  if (!safe) return res.status(403).json({ error: 'forbidden' });
  if (!fs.existsSync(safe)) return res.status(404).json({ error: 'not found' });
  const ext = path.extname(safe).toLowerCase();
  const ct = CONTENT_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', ct);
  res.sendFile(safe);
});

// PUT /api/library/file?path=<相対パス> — ファイル保存（S-2: rawParser をここでのみ適用）
app.put('/api/library/file', rawParser, async (req, res) => {
  const safe = resolveSafe(LIBRARY_ROOT, req.query.path || '');
  if (!safe) return res.status(403).json({ error: 'forbidden' });
  try {
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, req.body);
    indexCache = null; // 次回 getIndex で再スキャン
    res.json({ ok: true, path: req.query.path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ビルド済み mkb-reader の配信（base: '/mkb-reader/'）
if (fs.existsSync(DIST_DIR)) {
  app.use('/mkb-reader/', express.static(DIST_DIR));
  app.get('/mkb-reader/*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  app.get('/', (req, res) => res.redirect('/mkb-reader/'));
} else {
  app.get('/', (req, res) => {
    res.send('dist/ が見つかりません。npm run build を実行してください。');
  });
}

// S-3: 起動時に索引を確実に用意してからログ出力
const startTime = Date.now();
app.listen(PORT, '127.0.0.1', async () => {
  console.log(`mkb-reader server http://127.0.0.1:${PORT}`);
  console.log(`LIBRARY_ROOT: ${LIBRARY_ROOT}`);
  const idx = await getIndex();
  console.log(`index ready: ${idx.files.length} files (${Date.now() - startTime}ms)`);
});
