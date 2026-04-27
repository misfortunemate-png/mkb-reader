# mkb-reader 作業指示書（Phase 1: §1〜§4）

作成日: 2026-04-27
PM: クリーデ
対応仕様書: docs/spec-phase1.md

---

## 作業範囲

- 何を: MarkBook（.mkb）/ Markdown / テキストファイルのビューアPWAの骨格を構築する
- なぜ: ページネーションの実機検証デプロイのため（仕様書 §1〜§4）
- どこで: 新規リポジトリ `mkb-reader`

## 参照ドキュメント

- 仕様書: docs/spec-phase1.md（全ての実装判断の根拠）
- _STATUS.md: 作業開始前に必ず読むこと
- CLAUDE.md: リポジトリの規約を確認すること
- 要件定義書: docs/requirements-v2.md（背景情報として参照）

## 作業手順

### Step 1: プロジェクト初期化

1. Vite + React + Tailwind CSSでプロジェクトを作成する
2. 以下のパッケージをインストールする:
   - react-markdown
   - remark-gfm
   - remark-wiki-link
   - jszip
   - js-yaml
3. docs/ディレクトリに仕様書・要件定義書を配置する
4. CLAUDE.md、_STATUS.mdを配置する
5. reader.css にCSS変数とベーススタイルを記述する
6. index.htmlの`<head>`にNoto Serif JPのGoogle Fonts `<link>` を追加する

### Step 2: §1 ファイル読み込み

1. FileLoader.jsx を実装する
   - ファイル選択ボタン（.mkb, .md, .txt対応）
   - ファイル未選択時のウェルカム画面
2. useMkbLoader.js を実装する
   - .mkb: JSZipで展開 → MkbData構造体に変換
   - .md: 単一チャプターとしてMkbData構造体に変換
   - .txt: Markdownパースなしフラグ付きでMkbData構造体に変換
3. mkbParser.js を実装する
   - markbook.yamlの解析
   - チャプター順序の決定
   - assets/のBlob URL変換

### Step 3: §2 Markdown描画

1. MarkdownRenderer.jsx を実装する
   - react-markdown + remark-gfm + remark-wiki-link
   - 画像srcのBlob URL変換（カスタムコンポーネント）
   - wikilinksのクリックハンドラ
2. reader.css にMarkdown要素のスタイリングを記述する
   - 仕様書§2のCSS変数定義に従う
   - 日本語テキストの読みやすさを重視（line-height: 1.9）

### Step 4: §3 チャプターナビゲーション

1. ChapterNav.jsx を実装する
   - モバイル（768px未満）: ハンバーガー → ドロワー
   - デスクトップ（768px以上）: 左サイドバー
   - チャプターリスト、現在チャプターのハイライト
   - 単一チャプター時はUI非表示
2. App.jsx でチャプター選択の状態管理を実装する

### Step 5: §4 ページネーション

1. Paginator.jsx を実装する
   - CSS multi-columnによるページ分割
   - translateXによるページ送り
2. usePagination.js を実装する
   - ページ数計算（scrollWidth / viewportWidth）
   - ResizeObserverによる再計算
3. タップ/スワイプ/キーボード操作を実装する
4. ページインジケーター（「3 / 12」表示）を実装する
5. スクロールモードへのフォールバックトグルを実装する
6. 表示モード設定のlocalStorage保存を実装する

### Step 6: テスト用mkbファイル作成

1. docs/test-mkb/ディレクトリにテスト用ファイルを作成する:
   - index.md（日本語500字、見出し3階層、引用、リスト）
   - pages/chapter-one.md（日本語3000字以上、小説風）
   - pages/chapter-two.md（コードブロック、テーブル含む技術文書）
   - pages/chapter-three.md（画像参照含む）
   - assets/test-image.png（プレースホルダ画像）
   - markbook.yaml
2. これらをZIP化してdocs/test.mkbとして配置する
   ※ ビルド時にZIP化するスクリプトを用意してもよい

### Step 7: GitHub Pages デプロイ設定

1. vite.config.jsにbase設定を追加する（リポジトリ名に合わせる）
2. GitHub Actions ワークフローファイルを作成する（.github/workflows/deploy.yml）
3. ビルド・デプロイが正常に動作することを確認する

## 禁止事項

- 仕様書に記載のない機能を追加しない
- 仕様書に記載のないファイルを新規作成しない（テスト用ファイルを除く）
- 仕様書の原本を改変しない
- フォント選択UI、テーマ切替UIは作らない（このフェーズのスコープ外）
- vite-plugin-pwaは導入しない（§9）
- 仕様外の設計判断が必要な場合は作業を停止し報告する

## 完了条件

1. ファイル選択から.mkbファイルを開き、index.mdが描画される
2. mkb内の複数チャプターがドロワーに表示され、切り替えできる
3. mkb内のassets/画像がMD内で正しく表示される
4. 単体.mdファイルを開き、同じ描画品質で表示される
5. ページネーションでページ送りができる（タップ/スワイプ/キーボード）
6. ページネーション/スクロールの切替トグルが動作する
7. GitHub Pagesにデプロイされ、Pixel 10 Chromeでアクセスできる
8. テスト用mkbファイルが同梱されている
9. _STATUS.mdが更新されている

## コミットメッセージ形式

各コミットは以下の形式で記録すること:

```
[Phase1] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §N への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。
特にページネーション（§4）のCSS multi-column周りは計算ロジックの意図を詳しく記述すること。
