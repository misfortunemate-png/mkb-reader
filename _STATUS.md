# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-04-27 23:55
更新者: PG（Claude Code）

## 現在のフェーズ
Phase 5: 実装完了 → 検証デプロイ待ち

## 完了事項
- 要件定義v2.1 承認済み
- 実装仕様書（§1〜§4）作成済み
- 作業指示書（Phase 1）作成済み
- プロジェクト初期化（Vite 8 + React 19 + Tailwind CSS 4）
- §1 ファイル読み込み（FileLoader / useMkbLoader / mkbParser）
  - .mkb（JSZip + markbook.yaml）/ .md / .txt 対応
  - assets の Blob URL 自動置換
- §2 Markdown描画（MarkdownRenderer + reader.css）
  - react-markdown + remark-gfm + remark-wiki-link
  - wikilinks（既存→通常リンク / 不在→グレーアウト）
- §3 チャプターナビゲーション（ChapterNav）
  - 768px未満: ドロワー / 768px以上: 左サイドバー
  - 単一チャプター時はUI非表示
- §4 ページネーション（Paginator + usePagination）
  - CSS multi-column + translateX
  - タップ／スワイプ／キーボード（←→/PageDown/PageUp/Space）
  - ページインジケーター（n/m）
  - スクロールモード切替（localStorage 永続化）
- テスト用 mkb（docs/test-mkb/ → public/test.mkb 自動生成）
  - index.md, pages/chapter-one〜three.md, assets/test-image.png, markbook.yaml
- GitHub Actions ワークフロー（.github/workflows/deploy.yml）
- vite.config.js base = '/mkb-reader/'

## 動作確認（ローカル npm run dev）
- ウェルカム画面 → 「同梱のテスト用 mkb を開く」で test.mkb を fetch → 描画 OK
- ページ送り（タップ／キー） OK
- チャプター切替（サイドバー） OK / 6ページ計算 OK
- スクロールモード切替 → localStorage に保存 OK
- 本番ビルド `npm run build` 成功（dist/ 生成、test.mkb 同梱）

## 未完了事項
- GitHub への push と Pages 設定（リポジトリ Settings → Pages → Source: GitHub Actions を有効化する必要あり）
- Pixel 10 実機検証（§4 検証ポイント）

## 次のアクション
- 誰が: ショウゴ
- 何を:
  1. リポジトリの Settings → Pages → Source を「GitHub Actions」に設定
  2. main へ push（Actions が走り Pages にデプロイされる）
  3. Pixel 10 Chrome で https://misfortunemate-png.github.io/mkb-reader/ にアクセス
  4. 検証ポイント（仕様書 §4 末尾）の実機評価結果を PM へ報告

## 検証で報告したい点
- ページネーションの読書体験（鑑賞に値するか）
- 日本語テキストの禁則・見出し切れ等の不具合
- スワイプ／タップの操作感
- 長文（chapter-one は約3,500字）でのページ計算精度
- 画像を含む MD（chapter-three）でのレイアウト崩れ

## 備考
- Phase 1 のスコープは検証デプロイまで。§5〜§9 は実機検証後に着手。
- 仕様書通り CLAUDE.md / _STATUS.md はリポジトリ直下、要件定義・仕様書・指示書は docs/ 配下。
- テスト用画像は scripts/build-test-mkb.mjs が無ければ 1x1 PNG プレースホルダを自動生成する。
