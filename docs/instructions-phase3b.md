# mkb-reader 作業指示書（Phase 3b: §14〜§16, §18）

作成日: 2026-04-29
PM: クリーデ
対応仕様書: docs/spec-phase3b.md

---

## 設計思想への参照

**仕様書の§0「設計思想」を最初に読むこと。** 以降の全ての実装判断はこの思想に基づく。

要約:
- ビューアは「読み替え」の装置。原本は変更しない
- localSettings.rewrite に読み替えルールを保存する（Phase 3aで基盤実装済み）
- 設定はプリセット優先。細かい数値は詳細に折りたたむ
- グローバル/ローカルの二層構造（Phase 3aで実装済み）

判断に迷った場合は「原本を触らない」「ユーザーに選ばせる」の二原則に立ち返ること。

---

## 作業範囲

- 何を: チャットログ変換、読み替え機能、画像差し込み、MKBエクスポート
- なぜ: 「対話を鑑賞する」という構想の核心を実現する
- どこで: 既存リポジトリ `mkb-reader`

## 参照ドキュメント

- 仕様書: docs/spec-phase3b.md（全ての実装判断の根拠。§0の設計思想を含む）
- Phase 3a仕様書: docs/spec-phase3a.md（§4.5設定原則、§4.6ローカル設定の基盤定義）
- _STATUS.md: 作業開始前に必ず読むこと
- CLAUDE.md: リポジトリの規約を確認すること

## 作業手順

### Step 1: §18 チャットログ変換

1. chatConverter.js を実装する
   - conversations.json をパースし、各会話をMkbData構造体に変換
   - 変換ルールは仕様書§18に従う
   - 話者名はBoldテキスト（`**human**`）として埋め込む（読み替え対象にするため）
   - メッセージ間は `---` で区切る（§7の表示方式設定が効くようにするため）
2. ChatImporter.jsx を実装する
   - .json ファイルを開き、会話リスト（タイトル/日付/メッセージ数）を表示
   - 会話の選択（複数選択可、全選択ボタン）
   - 「変換」ボタンで選択会話をMkbDataに変換
   - 1つ選択時: ビューアで表示
   - 複数選択時: 本棚に一括保存
3. 本棚画面にChatImporter へのアクセスUIを追加する
4. テスト用 docs/test-files/test-conversations.json を作成する

### Step 2: §14 読み替え設定

1. rewriteEngine.js を実装する
   - `applyRewrite(originalMd, rules, chapterId)` 純粋関数
   - 適用順序: speakerNames → replacements → hiddenRanges
   - speakerNamesは `**human**` パターンのみ置換（本文中の「human」は置換しない）
2. useRewrite.js を実装する
   - localSettings.rewrite の読み取り・書き込み
   - useBookshelf経由でIndexedDBに保存
   - ルール変更時にビューア再描画をトリガー
3. RewritePanel.jsx を実装する
   - 話者名入力欄（リアルタイムプレビュー反映）
   - テキスト置換の追加・削除・有効/無効切替
   - 非表示範囲の追加・削除（行番号指定）
   - ボトムシートまたはドロワー形式（SettingsPanelと同じ操作体系）
4. MarkdownRenderer.jsx を変更する
   - レンダリング前に rewriteEngine.applyRewrite() を呼ぶ
   - 読み替え箇所に `rewritten` CSSクラスを付与（薄い背景色）
5. ビューア画面のヘッダーに読み替えボタン（✏アイコン）を追加する

### Step 3: §15 画像差し込み

1. rewriteEngine.js に insertedAssets の適用を追加する
   - 適用順序の最後（hiddenRangesの後）に実行
   - 挿入位置の行の後に `![altText](blob:url)` を挿入
2. ImageInserter.jsx を実装する
   - RewritePanel内の「画像を差し込む」ボタン
   - ファイルピッカーで画像選択
   - §12のリサイズを適用
   - 挿入位置の指定（デフォルト: 現在表示中ページ末尾、行番号で調整可能）
   - altTextの入力
3. insertedAssetsをlocalSettings.rewrite に保存する

### Step 4: §16 MKBエクスポート

1. useExport.js を実装する
   - `exportMkb(bookEntry, options)` → Blob
   - 原本展開 → 読み替え適用 → assets統合 → JSZip構築
   - 「読み替えを適用する」オプションのオン/オフ
   - insertedAssetsはBlob URLではなくファイルパス（`assets/inserted-xxx.png`）に変換
2. ExportDialog.jsx を実装する
   - タイトル/著者の入力
   - 読み替え適用のチェックボックス
   - エクスポートボタン
   - ブラウザのダウンロードAPIでファイル保存
3. ビューア画面のヘッダーにエクスポートボタン（↓アイコン）を追加する

### Step 5: 統合テスト・デプロイ

1. 一連の流れをテストする:
   JSON取り込み → 話者名読み替え → 画像差し込み → MKBエクスポート → エクスポートしたMKBを再度開く
2. `npm run build` → `git push origin main`
3. Pixel 10実機で確認

## 禁止事項

- 原本ファイル（BookEntry.fileData）を変更する処理を書かない
- rewriteEngine.jsを純粋関数以外の形で実装しない（副作用を持たせない）
- 仕様書に記載のない機能を追加しない
- 仕様外の設計判断が必要な場合は作業を停止し報告する

## 完了条件

1. Claude.aiエクスポートJSON（テスト用）を開き、会話リストが表示される
2. 会話を変換し、ビューアで human/assistant の発言が区切られて表示される
3. 複数会話を選択して本棚に一括保存できる
4. 話者名読み替えがリアルタイムでビューアに反映される
5. テキスト置換が動作し、読み替え箇所がハイライトされる
6. テキスト置換の有効/無効切替が動作する
7. 行の非表示が動作する
8. 読み替えルールがアプリ再起動後も維持される
9. 画像を差し込み、指定位置に表示される
10. 差し込み画像がリサイズされて保存される
11. MKBエクスポートでファイルがダウンロードされる
12. 読み替え適用ありでエクスポートしたMKBに読み替え済みテキストが含まれる
13. 読み替え適用なしでエクスポートしたMKBが原本のままである
14. GitHub Pagesにデプロイされている
15. _STATUS.mdが更新されている

## コミットメッセージ形式

```
[Phase3b] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §N への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。
特に以下の箇所は設計思想との関連を記述すること:
- rewriteEngine.jsの冒頭: 「読み替え」の定義と、なぜ純粋関数であるべきか
- chatConverter.jsの話者名埋め込み: なぜBoldテキストとして埋め込むか（読み替えの対象にするため）
- useExport.jsの原本展開: なぜfileDataから毎回展開するか（原本を変更しない原則）
- insertedAssetsの適用順序: なぜhiddenRangesの後か
