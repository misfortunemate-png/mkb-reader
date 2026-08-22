# mkb-reader クラウド接続設定 作業指示書
文書種別: 権威文書

作成日: 2026-08-22 ／ PM: クリーデ ／ 対応仕様: 本書に内包 ／ 本書一枚で完結（追補なし）
発注文書: ai-family-ops `docs/20260822_cloud-migration-stage2_requirements_v1.0.md` §5.2

## 添付マニフェスト（着工前照合・必須）

本書のみ。支給物なし。

| # | パス | 種別 |
|---|---|---|
| 1 | docs/instructions-cloud-settings.md | 指示書（本書） |

## PG運用規律（定型・全フェーズ共通）

1. **停止条件**: 仕様にない判断が必要／仕様どおりだと問題が生じる／技術的に実現困難または難航／セッション外プロセスの停止等の副作用がある操作。原因判明時は「原因X・対策Y・実行可否」で報告し指示を待つ
2. **支給物改変禁止**: PM支給物はdiffゼロで検収される。技術的整合の調整もPMへ差し戻す
3. **発注者指示による仕様外修正**: 発注者から直接指示を受けた修正は実施・効果確認してよい。報告時に「発注者の指示により実装/修正」と明記する。権威文書は書き換えない
4. **着工前**: `git pull` → inspect実行（マニフェスト照合・版確認）。緑でなければ着工しない

## 作業範囲

- 何を: 設定画面に書庫サーバーURL・トークンの二項目を追加し、useRemoteLibraryの全fetchにベースURL付与・Authorizationヘッダ付与を行う
- なぜ: フラン側Express（ローカル）とクラウドバックエンド（ai-family-foundation）を設定で切り替えるため
- どこで: misfortunemate-png/mkb-reader
- **本指示書の変更範囲は以下の三ファイルのみ**: `src/components/SettingsPanel.jsx`, `src/hooks/useRemoteLibrary.js`, `src/hooks/useSettings.js`（もしくは設定読み書きの所在）

## 仕様（本書に内包）

### S-1: 設定項目

| 設定項目 | localStorage キー | 既定値 | UI |
|---|---|---|---|
| 書庫サーバーURL | `mkb_cloud_url` | 空文字列 | テキスト入力。プレースホルダ: `https://example.pages.dev` |
| トークン | `mkb_cloud_token` | 空文字列 | テキスト入力（type=password）。プレースホルダ: `Bearer トークン` |

SettingsPanelの書庫セクション（§36の書庫接続状態表示の付近）に追加する。既存のセクション構造（Section コンポーネント）に従う。

設定変更後はページリロードで反映する旨を設定欄の近くに注記する（例: 「変更後はリロードが必要です」）。ライブ反映は不要。

### S-2: useRemoteLibrary.js の改修

フック初期化時にlocalStorageから `mkb_cloud_url` と `mkb_cloud_token` を読む。

**ベースURL付与**: すべてのfetch呼び出しのURL先頭に`mkb_cloud_url`の値を付与する。空の場合は現行の相対パス動作（`/healthz`等）を維持する。

対象箇所:
- `checkHealthz()`: `fetch('/healthz', ...)` → `fetch(baseUrl + '/healthz', ...)`
- `fetchIndex()`: `fetch('/api/library/index...')` → `fetch(baseUrl + '/api/library/index...')`
- `putFile()`: `fetch('/api/library/file...')` → `fetch(baseUrl + '/api/library/file...')`
- `fetchFile()`: `fetch('/api/library/file...')` → `fetch(baseUrl + '/api/library/file...')`
- `searchLibrary()`: `fetch('/api/library/search...')` → `fetch(baseUrl + '/api/library/search...')`

**Authorizationヘッダ付与**: `mkb_cloud_token`が空でない場合、全fetchのheadersに `Authorization: Bearer ${token}` を追加する。空の場合はヘッダを追加しない（現行挙動を維持）。

**実装の提案**: fetch呼び出しを共通関数に括り出すのが最も変更箇所が少ない。例:
```js
function libFetch(path, options = {}) {
  const url = baseUrl + path;
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
```
ただしこの実装方法はPGの裁量で変えてよい。**結果として全fetchにベースURLとトークンが付与されること**が要件。

## 作業手順

### 手順1: 設定項目の追加

SettingsPanel.jsxの書庫セクション付近に、S-1の二項目を追加する。localStorageへの読み書きを実装する。

### 手順2: useRemoteLibrary.jsの改修

S-2に従い、全fetchにベースURL付与・Authorizationヘッダ付与を実装する。

### 手順3: ビルド・動作確認

`npm run build` が警告なしで通ること。ローカル開発サーバーで、設定が空の状態で従来通りフラン側Expressに接続することを確認する。

## 禁止事項

- S-1・S-2に記載されたファイル以外のsrc/配下の変更（SettingsPanel, useRemoteLibrary, useSettings以外を触らない）
- server/index.jsの変更
- 書庫の表示・ビューア・IndexedDB本棚・mkbエクスポート等の既存機能への変更
- ベースURLが空の場合の動作の変更（現行挙動を完全に維持すること）

## テスト

- PG自己完結分:
  - 設定が空の状態で`npm run dev`→ フラン側Expressへの接続が従来通り動作すること
  - 設定にクラウドURLを入力 → リロード後にクラウドへの接続を試みること（クラウド側が未完成でも、fetchのURLとヘッダが正しいことをDevToolsのネットワークタブで確認）
  - `npm run build` 警告なし
  - inspect緑
- **実機系（発注者に依頼）**:
  - Pixel 10 PWA（standalone）で設定画面を開き、クラウドURLとトークンを入力→リロード→書庫閲覧が切り替わること
  - 設定をクリア→リロード→フラン経路に戻ること

## 完了条件

- S-1の設定二項目がSettingsPanelに追加されている
- S-2の全fetch改修が完了し、ベースURL・トークンが正しく付与される
- 設定が空の場合に既存動作が100%維持されること
- 操作スクリプト納品・サーバー再起動・pull・push実施済み（R-015）
- inspect緑・_STATUS.md更新（フロントマター含む）

## 報告基準

報告は docs/reports/ に置く。コンテキスト圧縮後もこのセクションを読み返してから報告すること。

1. 実装内容の要約
2. 完了条件の各項に対する充足状況
3. inspect結果（緑/赤と出力の添付）
4. 未完了・未検証の項目があれば列挙
5. 発注者指示による仕様外修正があればその旨と内容
6. サーバー再起動・コミット・プッシュの実施状況
7. DevToolsで確認したfetchのURL・ヘッダのスクリーンショットまたはログ

## 着工前提

**本指示書はai-family-foundation側のエンドポイント実装完了を前提としない。** フロント側の改修はクラウド側が未完成でも着工・完了できる（設定が空なら既存動作を維持するため）。ただし実機統合テスト（発注書§5.6の受入条件）はクラウド側完了後に行う。
