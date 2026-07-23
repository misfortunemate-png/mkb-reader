// 何を: Phase 6 自動検査スクリプト（§39.2）
// なぜ: resolveSafe 経由・SWキャッシュ除外・LIBRARY_ROOT ハードコードなしを機械的に確認
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}
function fail(label, detail) {
  console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
  failed++;
}
function warn(label, detail) {
  console.warn(`  ⚠ ${label}${detail ? ': ' + detail : ''}`);
  warnings++;
}

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log('\n=== mkb-reader inspect ===\n');

// ── 1. 必須ファイル存在確認 ──
console.log('[ 1. 必須ファイル ]');
for (const f of [
  'server/index.js',
  'server/resolveSafe.js',
  'server/resolveSafe.test.mjs',
  'server/package.json',
  'server/.env.example',
  'scripts/inspect.mjs',
  'src/hooks/useRemoteLibrary.js',
  'src/components/RemoteLibraryView.jsx',
  'src/components/SaveToLibraryDialog.jsx',
  'library-backup.bat',
  'docs/start-all-v4-append.bat',
]) {
  if (exists(f)) ok(f);
  else fail(f, 'not found');
}

// ── 2. バージョン整合（package.json == server/package.json == server/index.js） ──
console.log('\n[ 2. バージョン整合 ]');
try {
  const rootPkg = JSON.parse(readText('package.json'));
  const srvPkg  = JSON.parse(readText('server/package.json'));
  const srvIdx  = readText('server/index.js');
  const vInIdx  = (srvIdx.match(/const VERSION\s*=\s*['"](.+?)['"]/) || [])[1];
  const rootV = rootPkg.version;
  const srvV  = srvPkg.version;

  if (rootV === srvV) ok(`root package.json (${rootV}) === server/package.json (${srvV})`);
  else fail('バージョン不一致', `root=${rootV} server=${srvV}`);

  if (vInIdx === rootV) ok(`server/index.js VERSION (${vInIdx}) === ${rootV}`);
  else fail('server/index.js VERSION', `${vInIdx} !== ${rootV}`);
} catch (e) {
  fail('バージョン読み取りエラー', e.message);
}

// ── 3. resolveSafe 経由検査（server/index.js の fs.* 操作） ──
console.log('\n[ 3. resolveSafe 経由検査 ]');
try {
  const idx = readText('server/index.js');
  // import されているか
  if (idx.includes("from './resolveSafe.js'")) ok('resolveSafe imported');
  else fail('resolveSafe import 不在');

  // fs. 操作を含む行を抽出
  const fsOps = ['readFileSync', 'writeFileSync', 'createReadStream', 'writeFile', 'readFile', 'existsSync', 'statSync', 'readdirSync', 'mkdirSync'];
  const lines = idx.split('\n');
  const dangerLines = lines.filter((l) => {
    if (l.trim().startsWith('//')) return false; // コメント除外
    const hasFsOp = fsOps.some((op) => l.includes(`fs.${op}`));
    if (!hasFsOp) return false;
    // ユーザー入力（req.query.path）を直接 fs に渡していないか
    // 安全パターン: safe 変数 / LIBRARY_ROOT / DIST_DIR / __dirname を使用
    const safe = ['safe', 'LIBRARY_ROOT', 'DIST_DIR', '__dirname', 'path.join(dir', 'abs', 'dir'];
    return !safe.some((s) => l.includes(s));
  });
  if (dangerLines.length === 0) ok('全 fs.* 操作が安全な変数を経由している');
  else {
    dangerLines.forEach((l) => fail('要確認行', l.trim()));
  }
} catch (e) {
  fail('server/index.js 読み取りエラー', e.message);
}

// ── 4. SWキャッシュ除外検査（/api/ が NetworkOnly か） ──
console.log('\n[ 4. SWキャッシュ除外 ]');
try {
  const vite = readText('vite.config.js');
  if (vite.includes('NetworkOnly') && vite.includes('/api/')) ok('/api/ が NetworkOnly ルールに含まれる');
  else fail('/api/ の NetworkOnly 除外なし');

  if (vite.includes('NetworkOnly') && vite.includes('/healthz')) ok('/healthz が NetworkOnly ルールに含まれる');
  else fail('/healthz の NetworkOnly 除外なし');
} catch (e) {
  fail('vite.config.js 読み取りエラー', e.message);
}

// ── 5. LIBRARY_ROOT ハードコード検査 ──
console.log('\n[ 5. LIBRARY_ROOT ハードコード検査 ]');
try {
  const idx = readText('server/index.js');
  // Windows/Unixファイルシステムパスのハードコードを検出（URLパターンは除外）
  // 対象: 'C:\...' 'D:\...' '/home/' '/var/' 等のファイルシステムパス
  const hardcoded = idx
    .split('\n')
    .filter((l) => {
      if (l.trim().startsWith('//')) return false;
      // デフォルト値設定行（LIBRARY_ROOT = ... || 'D:\AI\...'）は許可
      if (l.includes('LIBRARY_ROOT') && l.includes('process.env')) return false;
      // Windows ドライブレター付きパス（URL ではなくファイルパス）を検出
      return /['"`][A-Za-z]:\\[A-Za-z\\]/.test(l) || /['"`]\/(?:home|var|etc|usr|opt|root)\//.test(l);
    })
    .filter((l) => !l.includes('DIST_DIR') && !l.includes('__dirname'));
  if (hardcoded.length === 0) ok('書庫ファイルシステムパスのハードコードなし（デフォルト値除く）');
  else hardcoded.forEach((l) => warn('要確認行', l.trim()));
} catch (e) {
  fail('server/index.js 読み取りエラー', e.message);
}

// ── 6. .gitignore に server/.env が含まれるか ──
console.log('\n[ 6. セキュリティ設定 ]');
try {
  const gi = readText('.gitignore');
  if (gi.includes('server/.env')) ok('server/.env が .gitignore に含まれる');
  else fail('server/.env が .gitignore に未登録');
} catch (e) {
  fail('.gitignore 読み取りエラー', e.message);
}

// ── 7. bat ファイル ASCII確認 ──
console.log('\n[ 7. bat ファイル ASCII確認 ]');
for (const f of ['library-backup.bat', 'docs/start-all-v4-append.bat']) {
  if (!exists(f)) { fail(f, 'not found'); continue; }
  const buf = fs.readFileSync(path.join(ROOT, f));
  const hasHighByte = [...buf].some((b) => b > 127);
  if (!hasHighByte) ok(`${f}: ASCII のみ`);
  else fail(`${f}: 非ASCII文字を含む（cmdで構文崩壊リスク）`);
}

// ── 結果 ──
console.log(`\n=== 結果: ${passed} passed, ${failed} failed, ${warnings} warnings ===\n`);
if (failed > 0) process.exit(1);
