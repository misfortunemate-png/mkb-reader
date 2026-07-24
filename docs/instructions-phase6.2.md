# mkb-reader 仕様・指示書 Phase 6.2 — 書庫パフォーマンス改善・モバイル読込不良修正

発行日: 2026-07-24 ／ 発行者: クリーデ（PM） ／ 宛先: PG（Claude Code on フラン）
フロー: 簡略（PM裁量）。不具合修正＋パフォーマンス改善。

---

## マニフェスト
| 種別 | リポジトリ内パス |
|---|---|
| 本指示書 | docs/instructions-phase6.2.md |
| 支給物 | なし |

## 問題

### 症状
- PCブラウザからは書庫一覧が表示される
- Pixel 10（Tailscale経由 standalone）では「書庫を読み込み中…」のまま完了しない
- /healthz はモバイルから正常応答する

### 根本原因（複合）

**サーバ側（パフォーマンス）**：
1. buildIndex() が readdirSync/statSync（同期I/O）で全ファイル走査。動画等の大量ファイルでイベントループを塞ぐ
2. mkbファイルは readFileSync で全体をメモリ読み→JSZip解析。大きいmkbで遅延
3. express.raw({ type: '*/*', limit: '200mb' }) が GET 含む全メソッドに適用。不要なオーバーヘッド

**クライアント側（モバイル読込不良の直接原因）**：
4. fetchIndex に timeout がない。サーバ応答が遅延した場合、fetchが永久にpendingになる
5. エラー発生時 console.warn のみで、ユーザーに何も表示されない（「読み込み中…」のまま永続）
6. healthzは getIndex() を呼ぶため、healthz通過後の索引はキャッシュ済みのはず——にもかかわらず一覧が出ないのは、**fetchのレスポンスがモバイル環境で正常に完了していない可能性**がある（JSON巨大・SW干渉・ネットワーク切断のいずれか）

## 修正内容

### S-1: 索引生成の非同期化（server/index.js）
- `fs.readdirSync` → `fs.promises.readdir`
- `fs.statSync` → `fs.promises.stat`
- `fs.readFileSync`（extractMkbMeta内） → `fs.promises.readFile`
- walk関数を async に書き換え。Promise.all で並行stat（ただしファイル数上限つき、batch 50程度）

### S-2: express.raw を PUT 限定（server/index.js）
- 現行: `app.use('/api/library/file', express.raw(...))`（全メソッド）
- 修正: PUT ルートハンドラ内でのみ `express.raw(...)` をミドルウェアとして適用
  ```js
  const rawParser = express.raw({ type: '*/*', limit: '200mb' });
  app.put('/api/library/file', rawParser, async (req, res) => { ... });
  ```

### S-3: 起動時索引の事前生成を同期的に待つ（server/index.js）
- 現行: listen() 後に getIndex() を fire-and-forget
- 修正: listen callback 内で await getIndex() し、完了後にログ出力。最初のリクエストが来る前に索引を確実に用意する
  ```js
  app.listen(PORT, '127.0.0.1', async () => {
    console.log(`mkb-reader server http://127.0.0.1:${PORT}`);
    const idx = await getIndex();
    console.log(`index: ${idx.files.length} files (${Date.now() - start}ms)`);
  });
  ```

### S-4: 索引生成の計測ログ（server/index.js）
- buildIndex の先頭と末尾で `console.time('buildIndex')` / `console.timeEnd('buildIndex')` を追加
- ファイル件数もログ出力（診断用）

### C-1: fetchIndex にタイムアウト追加（useRemoteLibrary.js）
- `AbortSignal.timeout(15000)` を fetch に追加（healthz の 3000ms より長く）
- タイムアウト時は catch に落ち、finally で fetching=false

### C-2: エラー時のユーザー通知（useRemoteLibrary.js + RemoteLibraryView.jsx）
- useRemoteLibrary に `error` 状態を追加。catch 内で `setError(e.message)` 
- fetchIndex のfinallyで fetching=false
- RemoteLibraryView: `fetching === false && items.length === 0 && error` のとき、エラーメッセージとリトライボタンを表示
  ```
  書庫の読み込みに失敗しました: {error}
  [再試行]
  ```

### C-3: 診断ログの強化（useRemoteLibrary.js）
- fetchIndex の各段階にconsole.log: fetch開始 → res.status → JSON parse完了（items数） → setItems完了
- モバイルのブラウザコンソールで切り分けに使う。パフォーマンスの問題が解消したら削除不要（console.debug に下げてもよい）

---

## 着工手順
1. `git pull`
2. サーバ側修正（S-1〜S-4）→ コミット
3. クライアント側修正（C-1〜C-3）→ コミット
4. `npm run build` → inspect全緑確認
5. docs/reports/phase6.2-report.md にpush（buildIndex計測結果を添付）

## 実機テスト（発注者に依頼）
1. サーバ再起動 → コンソールで buildIndex 計測ログ確認（何ms・何ファイルか）
2. Pixel 10から書庫タブを開き、一覧が表示されること（または明確なエラーメッセージが出ること）
3. エラーの場合、Pixel 10のブラウザで直接 `https://fraine.tail204746.ts.net:8443/api/library/index` を開き、JSONが表示されるか確認 → 結果を報告
