# mkb-reader 仕様書 Phase 6 — リモート書庫（§35〜§38）

作成日: 2026-07-23 ／ 作成者: クリーデ（PM） ／ 版: v1.0
前提: 要件定義 docs/requirements-phase6.md（2026-07-23承認済み）
現行コードベース: Phase 5完了・運用フェーズ（_STATUS.md 2026-05-06）

---

## §35 書庫サーバ（server/）

### 35.1 構成
- リポジトリ直下に `server/` を新設。Node.js + Express（chat-pwa同型）。LLM不使用
- `.env`（gitignore対象）: `PORT`（既定8788）、`LIBRARY_ROOT`（公開棚ディレクトリの絶対パス。既定値は仮で `D:\AI\mkb-library\public`。正式パスは発注者命名で差し替え）
- 私室棚は**LIBRARY_ROOT外**の兄弟ディレクトリとして運用し、サーバはその存在を知らない（P-3: スコープによる物理制御。コード側許可リストなし）

### 35.2 エンドポイント
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/` ほか静的 | ビルド済みmkb-reader（`dist/`）の配信 |
| GET | `/healthz` | `{ ok, version, files: 索引件数 }` |
| GET | `/api/library/index` | 索引JSON。`?rescan=1` で再スキャン |
| GET | `/api/library/file?path=<相対パス>` | 実体配信。Content-Type付与 |
| PUT | `/api/library/file?path=<相対パス>` | ファイル保存（本文はリクエストボディ）。親ディレクトリ自動作成。上書き可 |

### 35.3 索引スキーマ（データ定義）
```json
{
  "version": 1,
  "generatedAt": "ISO8601",
  "files": [
    {
      "path": "相対パス",
      "kind": "mkb | md | text | pdf | epub | image | cbz | html | json | other",
      "title": "表示名",
      "size": 12345,
      "mtime": "ISO8601",
      "meta": { "chapters": 0, "tags": [] }
    }
  ]
}
```
- kindは拡張子で判定。titleは原則ファイル名（拡張子除く）
- mkbのみ、既存パーサ（src/の読込ユーティリティ）をserver側から流用しヘッダのメタ（題名・章数等、取得できる範囲）を抽出。パース失敗時はファイル名にフォールバックし、索引生成自体は止めない
- 索引はメモリキャッシュ＋起動時生成。`rescan=1`で再生成

### 35.4 パス防御（機械検査対象）
- 全ファイル入出力は共通関数 `resolveSafe(rel)` を経由: `path.resolve(LIBRARY_ROOT, rel)` が `LIBRARY_ROOT` 配下でなければ403
- `resolveSafe` の単体テストを同梱（`..`遡上・絶対パス・URLエンコード遡上の拒否）
- inspectで「fs操作がresolveSafe経由であること」をgrep検査（§39.2）

### 35.5 キャッシュ境界（必須）
- `/api/` と `/healthz` はSWキャッシュ対象外（network-only）。索引・実体がSWに滞留し一覧が更新されない事故を構造的に防ぐ
- 静的配信（dist）は既存SW方針のまま

## §36 リモート書庫モード（クライアント）

### 36.1 検出と表示
- 起動時に同一オリジンの `/healthz` を照会し、応答があれば書庫モードを有効化（Pages版では自動的に無効。**URL設定は持たない**）
- 本棚UIに「書庫」ソースを追加。索引JSONから一覧表示（title・kind・size・mtime。ソートは既存本棚方式を踏襲）
- 設定画面に接続状態（接続先・件数・最終取得時刻）と「索引再取得」を表示

### 36.2 閲覧
- 一覧タップ → `/api/library/file` でfetch → **既存の読込パイプラインへ合流**（ローカルファイル読込と同一ハンドラ。Blob/File化して渡す）
- mkb/md/txt/html/json/画像/CBZ: 既存レンダラでそのまま表示。PDF: 既存PdfRenderer（iframe）で表示
- 閲覧はストリーム利用のみで、IndexedDB本棚への保存は行わない（明示的な「本棚に取り込む」操作は既存機構があるため追加実装しない）
- 中断復帰（lastPosition）は書庫アイテムにも適用（キーは `remote:` 接頭辞＋相対パス）

### 36.3 書庫への保存
- 既存MKBエクスポートの出力先に「書庫へ保存」を追加（PUT。保存先相対パスを入力、既定は元パス上書き）
- 成否はトースト通知（共通機能§1）

### 36.4 オフラインキャッシュ
- 初版はスコープ外（要件§8-4は将来工事と裁定。閲覧済みファイルのメモリ保持のみで可）

## §37 変換フロー直結

- チャットログ変換（ChatImporter）の出力先に「書庫へ保存」を追加（§36.3と同一のPUT経路・保存先入力UI共通化）
- 保存成功後、索引を再取得し一覧へ反映

## §38 git化バックアップ・起動統合

### 38.1 git化（初版は手動バッチ）
- 書庫ルート（LIBRARY_ROOTの親、公開棚のみを含む階層）をローカルgitリポジトリ化。privateリモートへpush（リポジトリ名は発注者命名）
- `.gitignore` 既定: `*.pdf` `*.epub` `*.cbz` 画像拡張子（大容量バイナリの肥大対策）。mkb/md/txtはgit対象
- 納品物 `library-backup.bat`（ASCII・CRLF）: add→commit（日時メッセージ）→push。実行は発注者の任意タイミング
- git初期化・リモート設定はインフラPGの作業（指示書に含む）

### 38.2 起動統合
- `start-all.bat` v4への追記ブロック（ASCII・CRLF）を納品物として提出。書庫サーバ起動＋tailscale serve追加（`--https=8443` → `http://127.0.0.1:8788`。chat-pwaの既存serveに追加、上書きしない）
- 適用はインフラPG。アクセスURLは `https://fraine.tail204746.ts.net:8443/`

## §39 検査・その他

### 39.1 版
- ルートpackage.jsonのversionをマイナー更新（現行値はPGが着工時確認）。healthzのversionと一致（R-012）

### 39.2 inspect新設
- mkb-readerには未整備のため `scripts/inspect.mjs` を新設（devスキル標準5項目）
- 追加検査: ①resolveSafe経由の機械検査（server/内の `fs.` 操作行がresolveSafe済みパスのみを使うこと） ②SWキャッシュ除外（`/api/` がSWのキャッシュ対象パターンに含まれないこと） ③LIBRARY_ROOT既定値以外に書庫パスのハードコードがないこと

### 39.3 明記事項
- Pages版とフラン版は別オリジン＝localStorage/IndexedDBは共有されない（仕様として明記。既存データの移行は行わない）
- フラン電源が稼働前提

## 改訂履歴
| 版 | 日付 | 変更内容 |
|---|---|---|
| v1.0 | 2026-07-23 | 初版 |
