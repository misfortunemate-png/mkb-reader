# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-04-29 (Phase 2 全工程完了)
更新者: PG（Claude Code）

## 現在のフェーズ
Phase 9: Phase 3a 全工程実装完了 → 実機検証待ち

## 完了事項（Phase 1）
- §1〜§4 実装、検証デプロイ済み
- 実機検証で §4 画像表示の不具合を確認 → Phase 2 で対応

## 完了事項（Phase 2 前半 — 検証済）
- §4修正: 画像表示バグ
  - urlTransform 上書きで blob: URL を許可
  - mkbParser で Blob に MIME type 明示
  - テスト画像を pure-JS PNG エンコーダで再生成（前回の base64 経由バイナリが破損）
- §9 PWA + オフライン対応
  - vite-plugin-pwa 導入、autoUpdate + skipWaiting/clientsClaim
  - manifest / 12 entries precache（test.mkb 同梱）
  - Google Fonts CSS / woff2 を CacheFirst で runtimeCaching
- §8 本棚（仮実装）
  - useBookshelf.js（IF 安定: saveBook/getBook/getAllBooks/deleteBook/updateLastOpened/findByTitle）
  - Bookshelf.jsx（仮 UI、装飾なし、左スワイプ削除）
  - App.jsx に二画面（shelf ↔ reader）構成導入
- 副次修正: setext heading 化抑制（normalizeThematicBreaks）
- CI 修正: .npmrc に legacy-peer-deps=true（vite-plugin-pwa の peer 不一致対応）

## 完了事項（Phase 2 後半 — 本コミット）
- §5 フォント選択
  - 3種（Noto Serif JP / Shippori Mincho / Zen Old Mincho）の Google Fonts 動的ロード
  - 選択フォントだけ <link> を head に追加し、未選択は除去（無駄なダウンロード防止）
  - 欧文ペアリング: Cormorant Garamond を仮採用、CSS 変数 `--font-body` の先頭に置く
  - SettingsPanel にプレビュー（あいうえお ABCabc 0123）
- §6 テーマ切替
  - light / dark / sepia の 3 テーマを CSS 変数で定義
  - `data-theme` 属性で即時切替、トランジション付き（200ms）
  - SettingsPanel に色見本ボタン 3 つ
- §7 表示カスタマイズ
  - 文字サイズ / 行間 / 左右余白のスライダー（CSS 変数 `--font-size` / `--line-height` / `--content-padding` に即時反映）
  - スワイプ方向（左右 / 上下）のトグル
  - `---` 表示方式 4 種（改ページ / 区切り線 / 余白 / 装飾）
    - スクロールモードでは `data-style="page-break"` を「余白」へ自動フォールバック
  - プリセット 3 種（ゆったり / 標準 / コンパクト）
- 設定一元管理 useSettings.js
  - 全設定を `mkb-reader.settings.v1` にまとめて localStorage に保存
  - Phase 1 の旧 `mkb-reader.mode` キーから自動移行
  - DOM への即時反映（CSS 変数 / data-theme / フォント link）
- SettingsPanel.jsx ボトムシート
  - ヘッダー右の ⚙ ボタンで開閉
  - オーバーレイで背景にビューア本文が薄く透けてプレビュー

## 動作確認（ローカル preview = production build）
- ⚙ → 設定パネル開閉 OK
- light → dark → sepia の即時切替 OK（背景 #faf8f5 ↔ #1a1a1a ↔ #f4ecd8 確認）
- フォント切替で <link> tag が動的に差し替わる OK
  （例: Shippori 選択時 mkb-font-noto-serif-jp が削除され mkb-font-shippori-mincho が追加）
- フォントサイズ / 行間 / 余白スライダーが CSS 変数に即時反映 OK
- 設定 localStorage に永続化 OK（リロード後も維持）
- npm run build 成功（PWA: 12 entries / 539.74 KiB）

## Phase 2 実機検証結果（Pixel 10、2026-04-29）
- §5/§6/§7/§8/§9 すべて OK
- 修正済不具合: ページ送り時 wikilinks 不動 → frame onClick 方式に変更（8c1eca1）

## 完了事項（Phase 3a — 4 コミット分）
- **コミット A**: ViewerContent 抽象化 + §10 HTML/JSON
  - useMkbLoader が ViewerContent（'mkb'|'html'|'json'|'images'）を返す
  - HtmlRenderer（iframe sandbox、script 不可、テーマ色 inline 注入）
  - JsonRenderer（自前ハイライト、再帰折りたたみ、1MB 超は打切り）
- **コミット B**: §11 画像ビューア + CBZ + MD 内画像表示モード
  - mkbParser に zipHasMarkdown / parseImagesZip
  - useMkbLoader が .cbz / .zip(画像のみ) / 単体画像 / File[] を images 型に集約
  - ImageViewer（1ページ1画像、ピンチ・ダブルタップ・スワイプ・キーボード）
  - MdImage が naturalSize × imageDisplayMode で img-inline / block / fullpage を分類
  - 画像タップで全画面モーダル
  - useSettings に imageDisplayMode（'text-first'|'balance'|'image-first'）
  - docs/test-files/test.cbz 同梱（pure-JS 生成 1.3KB）
- **コミット C**: 設定パネル改訂 + グローバル/ローカル二層
  - SettingsPanel をアコーディオン化、プリセット主導 UI に再構成
  - 「文字」セクション内に詳細スライダーを折りたたみ
  - スコープ切替「すべての本 / この本」
  - 上書き項目のドット表示と各セクションのリセットボタン
  - useSettings 全面改修: global（localStorage）+ local（IndexedDB.BookEntry.localSettings）
  - useBookshelf に getLocalSettings / saveLocalSettings
- **コミット D**: §12 画像リサイズ + §13 禁則改善
  - useImageResize.js 新規（resizeImage / resizeImagesInZip、長辺 2048px）
  - useBookshelf.saveBook が本棚保存時に各画像を自動リサイズ + 進捗状態
  - App.jsx に進捗バッジ「N / M 画像を処理中…」
  - reader.css 禁則ルール追加（h1-6 の break-after avoid、p/li の orphans/widows、
    blockquote/pre/table/li の break-inside avoid）
  - usePagination が document.fonts.ready / 画像 load / フォント差替時に再計算

## 動作確認（ローカル production preview）
- 本棚 → サンプル → ビューア表示 OK
- 設定パネルの新レイアウト（スコープ切替・セクション・プリセット）OK
- chapter-three 画像が img-inline 自動分類（64px/375vw=17% < balance.inline 25%）
- npm run build 成功（precache 12 entries / 559.91 KiB）

## 未完了事項
- Pixel 10 実機での Phase 3a 検証
  - HTML/JSON 表示（test.html script 安全性 / test.json 折りたたみ）
  - CBZ（test.cbz）でページ送り
  - 画像複数選択 → 画像ビューア
  - MD 内画像のサイズ判定（プリセット切替で挙動が変わる）
  - 画像タップで全画面モーダル
  - 大きな画像を含むファイルを保存 → リサイズ進捗 → 容量縮小
  - 「この本」設定の上書き・リセット
  - 禁則改善（見出し孤立・段落分割）

## 次のアクション
- 誰が: ショウゴ
- 何を:
  1. main へ push されたデプロイで Pixel 10 実機検証
  2. 不具合・違和感を PM に報告
  3. 問題なければ Phase 3b 仕様策定（編集モード・画像挿入・MKBエクスポート・縦書き）へ

## 備考
- Phase 2 の受入基準（13項目）はすべて実装上は満たしている。実機での主観評価が残作業。
- テスト用画像置き場 docs/test-images/ を新設。次回検証時に実画像を用いる。
- Bookshelf.jsx は仮実装のまま据え置き（Phase 3 以降で全面差替予定）。
- vite-plugin-pwa@1.2.0 と Vite 8 の peer 不一致は .npmrc の legacy-peer-deps=true で許容中。
