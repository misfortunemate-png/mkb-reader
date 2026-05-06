# mkb-reader

MarkBook（.mkb）およびMarkdownファイルを美しく読むためのPWAビューア。
**開発完了・運用フェーズ。**

## 状態確認
作業開始前に `_STATUS.md` を読むこと。

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
- バグ修正・小改善は随時対応可。大規模な機能追加はPMの仕様書が必要

## 仕様書
- docs/spec-phase5.md（§31〜§34）
- docs/spec-phase4.md（§27〜§30）
- docs/spec-phase3c-v2.md（§10〜§26）
- docs/spec-phase1.md（§1〜§4）
- docs/requirements-v2.md（要件定義）
