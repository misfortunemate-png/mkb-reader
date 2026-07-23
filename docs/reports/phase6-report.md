# Phase 6 実装報告書

報告日: 2026-07-23
報告者: PG（Claude Code on フラン）
宛先: PM（クリーデ）

---

## 自己完結テスト結果

### resolveSafe 単体テスト（全10項目）

```
  ✓ 正常なファイル名
  ✓ サブディレクトリ内ファイル
  ✓ ルート自体は許可
  ✓ .. 遡上の拒否
  ✓ / で始まる絶対パスの拒否
  ✓ Windows 絶対パスの拒否
  ✓ URLエンコード遡上の拒否 (%2F%2E%2E)
  ✓ ダブルエンコード遡上の拒否 (%252F)
  ✓ null バイト拒否
  ✓ 空文字列拒否

resolveSafe: 10 passed, 0 failed
```

### inspect 全項目（21項目）

```
[ 1. 必須ファイル ]         11/11 ✓
[ 2. バージョン整合 ]        2/2  ✓
[ 3. resolveSafe 経由検査 ]  2/2  ✓
[ 4. SWキャッシュ除外 ]      2/2  ✓
[ 5. LIBRARY_ROOT ハードコード検査 ] 1/1 ✓
[ 6. セキュリティ設定 ]      1/1  ✓
[ 7. bat ファイル ASCII確認 ] 2/2  ✓

結果: 21 passed, 0 failed, 0 warnings
```

### npm run build

- 結果: 成功（エラーなし）
- バンドルサイズ: 816.61 kB（gzip: 248.41 kB）
- チャンクサイズ警告: 1件（vite の 500kB 閾値超過 — 既存問題、本フェーズの追加分は軽微）

---

## 実装概要

### §35 書庫サーバ（server/）

| ファイル | 内容 |
|---|---|
| server/index.js | Express サーバ本体。/healthz / /api/library/index / /api/library/file(GET/PUT) / dist配信 |
| server/resolveSafe.js | パス防御関数（§35.4） |
| server/resolveSafe.test.mjs | 単体テスト10項目 |
| server/package.json | Express + dotenv + jszip + js-yaml |
| server/.env.example | PORT=8788, LIBRARY_ROOT のテンプレート |

- dist/ は `/mkb-reader/` パスで配信（base: '/mkb-reader/' のビルドと整合）
- `GET /` → `/mkb-reader/` リダイレクト
- `/api/` / `/healthz` に `Cache-Control: no-store` ヘッダ付与（SW除外と二重防衛）

### §36 リモート書庫モード（クライアント）

| ファイル | 内容 |
|---|---|
| src/hooks/useRemoteLibrary.js | 起動時 healthz 照会・索引取得・putFile・fetchFile |
| src/components/RemoteLibraryView.jsx | 書庫一覧UI（ソート・種別フィルタ・検索） |
| src/components/SaveToLibraryDialog.jsx | 書庫保存先パス入力ダイアログ（§36.3/§37共通） |
| src/components/Bookshelf.jsx | 「書庫」タブ追加（接続状態表示付き） |
| src/components/SettingsPanel.jsx | 書庫接続状態セクション追加（件数・取得時刻・再取得ボタン） |
| src/components/ExportDialog.jsx | 「書庫へ保存」ボタン追加（remoteConnected 時のみ表示） |
| src/App.jsx | useRemoteLibrary 統合・書庫ビュー・lastPosition・SaveToLibraryDialog |

- lastPosition: 書庫アイテムは `lp-remote:${relPath}` キーで localStorage に保存
- 閲覧は既存読込パイプラインに合流（Blob → File → loadFileAndRemember）
- MKB エクスポートを `buildMkbBuffer` と `exportMkb` に分離（useExport.js）

### §37 変換フロー直結

- ChatImporter に「書庫へ保存」ボタン追加（remoteConnected 時のみ表示）
- 変換 → SaveToLibraryDialog → PUT → 索引再取得 の一貫フロー

### §38 git化バックアップ・起動統合

| ファイル | 内容 |
|---|---|
| library-backup.bat | add→commit→push バッチ（ASCII CRLF）。日時はPowerShellで取得 |
| docs/start-all-v4-append.bat | start-all.bat v4 への追記ブロック（ASCII CRLF） |

### §39 検査・その他

- vite.config.js: `/api/` と `/healthz` に NetworkOnly ルール追加
- .gitignore: `server/.env` と `server/node_modules` 追加
- package.json: version 0.1.0 → 0.2.0

---

## 未検証項目（実機系テスト）

以下は発注者への依頼事項です（フランでの実機確認が必要）:

1. フランで `cd server && npm install && node index.js` 起動 → PC ブラウザで `http://127.0.0.1:8788` 表示確認
2. インフラPG適用後、Pixel 10（standalone）で `https://fraine.tail204746.ts.net:8443/` から書庫一覧→mkb閲覧
3. PDF・画像・txtの表示（PDF は iframe 表示）
4. チャットログ変換→書庫へ保存→一覧反映
5. 書庫ディレクトリに PC でファイル追加 → 索引再取得（設定パネル）→ 一覧反映
6. GitHub Pages 版の無退行確認（既存ローカルモードが引き続き動作すること）

## インフラPG依頼事項（別セッション）

- LIBRARY_ROOT 正式パスの作成と `.env` への設定
- 書庫ルートの `git init` + private リモート作成・紐付け（リポジトリ名は発注者指定）
- `start-all.bat v4` への追記ブロック（`docs/start-all-v4-append.bat`）の適用
- `tailscale serve --bg --https=8443 http://127.0.0.1:8788` の実行

---

以上で PG 作業を完了しました。実機テスト・インフラPG対応の確認をお願いします。
