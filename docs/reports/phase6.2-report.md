# Phase 6.2 実装レポート

作成日: 2026-07-24
担当PG: Claude Code on フラン

---

## 概要

Phase 6.2（仕様書: docs/instructions-phase6.2.md）の S-1〜S-4・C-1〜C-3 を全て実装した。

---

## サーバ側（server/index.js）

### S-1: 索引生成の非同期化

| 変更前 | 変更後 |
|---|---|
| `fs.readdirSync` | `fs.promises.readdir` |
| `fs.statSync` | `fs.promises.stat`（batch=50 並行） |
| `fs.readFileSync` (extractMkbMeta) | `fs.promises.readFile` |

walk 関数を `async` に書き換え。50件ごとに `Promise.all` で並行 stat を実施。

### S-2: express.raw を PUT 限定

```js
// 変更前: 全メソッドに適用
app.use('/api/library/file', express.raw({ type: '*/*', limit: '200mb' }));

// 変更後: PUT ルートのみ
const rawParser = express.raw({ type: '*/*', limit: '200mb' });
app.put('/api/library/file', rawParser, async (req, res) => { ... });
```

GET 等の読み取りリクエストに 200MB バッファが確保されるオーバーヘッドを除去。

### S-3: 起動時 await 索引生成

```js
const startTime = Date.now();
app.listen(PORT, '127.0.0.1', async () => {
  const idx = await getIndex();
  console.log(`index ready: ${idx.files.length} files (${Date.now() - startTime}ms)`);
});
```

最初のリクエスト到達前に索引を確定。

### S-4: 計測ログ

buildIndex の先頭・末尾に `console.time('buildIndex')` / `console.timeEnd('buildIndex')` とファイル件数ログを追加。

**実機計測結果**: サーバ再起動後のコンソールで確認予定（実機テストは発注者依頼）。

---

## クライアント側

### C-1: fetchIndex タイムアウト（useRemoteLibrary.js）

```js
const res = await fetch(url, {
  cache: 'no-store',
  signal: AbortSignal.timeout(15000), // healthz の 3000ms より長く
});
```

### C-2: エラー状態 + UI 表示

- `useRemoteLibrary`: `const [error, setError] = useState(null)` 追加
- catch 内で `setError(e.message)`、fetch 開始時に `setError(null)` でリセット
- `RemoteLibraryView`: `fetching===false && items.length===0 && error` のとき表示

```
書庫の読み込みに失敗しました
{error メッセージ}
[再試行]
```

- App.jsx: `error={remoteLibrary.error}` と `onRescan={remoteLibrary.rescan}` を渡すよう更新

### C-3: 診断ログ

fetchIndex の各段階でログ出力：
1. fetch 開始（URL）
2. res.status
3. JSON parse 完了（items 数）
4. setItems 完了

---

## ビルド結果

| 項目 | 値 |
|---|---|
| inspect | 24 passed, 0 failed |
| bundle | 819.60 kB（gzip: 249.24 kB） |

---

## コミット

| コミット | 内容 |
|---|---|
| S-1〜S-4 | server/index.js サーバ側改善 |
| C-1〜C-3 | クライアント側タイムアウト・エラー表示・診断ログ |

---

## 次のアクション（実機テスト）

1. サーバ再起動 → コンソールで `buildIndex: N files` と `index ready: N files (Xms)` を確認
2. Pixel 10 から書庫タブ → 一覧表示 or 明確なエラーメッセージを確認
3. エラーの場合: `https://fraine.tail204746.ts.net:8443/api/library/index` に直接アクセスして JSON 確認
