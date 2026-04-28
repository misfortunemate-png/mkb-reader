# プロダクトA ビューア 実装仕様書（Phase 2: §5〜§9 + §4修正）

作成日: 2026-04-28
PM: クリーデ
承認済み要件定義: product-a-requirements-v2.md (v2.1)
前提: Phase 1（§1〜§4）実装済み、検証デプロイ完了、ページネーション合格

---

## 1. 概要

- 何を作るか: ビューアを「日常的に使えるツール」にするための機能群
- なぜ作るか: PWA化・オフライン対応・ファイル保存で実用性を確保し、フォント・テーマ・カスタマイズで読書体験の質を上げる
- 誰が使うか: ショウゴさん（Pixel 10 Chrome）

**このフェーズのゴール:** Pixel 10のホーム画面からアプリとして起動し、保存済みのファイルをオフラインで好みの表示設定で読める状態。

## 2. 実装順序

| 順序 | セクション | 理由 |
|---|---|---|
| 1 | §4修正 | 画像表示バグの修正（検証で発覚） |
| 2 | §9 PWA + オフライン | 実用の土台。これがないと毎回ファイルを開き直す |
| 3 | §8 本棚（仮実装） | §9のIndexedDBと組み合わせてオフライン読書を成立させる |
| 4 | §5 フォント選択 | 読書体験の質 |
| 5 | §6 テーマ切替 | 読書体験の質 |
| 6 | §7 表示カスタマイズ | 読書体験の質（最も設定項目が多い） |

## 3. ファイル構成（追加・変更分）

```
src/
├── components/
│   ├── FileLoader.jsx          # 変更: 本棚画面との統合
│   ├── MarkdownRenderer.jsx    # 変更: ---表示方式対応
│   ├── Bookshelf.jsx           # 新規 §8: 本棚UI（仮実装・差替前提）
│   ├── SettingsPanel.jsx       # 新規 §5§6§7: 設定パネル統合UI
│   └── Paginator.jsx           # 変更: スワイプ方向設定対応
├── hooks/
│   ├── useBookshelf.js         # 新規 §8: IndexedDB CRUD（安定IF）
│   ├── useSettings.js          # 新規 §5§6§7: 設定値の一元管理
│   └── usePagination.js        # 変更: スワイプ方向対応
├── styles/
│   └── reader.css              # 変更: テーマCSS変数追加
└── utils/
    └── mkbParser.js            # 変更: §4画像パス修正
```

## 4. 機能仕様

### §4修正: 画像表示バグ

**現象:** Pixel 10実機でmkb内のassets画像が表示されない（altテキストのみ表示）

**原因調査方針:**
- mkbParser.jsのassets→Blob URL変換が正しく動作しているか
- MarkdownRenderer.jsxのカスタムimgコンポーネントがBlob URLを受け取れているか
- build-test-mkb.mjsで生成されるtest.mkbに実際の画像バイナリが含まれているか（プレースホルダが空の可能性）

**対応:** 原因を特定し修正する。テスト用画像は実際のPNG画像（小さいもの）に差し替える。

### §9: PWA + オフライン対応

**何を:** アプリをPWAとしてインストール可能にし、オフラインで起動・閲覧できるようにする

**どのように:**

vite-plugin-pwa の設定:
```javascript
// vite.config.js に追加
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'mkb-reader',
    short_name: 'mkb-reader',
    description: 'MarkBook & Markdown ビューア',
    theme_color: '#faf8f5',
    background_color: '#faf8f5',
    display: 'standalone',
    orientation: 'portrait',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    runtimeCaching: [
      {
        // Google Fontsのキャッシュ
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts-css' }
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts-woff2' }
      }
    ]
  }
})
```

アイコン:
- icon-192.png, icon-512.png を public/ に配置
- 仮アイコン（シンプルな本のシルエット）で可。将来差替

オフライン対応の範囲:
- アプリシェル（HTML/JS/CSS）: Service Workerでキャッシュ → オフラインで起動可能
- Google Fonts: runtimeCachingでキャッシュ → 一度読み込めばオフラインで使用可能
- 保存済みファイル: §8のIndexedDBに格納 → オフラインで閲覧可能
- 新規ファイルの読み込み: ファイルピッカーは端末内ファイルならオフラインでも動作

**制約:**
- Service Workerの更新通知UIは実装しない（autoUpdateに任せる）
- アプリアイコンは仮。将来差替前提

### §8: 本棚（仮実装）

**何を:** 開いたファイルをIndexedDBに保存し、一覧から再度開けるようにする

**設計原則:**
- **仮実装である。** 将来、表紙画像・編集機能・特別感のあるUIに全面差替する前提
- **疎結合。** ビューア本体（§1〜§4）との接点は「ファイルのバイナリを渡す/受け取る」のみ
- **useBookshelf.jsのインターフェースだけ安定させる。** Bookshelf.jsxは丸ごと差し替えてよい

useBookshelf.js（安定インターフェース）:
```typescript
type BookEntry = {
  id: string;           // crypto.randomUUID()
  title: string;        // markbook.yamlのtitle、なければファイル名
  author: string;       // markbook.yamlのauthor、なければ空文字
  fileType: 'mkb' | 'md' | 'txt';
  fileData: ArrayBuffer; // 元ファイルのバイナリ（mkbならZIPごと、mdならテキスト）
  addedAt: number;      // Date.now()
  lastOpenedAt: number; // Date.now()
};

// インターフェース
saveBook(entry: BookEntry): Promise<void>
getBook(id: string): Promise<BookEntry | null>
getAllBooks(): Promise<BookEntry[]>  // lastOpenedAt降順
deleteBook(id: string): Promise<void>
updateLastOpened(id: string): Promise<void>
```

IndexedDB設計:
- DB名: `mkb-reader`
- ストア名: `books`
- キー: `id`
- インデックス: `lastOpenedAt`（降順ソート用）

Bookshelf.jsx（仮実装・差替前提）:
- 画面構成: ファイル選択ボタン + 保存済みファイルのリスト
- リスト項目: タイトル / 著者（あれば）/ 追加日
- タップ → ファイルを開く（useMkbLoaderに渡す）
- 左スワイプ → 削除確認 → 削除
- 装飾なし。Tailwindのユーティリティクラスのみで最小限のスタイリング

ファイル保存のフロー:
1. ユーザーがファイルを選択して開く
2. ビューア画面のヘッダーに「本棚に保存」ボタン（ブックマークアイコン）を表示
3. タップ → useBookshelf.saveBook() で保存
4. 既に保存済みのファイル（同名チェック）なら「上書きしますか？」確認
5. 本棚画面に戻ると一覧に追加されている

アプリ起動時のフロー:
1. 本棚画面を表示（保存済みファイルがあればリスト、なければウェルカム）
2. ファイル選択ボタンは本棚画面の上部に常設
3. リストからタップ → ビューア画面へ遷移
4. ビューア画面からの戻り → 本棚画面

**制約:**
- 本棚UIのスタイリングに凝らない。将来全面差替するため
- 検索・ソート・フィルタは実装しない
- 表紙画像は実装しない
- タグ・カテゴリは実装しない

### §5: 日本語フォント選択

**何を:** 3種の明朝体から選択できるようにする

**どのように:**

フォント一覧:
| フォント名 | 特徴 | Google Fonts読み込み |
|---|---|---|
| Noto Serif JP | 標準的な明朝体、可読性高い | `Noto+Serif+JP:wght@400;700` |
| Shippori Mincho | 文学的、柔らかい印象 | `Shippori+Mincho:wght@400;700` |
| Zen Old Mincho | 古典的、レトロな印象 | `Zen+Old+Mincho:wght@400;700` |

遅延ロード方式:
- 選択されたフォントのみ `<link rel="stylesheet">` を動的にheadに挿入
- 未選択フォントのlinkは削除（不要なダウンロードを防ぐ）
- `font-display: swap` はGoogle Fonts URLにパラメータ `&display=swap` で指定

欧文ペアリング:
- 和文フォントが適用される前に欧文が描画されるため、セリフ系欧文をfont-family先頭に置く
- 候補: `'Cormorant Garamond', 'Noto Serif JP', serif` 等
- Phase 2ではCormorant Garamondを仮採用。変更はCSS変数一箇所で済む

設定UI: SettingsPanel.jsx内に3つのラジオボタン。選択時にプレビューテキスト（「あいうえお ABCabc 0123」）がそのフォントで表示される。

### §6: テーマ切替

**何を:** ライト / ダーク / セピアの3テーマを切り替える

**どのように:**

CSS変数定義（reader.css）:
```css
/* ライト（デフォルト） */
:root, [data-theme="light"] {
  --color-bg: #faf8f5;
  --color-text: #1a1a1a;
  --color-text-secondary: #555;
  --color-accent: #8b4513;
  --color-border: #e0d8d0;
  --color-code-bg: #f0ece6;
  --color-blockquote-border: #c4b5a0;
}

/* ダーク */
[data-theme="dark"] {
  --color-bg: #1a1a1a;
  --color-text: #d4d0c8;
  --color-text-secondary: #999;
  --color-accent: #c4956a;
  --color-border: #333;
  --color-code-bg: #252525;
  --color-blockquote-border: #555;
}

/* セピア */
[data-theme="sepia"] {
  --color-bg: #f4ecd8;
  --color-text: #3b2e1a;
  --color-text-secondary: #6b5c47;
  --color-accent: #8b6914;
  --color-border: #d4c9a8;
  --color-code-bg: #e8dfc6;
  --color-blockquote-border: #b8a878;
}
```

切替方式: `document.documentElement.setAttribute('data-theme', theme)` で即時反映。

設定UI: SettingsPanel.jsx内に3つの色見本ボタン（丸い色のプレビュー）。

### §7: 表示カスタマイズ

**何を:** 読書体験に関わる表示設定を細かく制御できるようにする

**設計原則:** 「正解がないから設定で制御する」。プリセットは初期値のショートカットとして残しつつ、個別値を自由に調整できる。

**設定項目:**

| 設定 | 操作UI | 範囲 | デフォルト | CSS変数 |
|---|---|---|---|---|
| フォントサイズ | スライダー | 14px〜28px（1px刻み） | 18px | --font-size |
| 行間 | スライダー | 1.4〜2.4（0.1刻み） | 1.9 | --line-height |
| 左右余白 | スライダー | 0.5rem〜3rem（0.25rem刻み） | 1.5rem | --content-padding |
| スワイプ方向 | トグル | 左右 / 上下 | 左右 | JS制御 |
| `---`表示方式 | 選択 | 4種（下記） | 改ページ | CSS + JS |
| プリセット | ボタン3つ | ゆったり / 標準 / コンパクト | 標準 | 上記3値を一括設定 |

プリセット値:
```
ゆったり:  font-size: 20px, line-height: 2.2, padding: 2.5rem
標準:      font-size: 18px, line-height: 1.9, padding: 1.5rem
コンパクト: font-size: 15px, line-height: 1.6, padding: 0.75rem
```
プリセット適用後にスライダーで微調整可能。微調整した時点でプリセット選択状態は解除される。

`---`（水平線 / thematic break）表示方式:

| 方式 | 表示 | 実装 |
|---|---|---|
| 改ページ | ページネーション時にページ境界を強制 | `hr { break-before: column; visibility: hidden; }` |
| 区切り線 | 従来の水平線 | `hr { border-top: 1px solid var(--color-border); }` |
| 余白 | 線なしで広めの空白 | `hr { border: none; margin: 3em 0; }` |
| 装飾 | 中央に `＊ ＊ ＊` | `hr::after { content: '＊　＊　＊'; }` + border: none |

スクロールモード時の改ページ方式: 改ページが選択されていてもスクロールモードではCSS columnがないため`break-before`は効かない。スクロールモードでは自動的に「余白」方式にフォールバックする。

スワイプ方向:
- 左右（デフォルト）: 左スワイプ → 次ページ、右スワイプ → 前ページ
- 上下: 上スワイプ → 次ページ、下スワイプ → 前ページ
- usePagination.jsのtouchイベント処理で方向を分岐

**SettingsPanel.jsx 全体設計:**

画面右上のギアアイコンをタップ → 画面下部からスライドアップするボトムシート形式。
セクション構成:
1. プリセット（ゆったり / 標準 / コンパクト）— ボタン3つ横並び
2. フォント — ラジオボタン3つ + プレビュー
3. テーマ — 色見本ボタン3つ
4. フォントサイズ — スライダー + 現在値表示
5. 行間 — スライダー + 現在値表示
6. 左右余白 — スライダー + 現在値表示
7. スワイプ方向 — トグル
8. `---`の表示 — 4択ラジオ

useSettings.js:
- 全設定値をuseStateで管理
- 変更時にlocalStorageに即座に保存
- 初回起動時にlocalStorageから復元（なければデフォルト値）
- CSS変数への反映は`document.documentElement.style.setProperty()`で行う

**制約:**
- ボトムシートのアニメーションはCSS transitionで実装（ライブラリ不使用）
- 設定パネル表示中もビューア本文が見える（背景として機能し、設定変更のプレビューになる）

## 5. テスト方針

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| §4修正: 画像表示 | Pixel 10実機 | mkb内画像が正しく表示される |
| §9: PWA | Pixel 10実機 | ホーム画面に追加でき、オフラインで起動する |
| §9: オフライン閲覧 | Pixel 10機内モード | 保存済みファイルが読める |
| §8: ファイル保存 | Pixel 10実機 | ファイルを保存し、アプリ再起動後に一覧に表示される |
| §8: ファイル削除 | Pixel 10実機 | スワイプ削除が動作する |
| §5: フォント切替 | Pixel 10実機 | 3フォントの切替が即座に反映される |
| §6: テーマ切替 | Pixel 10実機 | 3テーマの切替が即座に反映される |
| §7: スライダー | Pixel 10実機 | フォントサイズ・行間・余白の変更が即座に反映される |
| §7: ---表示方式 | Pixel 10実機 | 4方式の切替が正しく動作する（特に改ページ） |
| §7: スワイプ方向 | Pixel 10実機 | 上下/左右の切替が動作する |
| §7: 設定永続化 | Pixel 10実機 | 全設定がアプリ再起動後も維持される |
| Google Fontsキャッシュ | Pixel 10機内モード | 一度読み込んだフォントがオフラインで使用可能 |

## 6. 画面遷移

```
┌──────────┐    タップ     ┌──────────┐
│          │ ──────────→ │          │
│  本棚    │              │ ビューア  │
│(Bookshelf)│ ←────────── │(Reader)  │
│          │    戻る      │          │
└──────────┘              └──────────┘
     │                         │
     │ ファイル選択              │ ギアアイコン
     ↓                         ↓
  ファイルピッカー          SettingsPanel
  (OS標準)                (ボトムシート)
                               │
                          「本棚に保存」
                          (ヘッダー内)
```

本棚画面（Bookshelf.jsx）:
```
┌─────────────────────────────────────┐
│ mkb-reader              [＋ 開く]   │  ← ヘッダー（ファイル選択ボタン）
├─────────────────────────────────────┤
│                                     │
│  創作基盤構想書                      │
│  2026-04-28                         │
│ ─────────────────────────────────── │
│  帝国東方辺境領ヴァルト守備隊戦記     │
│  ショウゴ — 2026-04-27              │
│ ─────────────────────────────────── │
│  残響の島                           │
│  2026-04-26                         │
│                                     │
└─────────────────────────────────────┘
```

ビューア画面（SettingsPanel展開時）:
```
┌─────────────────────────────────────┐
│ [≡]  タイトル         [🔖] [⚙]    │  ← 🔖本棚保存 ⚙設定
├─────────────────────────────────────┤
│                                     │
│          Markdown本文               │  ← 設定変更がリアルタイム反映
│      （背景として薄暗く表示）         │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ プリセット: [ゆったり][標準][コン]│ │
│ │                                 │ │
│ │ フォント: ○Noto ○Shippori ○Zen │ │
│ │ プレビュー: あいうえお ABCabc    │ │
│ │                                 │ │
│ │ テーマ: (●)(○)(○)              │ │
│ │                                 │ │
│ │ 文字サイズ: ──●────── 18px      │ │
│ │ 行間:       ────●──── 1.9       │ │
│ │ 左右余白:   ──●────── 1.5rem    │ │
│ │                                 │ │
│ │ スワイプ: [左右 | 上下]          │ │
│ │ ---の表示: ○改頁 ○線 ○余白 ○装飾│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1 | 2026-04-28 | 初版作成。§4修正 + §5〜§9 |
