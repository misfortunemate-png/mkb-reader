# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-04-29 (Phase 2 全工程完了)
更新者: PG（Claude Code）

## 現在のフェーズ
Phase 7: Phase 2 全工程実装完了 → 実機検証待ち

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

## 未完了事項
- Pixel 10 実機での動作検証
  - 3 フォントの切替（特に Web フォント遅延ロードの体感）
  - 3 テーマの切替（特に sepia の屋外視認性）
  - スライダー操作（タッチ操作での感度）
  - スワイプ方向「上下」設定での操作感
  - `---` 改ページ方式の挙動

## 次のアクション
- 誰が: ショウゴ
- 何を:
  1. デプロイ後、PWA を再インストール または 強制リロードで新 SW を取り込む
  2. Pixel 10 で各設定項目を一通り確認
  3. 不具合・体感の悪い点を PM に報告
  4. 問題なければ Phase 3 仕様策定へ

## 備考
- Phase 2 の受入基準（13項目）はすべて実装上は満たしている。実機での主観評価が残作業。
- テスト用画像置き場 docs/test-images/ を新設。次回検証時に実画像を用いる。
- Bookshelf.jsx は仮実装のまま据え置き（Phase 3 以降で全面差替予定）。
- vite-plugin-pwa@1.2.0 と Vite 8 の peer 不一致は .npmrc の legacy-peer-deps=true で許容中。
