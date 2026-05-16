# mkb-reader

MarkBook（.mkb）・Markdown・PDF などを読むための PWA ビューア。
**運用フェーズ（全§実装済み・実機検証合格）。**

## 作業前の確認
`_STATUS.md` を読み、現フェーズと実装済み機能を把握すること。

## 技術スタック
- React 18+ / Vite 6+
- Tailwind CSS 4+
- react-markdown / remark-gfm / remark-wiki-link
- JSZip / js-yaml
- CSS multi-column（ページネーション）
- GitHub Pages（ホスティング）

## 対応フォーマット
`.mkb` `.md` `.txt` `.html` `.json` `.cbz` `.zip` `.jpg/.png/.gif/.webp/.avif` `.pdf`

## テスト実行方法
```
npm run dev          # ローカル確認（public/test.mkb を読み込む）
npm run build        # 本番ビルド確認
npm run preview      # ビルド後のプレビュー
```

## 規約
- コミットメッセージは `[タグ] 概要` 形式（例: `[§32] PDF対応追加`）
- コード内コメントで各ブロックの意図（何を・なぜ）を記述する
- バグ修正・小改善は随時対応可
- 新機能追加は PM による仕様書発行が必要（勝手に実装しない）
- 仕様書に記載のないファイルを新規作成しない

## 仕様書（全フェーズ）
- `docs/spec-phase5-2.md`（Phase 5続き: §31〜§33 一括登録・PDF・txt変換）
- `docs/spec-phase5.md`（§31〜§34 自動送り・表紙・表示モード・ライブラリI/O）
- `docs/spec-phase4.md`（§27〜§30 本棚本格化・ライブラリ・縦書き）
- `docs/spec-phase3c-v2.md`（§10〜§26 HTML/JSON/画像・読み替え・UI磨き）
- `docs/spec-phase1.md`（§1〜§4 基本読込・MD描画・ページネーション）
- `docs/requirements-v2.md`（要件定義）
