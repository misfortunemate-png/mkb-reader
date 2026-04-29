# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-04-29（§23 SVG化・差し込み画像タップシート・saveLastPosition修正 追加）
更新者: PG（Claude Code）

## 現在のフェーズ
**Phase 3c 完了（§21〜§26 + §23追加ポリッシュ）→ 実機検証待ち**

---

## Phase 1〜Phase 3b の合格状況（前回までの記録）

| Phase | 範囲 | 実機検証 |
|---|---|---|
| Phase 1 | §1〜§4（読込・MD描画・チャプターナビ・ページネーション） | 合格 |
| Phase 2 | §5〜§9（フォント・テーマ・カスタマイズ・本棚・PWA） | 合格 |
| Phase 3a | §10〜§13（HTML/JSON/画像/CBZ・リサイズ・禁則）+ 設定パネル改訂 + global/local 二層 | 合格 |
| Phase 3b | §14〜§18（読み替え・画像差し込み・エクスポート・チャットログ変換） | 合格 |

---

## 完了事項（Phase 3c — §21〜§26 + §23追加）

### §24 タップゾーン設定
- `useSettings.js`: `tapZone: { preset, height, width }` をデフォルトに追加
- `Paginator.jsx`: bottom-corners / sides / fullpage の3プリセットでページ送り領域を制限
- `SettingsPanel.jsx`: タップゾーン3択ボタン + 詳細スライダー（高さ・幅）
- 設定変更時に3秒間のオーバーレイ表示（accent色/opacity 0.15）

### §25 欧文フォント選択
- `useSettings.js`: `LATIN_FONTS`（EB Garamond / Libre Baskerville / Lora）+ `latinFont: 'eb-garamond'`
- `applyToDocument`: 欧文を先頭に置くフォントスタック構築
- `SettingsPanel.jsx`: 欧文フォント3択ボタン + プレビュー文字列

### §26 中断箇所の再開（lastPosition）
- `useBookshelf.js`: `saveLastPosition(bookId, position)` 追加
- `App.jsx`: 本を開いた時に lastPosition を `pendingLastPositionRef` で復元
- `Paginator.jsx`: `onPageChange` / `onScrollRatioChange` コールバック + 初期スクロール比率復元
- `usePagination.js`: `initialPage` パラメータ追加（recalc 後に1回だけ適用）

### §21 コンテキストメニュー（長押しメニュー）
- `MarkdownRenderer.jsx`: `data-source-line` 属性をp/h1-h6/blockquote/li/preに付与
- `rewriteEngine.js`: `applyLineEdits` 追加（行番号+完全一致で段落置換）; applyInsertedAssets に displaySize クラス対応
- `useRewrite.js`: `lineEdits` CRUD + undo スタック（最大50件・セッション内のみ）
- `ContextMenu.jsx`（新規）: 3ビュー（メインメニュー / インライン編集 / 画像サイズ選択）
- `Paginator.jsx`: 700ms 長押し検出、タップゾーン内除外、contextmenu イベント抑制
- `App.jsx`: handleHideLine / handleEditLine / handleInsertImageFromContext 接続

### §22 チャットログ変換品質改善
- `MarkdownRenderer.jsx`: 話者名段落（単一 strong）に `speaker-human` / `speaker-assistant` クラス付与
- `reader.css`: `.speaker-human`（accent 左ボーダー）/ `.speaker-assistant`（border 左ボーダー）スタイル
- `ChatImporter.jsx`: タイトル検索フィルタ、最初の2メッセージのプレビュー、一括変換時の進捗バー

### §23 UI磨き込み
- `Bookshelf.jsx`: ファイルタイプアイコン（📖📝📄📋🌐🖼💬）+ `lastOpenedAt` 相対表示（`Intl.RelativeTimeFormat('ja')`）
- `Toast.jsx`（新規）: 画面下部に3秒表示→フェードアウト。ファイル読み込みエラーで発火
- `App.jsx`: `toastMsg` state + `error` useEffect でトースト表示
- `ContextMenu.jsx` / `reader.css`: コンテキストメニューのスタイル（テーマCSS変数追従）

### §23 追加: ヘッダー高さ設定
- `useSettings.js`: `headerHeight: 48`（px）デフォルト追加、`applyToDocument` で `--header-h` に反映
- `reader.css`: `--icon-btn-size: calc(var(--header-h) - 10px)` 派生変数、`.icon-btn` がサイズに追従
- `SettingsPanel.jsx`: 「ヘッダー」セクション — 36〜72px / 4px刻みスライダー

### §23 追加: SVG化・差し込み画像タップシート・saveLastPosition修正（2回目コミット）
- `Icons.jsx`（新規）: MenuIcon / ArrowLeftIcon / BookmarkIcon / PenIcon / DownloadIcon / SettingsIcon のインライン SVG — currentColor で テーマ追従、`1em` サイズ
- `App.jsx`: ヘッダー全アイコンを SVG に置換; `handleOpenBook` で `getLocalSettings` を直接呼び最新の `lastPosition` を取得（stale books state 問題を解消）; `assetMenu` state + `AssetActionSheet`（表示サイズ変更3択＋削除）
- `reader.css`: ハンバーガー非表示メディアクエリを削除（常時表示）; `img-inline` を `[data-asset-id]` 有無で分割（差し込み画像は縦3行・横95%・pointer）
- `rewriteEngine.js`: 差し込み画像 HTML に `data-asset-id` 属性を付与
- `MarkdownRenderer.jsx` / `Paginator.jsx`: `onInsertedAssetTap` prop を通貫
- `useBookshelf.js` / `chatConverter.js`: `charCount` を book entry に永続化
- `Bookshelf.jsx`: 2行目メタに 著者 · X字 · 最終閲覧 X前 を表示

---

## ✅ 解決済み: モバイルレイアウトの異常表示

**原因**: Chrome の「PC 版サイトを表示」モードが有効になっていた（サイト別設定）。
**解決**: Chrome のサイト別設定から「PC 版サイトを表示」を無効化して解消。
アプリ側のコード変更は不要。

---

## ファイル状態（Phase 3c 完了時点）

主要モジュール（Phase 3c 新設・変更）:
- `src/components/Icons.jsx`（新規）
- `src/components/ContextMenu.jsx`（新規）
- `src/components/Toast.jsx`（新規）
- `src/hooks/useSettings.js`: tapZone / latinFont / headerHeight 追加
- `src/hooks/useRewrite.js`: lineEdits CRUD + undo スタック
- `src/hooks/usePagination.js`: initialPage 対応
- `src/hooks/useBookshelf.js`: saveLastPosition 追加
- `src/utils/rewriteEngine.js`: applyLineEdits + displaySize 対応
- `src/components/Paginator.jsx`: tapZone / 長押し / lastPosition 対応
- `src/components/MarkdownRenderer.jsx`: data-source-line + speaker クラス + fixedClass
- `src/components/SettingsPanel.jsx`: タップゾーン / 欧文フォント / ヘッダー高さ セクション追加
- `src/components/ChatImporter.jsx`: 検索フィルタ / プレビュー / 進捗バー
- `src/components/Bookshelf.jsx`: ファイルアイコン / 相対日時
- `src/App.jsx`: §21-§26 全コールバック接続

仕様書:
- `docs/spec-phase3c-v2.md`
- `docs/instructions-phase3c-v2.md`

---

## 次のアクション

- 誰が: PM（クリーデ）
- 何を:
  1. Pixel 10 実機で §21〜§26 の動作検証（仕様書 §5 テスト方針表に従う）
  2. モバイル表示問題の解消確認（Chrome サイト別ストレージ削除 or USB デバッグ）
  3. Phase 4 の仕様策定（縦書き §17、表紙画像、Google Drive 連携など）
