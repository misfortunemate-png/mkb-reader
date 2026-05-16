# mkb-reader

MarkBook（.mkb）・Markdown・PDF などを美しく読むための PWA ビューア。

> **対象ユーザー:** Pixel 10 / Chrome で日常的に読書する個人向け

---

## 対応フォーマット

| 形式 | 拡張子 |
|---|---|
| MarkBook | `.mkb` |
| Markdown | `.md` `.markdown` |
| テキスト | `.txt`（UTF-8 / Shift_JIS） |
| HTML | `.html` `.htm` |
| JSON | `.json` |
| 画像アーカイブ | `.cbz` `.zip` |
| 単体画像 | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.avif` |
| PDF | `.pdf` |

---

## 主な機能

### 読む
- **ページモード** — CSS multi-column による見開き風ページネーション
- **スクロールモード** — 縦スクロール連続読み
- **縦書きモード** — vertical-rl / 縦中横対応
- **次/前チャプター自動送り** — ページ末尾・スクロール末尾でチャプターを自動送り

### 本棚
- IndexedDB に保存してオフラインで再度開ける（PWA）
- タグ・ソート・リネーム・表紙画像設定
- **一括登録** — 複数ファイルまたはフォルダをまとめて取り込み（フォルダ名を自動タグ化）
- **PDF 保存** — ビューアから直接本棚に保存

### テキスト変換
- **txt → Markdown 変換ダイアログ** — 読み込み時に変換前/後をプレビューして選択
- UTF-8 / Shift_JIS 自動判定（フォールバック付き）

### 編集・加工
- 読み替え（rewrite）: 語句の置換・ルビ付与
- 画像差し込み: 章の任意箇所に画像を挿入
- mkb エクスポート: 編集結果をファイルとして書き出し

### ライブラリ（層B）
- フォルダ/アイテムのツリー構造
- 複数ファイル結合・他ファイルからの画像切り出し
- カタログ表示 / リスト表示の切替（フォルダ単位で記憶）
- ライブラリ単位でのインポート / エクスポート（ZIP形式）

---

## 技術スタック

| 技術 | 用途 |
|---|---|
| React 18 + Vite 6 | UI フレームワーク / バンドラ |
| Tailwind CSS 4 | スタイリング |
| react-markdown + remark-gfm | Markdown 描画 |
| JSZip | mkb / cbz / ライブラリ ZIP の読み書き |
| js-yaml | mkb メタデータ解析 |
| CSS multi-column | ページネーション |
| IndexedDB | 本棚・ライブラリの永続化 |
| GitHub Pages | ホスティング（main push で自動デプロイ） |

---

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー（http://localhost:5173/mkb-reader/）
npm run build    # 本番ビルド
npm run preview  # ビルド後プレビュー
```

---

## ライセンス

個人利用・私的プロジェクト。
