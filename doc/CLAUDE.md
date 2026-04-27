# mkb-reader

MarkBook（.mkb）およびMarkdownファイルを美しく読むためのPWAビューア。

## 状態確認
作業開始前に `_STATUS.md` を読み、現在のフェーズと未完了事項を確認すること。
作業中断時は `_STATUS.md` を更新してから終了すること。

## 技術スタック
- React 18+ / Vite 6+
- Tailwind CSS 4+
- react-markdown / remark-gfm / remark-wiki-link
- JSZip / js-yaml
- CSS multi-column（ページネーション）
- GitHub Pages（ホスティング）

## テスト実行方法
手動テスト: `npm run dev` でローカルサーバー起動、docs/test.mkbを読み込み確認
ビルド確認: `npm run build && npm run preview`

## 規約
- コミットメッセージは5W1H形式（_STATUS.md参照）
- コード内コメントで各ブロックの意図（何を・なぜ）を記述する
- 仕様書に記載のない判断が必要な場合は作業を停止し報告する
- 仕様書に記載のないファイルを新規作成しない
- 仕様書: docs/spec-phase1.md
- 要件定義: docs/requirements-v2.md
