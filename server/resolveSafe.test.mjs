// 何を: resolveSafe の単体テスト（§35.4 要件）
// なぜ: ..遡上・絶対パス・URLエンコード遡上を機械的に確認する
import { resolveSafe } from './resolveSafe.js';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve('D:\\AI\\mkb-library\\public');

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
    failed++;
  }
}

// --- 正常系 ---
test('正常なファイル名', () => {
  const r = resolveSafe(ROOT, 'foo.mkb');
  assert.equal(r, path.join(ROOT, 'foo.mkb'));
});

test('サブディレクトリ内ファイル', () => {
  const r = resolveSafe(ROOT, 'sub/bar.mkb');
  assert.equal(r, path.join(ROOT, 'sub', 'bar.mkb'));
});

test('ルート自体は許可', () => {
  const r = resolveSafe(ROOT, '.');
  assert.equal(r, ROOT);
});

// --- 遡上系: null を返すこと ---
test('.. 遡上の拒否', () => {
  const r = resolveSafe(ROOT, '../private/secret.txt');
  assert.equal(r, null);
});

test('/ で始まる絶対パスの拒否', () => {
  const r = resolveSafe(ROOT, '/etc/passwd');
  assert.equal(r, null);
});

test('Windows 絶対パスの拒否', () => {
  const r = resolveSafe(ROOT, 'C:\\Windows\\System32\\secret');
  assert.equal(r, null);
});

test('URLエンコード遡上の拒否 (%2F%2E%2E)', () => {
  const r = resolveSafe(ROOT, '%2F%2E%2E%2Fprivate%2Fsecret.txt');
  assert.equal(r, null);
});

test('ダブルエンコード遡上の拒否 (%252F)', () => {
  const r = resolveSafe(ROOT, '%252F%252E%252Eprivate');
  assert.equal(r, null);
});

test('null バイト拒否', () => {
  const r = resolveSafe(ROOT, 'foo\0bar.mkb');
  assert.equal(r, null);
});

test('空文字列拒否', () => {
  const r = resolveSafe(ROOT, '');
  assert.equal(r, null);
});

// --- 結果 ---
console.log(`\nresolveSafe: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
