# プロダクトA ビューア 実装仕様書（Phase 1: §1〜§4）

作成日: 2026-04-27
PM: クリーデ
承認済み要件定義: product-a-requirements-v2.md (v2.1)

---

## 1. 概要

- 何を作るか: MarkBook（.mkb）および単体Markdownを美しく読むPWAビューアの骨格
- なぜ作るか: §1〜§4を実装し、ページネーションの実機検証を行うため
- 誰が使うか: ショウゴさん（Pixel 10 Chrome）

**このフェーズのゴール:** mkbファイルを開き、ページ送りで日本語テキストを読める状態をGitHub Pagesにデプロイする。フォント・テーマの選択UIは含めない（デフォルト設定で検証する）。

## 2. ファイル構成

```
mkb-reader/
├── CLAUDE.md
├── _STATUS.md
├── docs/
│   ├── requirements-v2.md          # 要件定義書（参照用）
│   ├── spec-phase1.md              # この仕様書
│   └── instructions-phase1.md      # 作業指示書
├── public/
│   └── favicon.svg                 # 仮アイコン
├── src/
│   ├── main.jsx                    # エントリポイント
│   ├── App.jsx                     # ルートコンポーネント
│   ├── components/
│   │   ├── FileLoader.jsx          # §1: ファイル選択UI
│   │   ├── MarkdownRenderer.jsx    # §2: Markdown描画
│   │   ├── ChapterNav.jsx          # §3: チャプターナビゲーション
│   │   └── Paginator.jsx           # §4: ページネーションコンテナ
│   ├── hooks/
│   │   ├── useMkbLoader.js         # §1: mkb展開・ファイル解析ロジック
│   │   └── usePagination.js        # §4: ページ計算・ナビゲーションロジック
│   ├── styles/
│   │   └── reader.css              # 読書画面のスタイル（テーマCSS変数含む）
│   └── utils/
│       └── mkbParser.js            # §1: markbook.yaml解析、チャプター構造構築
├── index.html
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## 3. 技術選定

| 技術 | バージョン | 理由 |
|---|---|---|
| React | 18+ | 既存アプリと統一 |
| Vite | 6+ | 既存アプリと統一 |
| Tailwind CSS | 4+ | 既存アプリと統一。レイアウト・ユーティリティ用 |
| react-markdown | 最新 | MDパースの定番。remarkPlugins/rehypePluginsで拡張可能 |
| remark-gfm | 最新 | GFM拡張（テーブル、タスクリスト、取り消し線） |
| remark-wiki-link | 最新 | wikilinks（`[[ページ名]]`）のパース |
| JSZip | 最新 | ブラウザ上でのZIP展開 |
| js-yaml | 最新 | markbook.yamlの解析 |

**このフェーズで導入しないもの:**
- vite-plugin-pwa（§9）
- Google Fonts読み込み（§5）— 検証時はシステムフォント + 1フォントのみ

**検証用の暫定フォント:**
Noto Serif JPのみGoogle Fontsから読み込む。フォント選択UIは作らず、CSSで直接指定。検証デプロイの目的はページネーションの評価であるが、日本語明朝体での読書感を確認するためにフォントだけは入れる。

## 4. 機能仕様

### §1: MarkBookファイルの読み込みと展開

**何を:** .mkb / .md / .txtファイルをブラウザ上で読み込み、内部データ構造に変換する

**どのように:**

ファイル選択UI（FileLoader.jsx）:
- `<input type="file" accept=".mkb,.md,.txt">` をボタンとして表示
- ファイル未選択時はこのボタンのみの画面（ウェルカム画面）
- 拡張子で処理を分岐:
  - `.mkb` → JSZipで展開 → mkbParser.jsで構造化
  - `.md` → そのままテキスト読み取り → 単一チャプターとして構造化
  - `.txt` → テキスト読み取り → Markdownパースなしで表示

mkb展開ロジック（useMkbLoader.js）:
- JSZip.loadAsync()でZIPを展開
- index.mdの存在を確認（なければエラー表示）
- pages/ディレクトリ内の.mdファイルを列挙
- assets/ディレクトリ内のファイルをBlob URLに変換し、MD内の相対パス参照を置換
- markbook.yamlがあればjs-yamlでパース

内部データ構造:
```typescript
type MkbData = {
  metadata: {
    title?: string;
    author?: string;
    // markbook.yamlから取得。なければファイル名をtitleに
  };
  chapters: Chapter[];
  assets: Map<string, string>; // 相対パス → Blob URL
};

type Chapter = {
  id: string;       // ファイル名ベース
  title: string;    // MDの最初のh1、なければファイル名
  content: string;  // MDテキスト
  order: number;    // markbook.yamlの順序、なければアルファベット順
};
```

**制約:**
- index.mdは必ずchapters[0]に配置する
- markbook.yamlにpages順序の記載があればそれに従う。なければファイル名のアルファベット順
- assets内のファイルはMD内の相対パス（`assets/image.png` または `../assets/image.png`）で参照される前提

### §2: Markdownパースと描画

**何を:** チャプターのMDテキストを美しいHTMLとして描画する

**どのように:**

MarkdownRenderer.jsx:
- react-markdownにMDテキストを渡す
- プラグイン: remark-gfm, remark-wiki-link
- rehypeプラグインは必要に応じて追加（初期はなし）
- 画像のsrcをassetsのBlob URLに変換するカスタムコンポーネントを渡す

wikilinks処理:
- `[[チャプター名]]` をクリック可能なリンクとして描画
- クリック時にChapterNavのチャプター切替を呼び出す
- 存在しないチャプターへのリンクはスタイルで区別する（グレーアウト）

スタイリング（reader.css）:
- Noto Serif JPを本文フォントとして適用
- 見出し（h1〜h6）の階層的なサイズ・ウェイト設定
- 段落間の余白、行間（line-height: 1.8〜2.0）
- 引用ブロック、コードブロック、テーブルのスタイリング
- 画像のmax-width: 100%、中央寄せ
- CSS変数でテーマ切替に備える（このフェーズではライトテーマのみ実装）

CSS変数（reader.css内で定義）:
```css
:root {
  --color-bg: #faf8f5;
  --color-text: #1a1a1a;
  --color-text-secondary: #555;
  --color-accent: #8b4513;
  --color-border: #e0d8d0;
  --color-code-bg: #f0ece6;
  --color-blockquote-border: #c4b5a0;
  --font-body: 'Noto Serif JP', serif;
  --font-code: 'Courier New', monospace;
  --line-height: 1.9;
  --content-padding: 1.5rem;
}
```

**制約:**
- react-markdownのカスタムコンポーネントでHTML出力を制御する（dangerouslySetInnerHTMLは使わない）
- XSS対策としてrehype-sanitizeの導入を検討するが、自分専用ツールのため初期は省略可

### §3: チャプターナビゲーション

**何を:** mkb内の複数チャプターを一覧表示し、切り替える

**どのように:**

ChapterNav.jsx:
- モバイル: 画面上部にハンバーガーボタン → タップでドロワー（左からスライド）
- デスクトップ: 左サイドバーとして常時表示（幅240px、トグル可能）
- チャプターリスト: metadata.titleを上部に表示、chapters[]をリスト表示
- 現在のチャプターをハイライト（背景色変更）
- チャプター選択時: 現在のチャプターを差し替え、ページネーションをリセット

レスポンシブ切替:
- ブレークポイント: 768px（Tailwindのmd:）
- 768px未満: ドロワーモード（オーバーレイ背景つき）
- 768px以上: サイドバーモード

単一チャプター時の挙動:
- 単体.mdファイルの場合、チャプターは1つだけ
- この場合、ナビゲーションUIを非表示にする（ハンバーガーも出さない）

**制約:**
- ドロワーのアニメーションはCSS transitionで実装（ライブラリ不使用）
- ドロワーオープン時にbodyスクロールをロックする

### §4: ページネーション

**何を:** Markdownの描画結果をビューポート単位のページに分割し、タップ/スワイプで送る

**どのように:**

アーキテクチャ:
Paginator.jsxがMarkdownRenderer.jsxをラップする。MarkdownRenderer.jsxは通常通りHTMLを生成し、Paginator.jsxがCSS multi-columnでページ分割・ナビゲーションを担う。

Paginator.jsx:
- 描画領域に以下のCSSを適用:
  ```css
  .paginator {
    column-width: 100vw;    /* モバイル。デスクトップではサイドバー幅を引く */
    column-gap: 0;
    column-fill: auto;
    height: calc(100vh - [ヘッダー高さ]);
    overflow: hidden;
  }
  ```
- column-widthとheightからページ数を算出（コンテナのscrollWidthをviewport幅で除算）
- 現在のページに応じてtranslateXでスクロール位置を制御

usePagination.js:
- 状態: currentPage, totalPages
- ページ数計算: コンテナのscrollWidth / viewport幅（小数切り上げ）
- ページ送り: translateXを`-currentPage * viewportWidth`に設定
- リサイズ対応: ResizeObserverでコンテナサイズ変更を監視し、ページ数を再計算

操作:
- タップ: 画面右半分タップ → 次ページ、画面左半分タップ → 前ページ
- スワイプ: touchstart/touchend間のdeltaXで判定（閾値50px）
- キーボード: 左右矢印キーでページ送り（デスクトップ）
- ページインジケーター: 画面下部に「3 / 12」形式で表示（非操作時はフェードアウト）

スクロールモードへのフォールバック:
- 設定から切替可能にする（このフェーズでは画面上の小さなトグルボタン）
- スクロールモード時: column関連CSSを無効化し、通常の縦スクロールに戻す
- 選択状態はlocalStorageに保存

**制約:**
- CSS multi-columnの禁則処理はブラウザ任せ。v0.1では追加制御しない
- 見出しがページ末尾に孤立する問題は `break-after: avoid` で緩和を試みるが、完全な解決はv0.2
- 画像がページ境界をまたぐ場合の処理は `break-inside: avoid` で対応を試みる

**検証デプロイ時の確認項目:**
1. ページネーションの読書体験は「鑑賞」の名に値するか
2. 日本語テキストの禁則処理・見出し切れ等の不具合の程度
3. スワイプ/タップの操作感（誤動作、遅延）
4. 長文（1万字以上）でのページ計算の正確さ
5. 画像を含むMDでのレイアウト崩れ

## 5. テスト方針

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| mkb展開（§1） | 手動。テスト用mkbファイルを用意 | index.md + 3チャプター + 画像1枚のmkbが正常に読み込まれる |
| 単体md読み込み（§1） | 手動 | 日本語Markdownファイルが正常に描画される |
| MD描画（§2） | 手動。見出し・リスト・引用・コード・テーブル・画像を含むMD | 全要素が適切にスタイリングされる |
| wikilinks（§2） | 手動。`[[chapter-two]]`を含むMD | クリックでチャプター切替が動作する |
| チャプターナビ（§3） | Pixel 10実機 | ドロワーの開閉、チャプター切替が快適に動作する |
| ページネーション（§4） | Pixel 10実機 | タップ・スワイプでページ送りができる |
| スクロール切替（§4） | Pixel 10実機 | トグルでページネーション/スクロールを切替できる |
| GitHub Pages | デプロイ後 | URLアクセスでアプリが表示される |

### テスト用mkbファイル

検証用に以下の構成のmkbファイルを1つ作成する（docs/test.mkb）:
- index.md: プロジェクト概要（500字程度、日本語、見出し3階層、引用、リスト含む）
- pages/chapter-one.md: 長文テキスト（3000字以上、日本語小説風）
- pages/chapter-two.md: 技術文書風（コードブロック、テーブル含む）
- pages/chapter-three.md: 画像参照を含む文書
- assets/test-image.png: テスト用画像1枚
- markbook.yaml: title, author, pages順序

## 6. 画面構成

```
┌─────────────────────────────────────┐
│ [≡]  タイトル               [⇄ 切替] │  ← ヘッダー（48px）
├─────────────────────────────────────┤
│                                     │
│                                     │
│          Markdown本文               │  ← ページネーション領域
│        （CSS multi-column）          │     height: calc(100vh - 48px - 40px)
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│           3 / 12                    │  ← ページインジケーター（40px）
└─────────────────────────────────────┘

[≡] → チャプタードロワー（モバイル）
[⇄ 切替] → ページネーション/スクロール切替
タップ領域: 右半分 → 次ページ、左半分 → 前ページ
```

ウェルカム画面（ファイル未選択時）:
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│         [ファイルを選択]              │  ← ファイル選択ボタン
│                                     │
│      .mkb / .md / .txt              │  ← 対応形式の表示
│                                     │
└─────────────────────────────────────┘
```

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1 | 2026-04-27 | 初版作成。§1〜§4の検証デプロイスコープ |
