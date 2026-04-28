# mkb-reader 作業指示書（Phase 3a: §10〜§13）

作成日: 2026-04-29
PM: クリーデ
対応仕様書: docs/spec-phase3a.md

---

## 作業範囲

- 何を: ビューアの対応フォーマット拡張（HTML/JSON/画像/CBZ）とページネーション品質改善
- なぜ: テキスト以外のコンテンツも鑑賞できるようにする（仕様書 §10〜§13）
- どこで: 既存リポジトリ `mkb-reader`

## 参照ドキュメント

- 仕様書: docs/spec-phase3a.md（全ての実装判断の根拠）
- _STATUS.md: 作業開始前に必ず読むこと
- CLAUDE.md: リポジトリの規約を確認すること

## 作業手順

### Step 1: ViewerContentの抽象化

App.jsxのデータフローを変更する。現在のmkbData前提の構造を、ViewerContent型（仕様書§10参照）で抽象化する。

1. ViewerContent型を定義する（type: 'mkb' | 'html' | 'json' | 'images'）
2. App.jsxのビューア画面でtypeに応じてレンダラーを切り替える分岐を入れる
3. 既存のmkb表示が壊れていないことを確認する

**これを最初にやる理由:** 以降の§10〜§11は全てこの分岐の上に乗る。

### Step 2: §10 HTML / JSON閲覧

1. useMkbLoader.jsのファイルタイプ判定に `.html`, `.json` を追加
2. ファイル選択の accept に `.html,.json` を追加
3. HtmlRenderer.jsx を実装する
   - iframe sandbox="allow-same-origin" + srcdoc
   - テーマの背景色・文字色をiframe内に注入
   - スクロールモード固定（ページネーション非対応）
4. JsonRenderer.jsx を実装する
   - JSON.parse → 整形表示
   - キー名/文字列/数値/真偽値の色分け（CSS変数使用、ライブラリ不使用）
   - オブジェクト/配列の折りたたみ（クリックトグル）
   - 1MB超の場合は最初の1000行まで表示 +「続きを表示」ボタン
   - 等幅フォント（--font-code）を使用
5. テスト用ファイル docs/test-files/test.html, test.json を作成する

### Step 3: §11 画像ビューアモード + CBZ

1. mkbParser.jsにZIP展開後の内容判定ロジックを追加する
   - MDなし + 画像あり → images型を返す
2. useMkbLoader.jsに以下を追加する
   - .cbz: ZIPとして展開 → 画像抽出 → images型
   - .zip: 展開後に内容判定（MD含む→mkb、画像のみ→images）
   - .jpg/.png/.gif/.webp: 単体画像 → images型
   - input multiple: 複数画像 → images型
3. ファイル選択の accept に `.cbz,.zip,.jpg,.jpeg,.png,.gif,.webp` を追加
4. `<input>` に `multiple` 属性を追加
5. ImageViewer.jsx を実装する
   - 1ページ1画像: img + object-fit: contain + 100vh
   - 自然順ソート: localeCompare('en', { numeric: true })
   - タップ/スワイプ/キーボードによるページ送り（§4・§7の設定に従う）
   - ページインジケーター（「3 / 12」）
   - ピンチズーム: CSS transform scale + touchmoveイベント
   - ダブルタップ: 等倍/フィット切替
   - ズーム中はスワイプページ送り無効化
6. MD内画像のタップ拡大を実装する
   - MarkdownRenderer.jsxのimgカスタムコンポーネントにonClickを追加
   - モーダル表示（100vw × 100vh、object-fit: contain、ピンチズーム可）
   - モーダル外タップ or 戻るで閉じる
7. MD内画像の表示モード判定を実装する
   - imgカスタムコンポーネントでonLoadから naturalWidth/naturalHeight を取得
   - ビューポート幅との比率で img-inline / img-block / img-fullpage のCSSクラスを付与
   - img-fullpage: break-before: column + object-fit: contain で1ページ全面表示
   - 判定閾値はuseSettings.jsの imageDisplayMode（'text-first'/'balance'/'image-first'）に従う
8. テスト用ファイルを作成する
   - docs/test-files/test.cbz（5枚の小さな実画像）
   - docs/test-files/test-mixed-images.md（大小さまざまな画像参照を含むMD + 画像ファイル）

### Step 3.5: 設定パネル改訂

**仕様書§4.5に従い、SettingsPanel.jsxを再構成する。**

1. SettingsPanel.jsxをセクション分割する（アコーディオン形式）
   - 文字 / フォント / テーマ / 操作 / 区切り線 / 画像表示 / 表示モード の7セクション
2. 各セクションの主UIをプリセット選択ボタンにする
3. 「文字」セクションのスライダー（フォントサイズ・行間・余白）を「詳細設定」として折りたたむ
   - デフォルトでは非表示。「詳細」リンクをタップで展開
4. 「画像表示」セクションを新設する
   - プリセット3択: 文章優先 / バランス / 画像優先
5. useSettings.jsに imageDisplayMode を追加する（デフォルト: 'balance'）

### Step 3.6: グローバル/ローカル設定の二層構造

**仕様書§4.6に従い、設定の二層構造を実装する。**

1. BookEntryにlocalSettingsフィールドを追加する（useBookshelf.jsのIF変更）
   - 既存データとの互換性: localSettingsがundefinedの場合はグローバルにフォールバック
2. useSettings.jsに以下を追加する
   - `getEffectiveSettings(bookId?)`: グローバルとローカルをマージして返す
   - `setLocalSetting(bookId, key, value)`: IndexedDB内のBookEntryのlocalSettingsを更新
   - `clearLocalSettings(bookId)`: localSettingsを削除（グローバルに戻す）
3. 設定パネルのヘッダーに「この本 / すべての本」切替を追加する
4. 「この本」選択時: ローカル設定を編集。上書き済み項目にドットインジケータを表示
5. 「この本」の各項目に「リセット」ボタンを追加（タップでその項目のローカル設定を削除）
6. App.jsxのビューア画面で、開いているファイルのbookIdをuseSettingsに渡す

### Step 4: §12 画像リサイズ

1. useImageResize.js を実装する
   - Canvas APIでリサイズ（長辺2048px超の場合のみ）
   - 元のMIMEタイプを維持
2. useBookshelf.jsの saveBook() を変更する
   - 保存前にファイル内の画像をリサイズする処理を追加
   - mkb/cbz/zip: 展開 → 各画像リサイズ → 再ZIP化 → 保存
   - 単体画像: リサイズ → 保存
   - プログレス表示（「3/20 画像を処理中...」）
3. テスト用ファイル docs/test-files/test-large-images.zip を作成する
   - 3000px超のPNG画像3枚（Canvas APIで生成してよい）

### Step 5: §13 ページネーション禁則改善

1. reader.css に禁則CSSルールを追加する（仕様書§13のCSS定義に従う）
   - break-after: avoid（見出し）
   - orphans/widows: 2（段落・リスト）
   - break-inside: avoid（blockquote, pre, table, li）
2. Paginator.jsxのページ数計算を改善する
   - `document.fonts.ready` を待ってから計算
   - フォント変更時に再計算をトリガー
   - コンテナ内の全 `<img>` のloadを待ってから確定（タイムアウト5秒）
3. 既存のテスト用mkb（見出し・段落・コードブロック含む）で改善を確認する

### Step 6: デプロイと実機確認

1. ビルド確認: `npm run build` が正常完了すること
2. `git push origin main` でGitHub Pagesにデプロイ
3. Pixel 10実機で全テスト項目（仕様書§5参照）を確認

## 禁止事項

- 仕様書に記載のない機能を追加しない
- 仕様書に記載のないファイルを新規作成しない（テスト用ファイルを除く）
- 仕様書の原本を改変しない
- ImageViewer.jsx にテキスト関連の設定（フォント・行間・余白）を適用しない
- 仕様外の設計判断が必要な場合は作業を停止し報告する

## 完了条件

1. HTMLファイルをビューアで開き、テーマ色が適用された状態で読める
2. script入りHTMLでscriptが実行されないこと
3. JSONファイルを整形表示で開き、折りたたみが動作する
4. CBZファイルを開き、1ページ1画像でスワイプ送りできる
5. 画像複数選択でビューア表示できる
6. 画像のみZIPを開くと画像ビューアモードになる
7. MD含みZIPを開くとmkbとして表示される
8. ピンチズームで画像を拡大/縮小できる
9. MD内の画像をタップすると拡大モーダルが表示される
10. 画像表示プリセット切替で、大きい画像のフルページ表示判定が変わる
11. 大きな画像を含むファイルを本棚保存するとリサイズされる
12. リサイズ中にプログレスが表示される
13. 見出しがページ末尾に孤立しにくくなっている
14. フォント切替後にページ数が再計算される
15. 設定パネルがセクション分割され、プリセット選択が主UIになっている
16. 「文字」セクションのスライダーが「詳細」として折りたたまれている
17. 「この本 / すべての本」の切替が動作し、ローカル設定が本ごとに保存される
18. ローカル設定をリセットするとグローバル設定に戻る
19. GitHub Pagesにデプロイされている
20. _STATUS.mdが更新されている

## コミットメッセージ形式

```
[Phase3a] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §N への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。
特に以下の箇所は意図を詳しく記述すること:
- ViewerContent型の分岐ロジック（将来の型追加に備えた設計意図）
- mkbParser.jsのZIP内容判定（MD含む/画像のみの分岐条件）
- ピンチズームの座標計算（transform-originの扱い）
- 画像リサイズのCanvas API処理（MIMEタイプ維持の理由）
- MD内画像の表示モード判定ロジック（閾値A/Bの使い分け、フルページ時のbreak-before）
- SettingsPanel.jsxのセクション分割（プリセット優先の設計意図）
