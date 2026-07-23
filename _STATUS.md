# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-07-23（Phase 6 §35〜§38 実装完了・実機検証待ち）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**Phase 6 実装完了・実機検証待ち**

---

## 全Phase合格状況

| Phase | 範囲 | 実機検証 |
|---|---|---|
| Phase 1 | §1〜§4（読込・MD描画・チャプターナビ・ページネーション） | 合格 |
| Phase 2 | §5〜§9（フォント・テーマ・カスタマイズ・本棚・PWA） | 合格 |
| Phase 3a | §10〜§13（HTML/JSON/画像/CBZ・リサイズ・禁則・設定パネル改訂） | 合格 |
| Phase 3b | §14〜§18（読み替え・画像差し込み・エクスポート・チャットログ変換） | 合格 |
| Phase 3c | §20〜§26（タップゾーン・欧文フォント・中断再開・コンテキストメニュー・UI磨き） | 合格 |
| Phase 4a | §27（層A本格化: ソート・リネーム・タグ） | 合格 |
| Phase 4b | §28（層B基盤: LibraryView・ツリー構造） | 合格 |
| Phase 4c | §29（層B編集: ファイル接続・画像切り出し・mkbエクスポート） | 合格 |
| Phase 4d | §30（縦書き: vertical-rl・スクロール固定・縦中横） | 合格 |
| Phase 5 | §31〜§34（自動送り・表紙画像・表示モード切替・ライブラリI/O） | 合格 |
| Phase 6 | §35〜§38（リモート書庫: server + クライアント + bat） | **実機検証待ち** |

---

## Phase 6 実装内容（2026-07-23）

| § | 内容 |
|---|---|
| §35 | 書庫サーバ（server/: Express・healthz・索引API・ファイル配信・PUT保存・dist配信） |
| §36 | リモート書庫モード（healthz自動検出・書庫タブ・閲覧・書庫保存・設定画面接続状態） |
| §37 | チャットログ変換→書庫へ保存（ChatImporter に「書庫へ保存」追加） |
| §38 | library-backup.bat・start-all-v4-append.bat（ASCII CRLF） |
| §39 | inspect.mjs新設（21項目全グリーン）・SWキャッシュ除外・version 0.2.0 |

---

## 実装済み機能一覧

### 層A（本棚・ビューア）
- mkb/md/txt/html/json/画像/CBZ/PDF の読込・表示
- CSS multi-column ページネーション + スクロールモード
- フォント（日本語3種+欧文）・テーマ・行間・余白カスタマイズ
- global/local 二層設定
- 読み替え（rewrite）・画像差し込み・非破壊編集
- MKBエクスポート（書庫保存対応）
- チャットログ変換（ChatImporter）＋書庫へ保存
- タップゾーン・スワイプ・キーボード操作
- 中断箇所の復帰（lastPosition）— 書庫アイテムにも対応
- コンテキストメニュー（長押し）
- 次/前チャプター自動送り
- 本棚: ソート・リネーム・タグ・表紙画像・カスケード削除警告
- 縦書き表示（fileType: vertical、スクロール固定、縦中横）
- PWA（オフライン対応）
- 一括登録（BatchImport）
- PDF対応: iframe（ブラウザ内蔵ビューア）
- txt→Markdown変換

### 層B（ライブラリ）
- ツリー構造（フォルダ/アイテム）・ドリルダウンナビゲーション
- 編集モード（ドラッグ並び替え・フォルダ間移動）
- ファイル接続（複数ファイル結合）
- 他の本からの画像切り出し
- ライブラリ→mkb変換エクスポート
- 表紙画像（自動抽出+手動設定）
- カタログ/リスト表示モード切替
- ライブラリごとインポート/エクスポート

### 書庫（Phase 6 新設）
- Node.js + Express 書庫サーバ（フラン上で起動）
- 索引JSON生成・配信（起動時 + ?rescan=1 で再スキャン）
- mkbメタ抽出（title・章数・tags）
- 全形式ファイル配信（Content-Type適切付与）
- PUT保存API（書庫へ保存・親ディレクトリ自動作成）
- resolveSafe パス防御（§35.4）
- クライアント: 書庫タブ・一覧・閲覧・保存・設定画面接続状態
- Tailscale 経由 HTTPS アクセス対応

---

## 仕様書一覧

| ファイル | 範囲 |
|---|---|
| docs/spec-phase6.md | §35〜§38（Phase 6: リモート書庫） |
| docs/spec-phase5.md | §31〜§34（Phase 5） |
| docs/spec-phase5-2.md | Phase 5続き §31〜§33 |
| docs/spec-phase4.md | §27〜§30 |
| docs/spec-phase3c-v2.md | §10〜§26（Phase 2〜3c統合） |
| docs/spec-phase1.md | §1〜§4 |
| docs/requirements-phase6.md | Phase 6 要件定義 |
| docs/requirements-v2.md | 要件定義（全フェーズ） |
