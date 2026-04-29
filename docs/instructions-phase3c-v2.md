# mkb-reader 作業指示書（Phase 3c: §20〜§26）

作成日: 2026-04-29
PM: クリーデ
対応仕様書: docs/spec-phase3c.md（v2）

---

## 背景

Phase 1〜3bで全機能を実装済み。Phase 3cは安定化と体験の仕上げ。
**仕様書の§0（プロジェクト概要・設計思想・ファイル構成・データ構造）を最初に読むこと。**
特に「原本不変の4原則」と「設定UIの原則: プリセット優先」は全ての判断の基盤。

---

## 作業範囲

- 何を: タップ操作の交通整理、欧文フォント選択、中断箇所の再開、コンテキストメニュー（LineEdit+undo）、チャットログ品質改善、UI磨き込み
- なぜ: 日常使用に耐える品質に仕上げる
- どこで: 既存リポジトリ `mkb-reader`

## 参照ドキュメント

- 仕様書: docs/spec-phase3c.md（v2。§0にプロジェクト全体の概要・設計思想・ファイル構成・データ構造を含む）
- _STATUS.md: 作業開始前に必ず読むこと
- CLAUDE.md: リポジトリの規約を確認すること

---

## 作業手順

### Step 1: §20 モバイル表示問題の診断 → ✅ 解決済み

**原因判明:** ChromeのPCモード（デスクトップサイト）がPWAに波及していた。ユーザーが設定を解除し解消。コード変更不要。

### Step 2: §24 タップゾーン設定

**目的:** ページ送りのタップ領域を限定し、本文エリアでネイティブ操作を有効にする。

1. `useSettings.js` の `DEFAULTS` に `tapZone` を追加する
   ```js
   tapZone: { preset: 'bottom-corners', height: 80, width: 30 }
   ```
2. `Paginator.jsx` の `handleFrameClick` を改修する
   - `tapZone.preset` に応じてクリック位置がタップゾーン内か判定
   - `bottom-corners`: 画面下部（height px）かつ左右端（width %）内のみページ送り
   - `sides`: 画面左右の縦帯（width %）内のみページ送り
   - `fullpage`: 現行互換（左右半分）
   - ゾーン外はイベントをスルー（ネイティブ挙動を通す）
3. `SettingsPanel.jsx` に「タップゾーン」セクションを追加する
   - プリセット3択ボタン: 下部コーナー / 左右サイド / 全面
   - 詳細設定（折りたたみ内）: 高さスライダー（40〜160px, 20px刻み）、幅スライダー（20〜50%, 5%刻み）
   - 変更時にビューア上にタップゾーンの半透明オーバーレイ（accent色, opacity 0.15）を3秒間表示する仕組みを実装
4. 確認項目:
   - `bottom-corners` 設定で、本文エリアのタップがページ送りにならないこと
   - `<details>` の展開/格納が動作すること
   - リンクのクリックが動作すること
   - スワイプでのページ送りは全画面で引き続き動作すること

### Step 3: §25 欧文フォント選択

1. `useSettings.js` を改修する
   - `PAIRING` 定数を `LATIN_FONTS` オブジェクトに置き換える:
     ```js
     export const LATIN_FONTS = {
       'eb-garamond': {
         label: 'EB Garamond',
         family: "'EB Garamond'",
         href: 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap',
       },
       'libre-baskerville': {
         label: 'Libre Baskerville',
         family: "'Libre Baskerville'",
         href: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
       },
       'lora': {
         label: 'Lora',
         family: "'Lora'",
         href: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap',
       },
     };
     ```
   - `DEFAULTS` に `latinFont: 'eb-garamond'` を追加
   - `applyToDocument` の font-family スタック構築で `LATIN_FONTS[s.latinFont]` を使用
   - フォント link の動的ロード/アンロードを欧文にも対応
2. `SettingsPanel.jsx` の「フォント」セクションに欧文フォント3択ボタンを追加する
   - 日本語フォント選択の直下に配置
3. 確認項目:
   - 3種のフォントが正しく切り替わること
   - 英小文字の可読性が Cormorant Garamond より改善されていること
   - グローバル/ローカル二層で動作すること

### Step 4: §26 中断箇所の再開

1. `LocalSettings` に `lastPosition` を追加する（仕様書§26のデータ構造参照）
2. `useBookshelf.js` に `saveLastPosition(bookId, position)` メソッドを追加する
   - IndexedDB の BookEntry.localSettings.lastPosition を更新
3. `App.jsx` / `Paginator.jsx` / `usePagination.js` を改修する
   - ページ送り時 / チャプター切替時 / スクロール時に `saveLastPosition` を呼ぶ（debounce付き）
   - `handleOpenBook` でファイルを開いた後、`lastPosition` が存在すれば該当チャプター・ページに復帰
4. 確認項目:
   - ファイルを閉じて再度開くと前回の位置から再開すること
   - 存在しないチャプターIDが保存されていた場合に先頭へフォールバックすること
   - ページ数が変わった場合（フォント変更等）に最終ページへフォールバックすること

### Step 5: §21 コンテキストメニュー

**これが本フェーズの最大の作業。仕様書§21を精読すること。**

#### 5a: data-source-line 属性の付与
1. `MarkdownRenderer.jsx` のカスタムコンポーネントに `data-source-line` 属性を追加する
   - react-markdownのAST nodeから `node.position?.start?.line` を取得
   - `<p>`, `<h1>`〜`<h6>`, `<blockquote>`, `<li>`, `<pre>` に付与
   - 位置情報がない場合は属性を省略（graceful degradation）

#### 5b: ContextMenu.jsx の作成
1. 新規コンポーネント `ContextMenu.jsx` を作成する
   - 長押し検出（700ms、指移動10px以下）
   - ブラウザネイティブのテキスト選択を `preventDefault` で抑制
   - position: fixedで長押し位置に表示
   - 画面端のはみ出し補正
   - メニュー外タップで閉じる
   - テーマCSS変数に従うスタイリング
2. メニュー項目: 「この行を非表示にする」「テキストを読み替える」「ここに画像を差し込む」「元に戻す」「読み替え設定を開く」

#### 5c: LineEdit の実装
1. `rewriteEngine.js` に `applyLineEdits(lines, lineEdits, chapterId)` を追加する
   - 処理順序: `speakerNames → lineEdits → replacements → hiddenRanges → insertedAssets`
   - lineEdits は行番号 + original テキスト完全一致で置換
   - rewriteEngine の純粋性を維持すること
2. `useRewrite.js` に `addLineEdit` / `updateLineEdit` / `removeLineEdit` を追加する

#### 5d: undo スタックの実装
1. `useRewrite.js` に undo 機能を追加する
   - `undoStack` をstate管理（最大50件）
   - `addLineEdit` / `addHiddenRange` / `addInsertedAsset` 実行時にスタックにプッシュ
   - `undo()` でpop → 対応ルールを削除
   - セッション内のみ（永続化しない）

#### 5e: 画像差し込みのサイズ選択
1. `InsertedAsset` に `displaySize` フィールドを追加する
2. コンテキストメニューからの画像差し込み時、ファイルピッカーの前にサイズ選択UI（inline/block/fullpage の3択）を表示する
3. `rewriteEngine.applyInsertedAssets` で `displaySize` に応じてクラスを切り替える（既存の `img-inline`/`img-block`/`img-fullpage` CSSクラス）
4. **PGへの裁量:** この3択を基本とするが、より細かい制御（幅%指定等）が自然に追加できるなら拡張してよい

#### 5f: Paginator.jsx / スクロールモードでの長押し検出
1. §24で実装したタップゾーン外の領域で長押しイベントを検出する
2. タップゾーン内での長押しはメニュー非表示（ページ送り操作の延長として扱う）
3. スワイプとの競合回避: 指移動10px超はスワイプ扱い

#### 5g: 対象フォーマットの確認
- MD / txt: MarkdownRenderer経由のため対応
- HTML / JSON / 画像: コンテキストメニュー非表示
- 本棚に未保存のファイル: コンテキストメニュー非表示（activeEntry がないため）

### Step 6: §22 チャットログ変換の品質改善

1. 話者名のスタイリングを改善する
   - MarkdownRenderer.jsxで `**human**` / `**assistant**`（または読み替え後の名前）を含む行を検出
   - CSSクラス `speaker-human` / `speaker-assistant` を付与
   - reader.cssに話者名のスタイル追加（背景色、左ボーダー、パディング）
   - 読み替え後の話者名にも同じスタイルが適用されるようにする
     - **方式:** rewriteEngine.jsのspeakerNames置換時に、マーカーを付与する方式を検討。ただしrewriteEngineは純粋関数であり、CSSクラスの付与はMarkdownRenderer.jsx側の責務
2. ChatImporter UIの改善
   - 会話リストにタイトル検索フィルタを追加（input + リアルタイムフィルタ）
   - 各会話の最初の2メッセージをプレビュー表示（折りたたみ）
   - 大量変換時のプログレス表示
3. `<details>` 折りたたみのCSS multi-column内動作を確認する
   - 問題があれば `break-inside: avoid` を追加

### Step 7: §23 UI磨き込み

1. ヘッダーアイコンのSVG化
   - Unicode記号をインラインSVGに置き換える
   - lucide-icons等からSVGパスを抽出し、直接埋め込み（外部依存を増やさない）
   - `currentColor` でテーマ色に自動追従
   - アイコン一覧: メニュー、戻る、保存、読み替え、エクスポート、設定
   - モバイル幅（412px）でアイコンが収まるか確認。収まらない場合はオーバーフローメニュー（⋮）
2. 本棚画面の改善
   - ファイルタイプに応じたアイコン（絵文字で可: 📖 / 📝 / 🖼 / 💬 等）
   - lastOpenedAtの相対表示（Intl.RelativeTimeFormat使用）
3. エラーハンドリング統一
   - 簡易トーストコンポーネント `Toast.jsx` を作成（画面下部に3秒表示→フェードアウト）
   - ファイル読み込みエラー、ZIP展開エラー、JSON解析エラーで使用

### Step 8: デプロイと検証

1. `npm run build` → `git push origin main`
2. Pixel 10実機で全テスト項目を確認（仕様書§5のテスト方針表を参照）
3. `_STATUS.md` を更新

---

## 禁止事項

- `BookEntry.fileData`を変更する処理を書かない
- `rewriteEngine.js`に副作用を持たせない
- viewport metaを変更しない
- 仕様外の設計判断が必要な場合は作業を停止し報告する

## 完了条件

1. ~~モバイル表示問題の原因が特定され、可能な場合は修正されている~~ → ✅ 解決済み
2. タップゾーンが設定可能で、ゾーン外ではテキスト選択・details展開・リンク動作が正常
3. タップゾーン設定変更時にオーバーレイプレビューが表示される
4. 欧文フォント3種（EB Garamond / Libre Baskerville / Lora）が選択・切替可能
5. ファイルを閉じて再度開くと中断箇所から再開する
6. テキスト長押しでコンテキストメニューが表示される
7. メニューから行非表示が即座に動作する
8. メニューからテキスト読み替え（段落全体取得→直接編集）が即座に動作する
9. メニューから画像差し込み（サイズ選択付き）が動作する
10. 「元に戻す」で直前の操作が取り消される
11. 通常タップ（タップゾーン内ページ送り）とメニュー表示が競合しない
12. 話者名が視覚的に区別できるスタイルで表示される
13. ChatImporterで会話タイトルの検索フィルタが動作する
14. ヘッダーのSVGアイコンが明瞭でモバイル幅に収まる
15. エラー時にトースト通知が表示される
16. GitHub Pagesにデプロイされている
17. `_STATUS.md` が更新されている

## コミットメッセージ形式

```
[Phase3c] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §N への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。
特に以下の箇所は意図を詳しく記述すること:
- タップゾーン判定ロジック（プリセットごとの座標計算）
- ContextMenu.jsxの長押し検出ロジック（タップゾーン/スワイプとの競合回避の設計）
- `data-source-line` 属性の付与（行番号特定の仕組みと限界）
- LineEditとreplacementsの処理順序（具体が汎用に上書きされない設計）
- undoスタックのライフサイクル（セッション内のみ、永続化しない理由）
- 話者名スタイリングの検出方法（rewriteEngineの純粋性を損なわない設計）
