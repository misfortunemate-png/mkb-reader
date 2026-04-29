# プロダクトA ビューア 実装仕様書（Phase 3c）

作成日: 2026-04-29
PM: クリーデ
PG: Claude Code（Opus 4.7）

---

## 0. プロジェクト概要（文脈ゼロの引き継ぎ用）

### mkb-reader とは

MarkBook（.mkb）およびMarkdownファイルを美しく読むためのPWAビューア。
GitHub Pages（静的配信）で公開し、Pixel 10のChromeから使う個人ツール。

MarkBookはCC0ライセンスのオープンフォーマット（提唱: Markant / Lakoy ApS, デンマーク）。
実体はZIPアーカイブで、中に `index.md` + `pages/` + `assets/` + `markbook.yaml` を持つ。
「LLMが1回のレスポンスで生成できる」ことを設計原則に据えた、人間にもAIにも扱いやすいフォーマット。

本プロダクトの差別化: 日本語タイポグラフィ（明朝体選択）、モバイルファースト（PWA）、
ページネーション（Markdownビューアとして世界初の試み）、そして「読み替え」機能。

リポジトリ: `https://github.com/misfortunemate-png/mkb-reader`
公開URL: `https://misfortunemate-png.github.io/mkb-reader/`

### 設計思想

**1. 徹底的に読み替えられるビューア**

このアプリは「ただのビューア」ではない。原本は一切変更しない。ファイルのバイナリはIndexedDBに保存されたまま、指一本触れない。しかし表示する時に、ユーザーは何でも読み替えることができる。話者名を変え、テキストを差し替え、行を隠し、画像を差し込む。これらは全て「どう読むか」の問題であり、原本への介入ではない。

技術的にはLightroomの非破壊RAW現像と同じモデル。原本 + サイドカー（localSettings）→ 表示。エクスポート時にのみ読み替えを適用した新しいファイルを生成する。

将来、別のプロダクト（プロダクトB）と連携した場合、そちらでは原本そのものを徹底的に編集できるようにする。ビューアとエディタの責務は完全に分離する。

**2. 設定UIの原則: プリセット優先**

「正解がないから設定で制御する」。ただし細かい数値を並べるのではなく、プリセットで選ばせる。

- 各設定セクションの主UIはプリセット選択（2〜4択のボタン）
- スライダー・数値入力は「詳細設定」として折りたたむ。普段は見えない
- 設定はグローバル（全ファイル共通のデフォルト、localStorage）とローカル（ファイルごとの上書き、IndexedDB）の二層
- ローカル設定が存在すればそちらを優先し、なければグローバルにフォールバック

**3. 原本不変の4原則**

- `BookEntry.fileData` は何があっても触らない
- 全変更は `localSettings.rewrite` に保存（サイドカー）
- `rewriteEngine.js` は純粋関数。副作用ゼロ、UIから完全分離
- 設定は二層: global（localStorage `mkb-reader.settings.v1`）+ local（IndexedDB `BookEntry.localSettings.display`）

### 実装済みフェーズの要約

| Phase | 範囲 | 状態 |
|---|---|---|
| Phase 1 | §1〜§4: mkb/md/txt読込、MD描画、チャプターナビ、CSS multi-columnページネーション | 合格 |
| Phase 2 | §5〜§9: 日本語フォント3種、テーマ3種、表示カスタマイズ、本棚（IndexedDB）、PWA | 合格 |
| Phase 3a | §10〜§13: HTML/JSON閲覧、画像ビューア+CBZ、画像リサイズ、ページネーション禁則改善、設定パネル改訂（プリセット優先・セクション分割）、グローバル/ローカル二層 | 合格 |
| Phase 3b | §14〜§16,§18: 読み替え設定、画像差し込み、MKBエクスポート、チャットログ変換（Claude.ai JSON→mkb） | 機能完了。モバイル表示問題が未解決 |

### 対応フォーマット一覧（Phase 3b完了時点）

| フォーマット | 表示モード | ページネーション |
|---|---|---|
| .mkb（MD含む） | Markdown | ○ |
| .md | Markdown | ○ |
| .txt | プレーンテキスト | ○ |
| .html | HTMLサンドボックス（iframe） | ×（スクロール固定） |
| .json | JSON整形表示（折りたたみ付き） | ×（スクロール固定） |
| .cbz | 画像ビューア（1ページ1画像） | 独自 |
| .zip（画像のみ） | 画像ビューア | 独自 |
| .zip（MD含む） | mkb扱い | ○ |
| .jpg/.png/.gif/.webp | 画像ビューア | 独自 |
| 画像複数選択 | 画像ビューア | 独自 |
| Claude.ai conversations.json | チャットログ変換→mkb | ○（変換後） |

---

## 1. 現在のファイル構成（全体）

```
mkb-reader/
├── CLAUDE.md                       # Claude Code規約（50行以下）
├── _STATUS.md                      # プロジェクトステータス（30行以下）
├── docs/
│   ├── requirements-v2.md          # 要件定義書
│   ├── spec-phase1.md              # Phase 1仕様書
│   ├── spec-phase2.md              # Phase 2仕様書
│   ├── spec-phase3a.md             # Phase 3a仕様書
│   ├── spec-phase3b.md             # Phase 3b仕様書（v1.2）
│   ├── instructions-phase3b.md     # Phase 3b作業指示書
│   ├── phase3-roadmap.md           # Phase 3全体ロードマップ
│   ├── test-mkb/                   # テスト用mkbソース
│   ├── test-files/                 # テスト用HTML/JSON/CBZ/画像
│   └── errorScreenshot/            # モバイル表示問題のスクリーンショット3枚
├── public/
│   ├── test.mkb                    # テスト用mkb（ビルド時自動生成）
│   ├── test-conversations.json     # テスト用Claude.aiエクスポートJSON（5会話）
│   ├── icon-192.png / icon-512.png # PWAアイコン（仮）
│   └── favicon.svg
├── src/
│   ├── main.jsx                    # エントリポイント
│   ├── App.jsx                     # ルート。本棚↔ビューア画面遷移、ViewerContent型分岐
│   ├── components/
│   │   ├── FileLoader.jsx          # §1: ファイル選択UI
│   │   ├── MarkdownRenderer.jsx    # §2: MD描画 + §14読み替え適用
│   │   ├── ChapterNav.jsx          # §3: チャプターナビ（モバイルドロワー/デスクトップサイドバー）
│   │   ├── Paginator.jsx           # §4: CSS multi-columnページネーション
│   │   ├── HtmlRenderer.jsx        # §10: HTML表示（iframe sandbox）
│   │   ├── JsonRenderer.jsx        # §10: JSON整形表示
│   │   ├── ImageViewer.jsx         # §11: 画像ビューア（1ページ1画像、ピンチズーム）
│   │   ├── Bookshelf.jsx           # §8: 本棚UI（仮実装・差替前提）
│   │   ├── SettingsPanel.jsx       # §5§6§7: 設定パネル（プリセット優先・セクション分割）
│   │   ├── ChatImporter.jsx        # §18: チャットログ変換UI
│   │   ├── RewritePanel.jsx        # §14: 読み替え設定パネル
│   │   ├── ImageInserter.jsx       # §15: 画像差し込みUI
│   │   └── ExportDialog.jsx        # §16: MKBエクスポートUI
│   ├── hooks/
│   │   ├── useMkbLoader.js         # §1: mkb展開・ファイル解析（全形式対応）
│   │   ├── usePagination.js        # §4: ページ計算・ナビゲーション
│   │   ├── useBookshelf.js         # §8: IndexedDB CRUD（安定IF）
│   │   ├── useSettings.js          # §5§6§7: グローバル/ローカル二層設定
│   │   ├── useImageResize.js       # §12: 画像リサイズ
│   │   ├── useRewrite.js           # §14: 読み替えルール管理
│   │   └── useExport.js            # §16: MKBエクスポート
│   ├── utils/
│   │   ├── mkbParser.js            # §1: markbook.yaml解析、チャプター構造構築
│   │   ├── chatConverter.js        # §18: Claude.ai JSON→MkbData変換
│   │   └── rewriteEngine.js        # §14: 読み替えエンジン（純粋関数）
│   └── styles/
│       └── reader.css              # テーマCSS変数、MD要素スタイル、禁則CSS
├── scripts/
│   └── build-test-mkb.mjs          # テスト用mkb自動生成
├── index.html                      # viewport meta: width=device-width, initial-scale=1.0
├── package.json
├── vite.config.js                  # base: '/mkb-reader/'、VitePWA設定
├── tailwind.config.js
└── .github/workflows/deploy.yml    # GitHub Pages デプロイ
```

### 技術スタック

| 技術 | 用途 |
|---|---|
| React 18+ / Vite 6+ | フレームワーク |
| Tailwind CSS 4+ | スタイリング |
| react-markdown + remark-gfm + remark-wiki-link + rehype-raw | MDパース・描画 |
| JSZip | mkb/cbz展開・エクスポート |
| js-yaml | markbook.yaml解析 |
| CSS multi-column | ページネーション |
| Google Fonts (Noto Serif JP / Shippori Mincho / Zen Old Mincho / Cormorant Garamond) | 日本語+欧文フォント |
| vite-plugin-pwa | PWA・Service Worker |
| IndexedDB | 本棚（BookEntry）・ローカル設定 |
| localStorage | グローバル設定（`mkb-reader.settings.v1`） |
| GitHub Pages + GitHub Actions | ホスティング・CI/CD |

### 主要データ構造

```typescript
// 本棚の各ファイル
type BookEntry = {
  id: string;
  title: string;
  author: string;
  fileType: 'mkb' | 'md' | 'txt' | 'html' | 'json' | 'images';
  fileData: ArrayBuffer;      // 原本バイナリ。絶対に変更しない
  addedAt: number;
  lastOpenedAt: number;
  localSettings?: LocalSettings;
};

// ファイルごとの設定（サイドカー）
type LocalSettings = {
  display?: {                 // 表示設定の上書き
    fontFamily?: string;
    theme?: string;
    fontSize?: number;
    lineHeight?: number;
    contentPadding?: number;
    imageDisplayMode?: string;
    hrStyle?: string;
    swipeDirection?: string;
    viewMode?: string;
  };
  rewrite?: RewriteRules;     // 読み替えルール
};

// 読み替えルール
type RewriteRules = {
  speakerNames?: { human?: string; assistant?: string };
  replacements?: { id: string; pattern: string; display: string; scope: string; enabled: boolean }[];
  hiddenRanges?: { id: string; chapterId: string; startLine: number; endLine: number; enabled: boolean }[];
  insertedAssets?: InsertedAsset[];
};

type InsertedAsset = {
  id: string;
  path: string;
  data: ArrayBuffer;
  mimeType: string;
  insertAfter: { chapterId: string; lineNumber: number };
  altText: string;
  enabled: boolean;
};

// ビューア画面のコンテンツ型分岐
type ViewerContent =
  | { type: 'mkb'; data: MkbData }
  | { type: 'html'; content: string }
  | { type: 'json'; content: string }
  | { type: 'images'; images: ImageEntry[] };
```

---

## 2. 既知の不具合: モバイルレイアウト異常表示

### 症状

Pixel 10実機で開くと、ページ全体がデスクトップ幅（≈1080 CSS px）でレンダリングされ、
端末の物理表示で38%程度に縮小されて見える。フォントもアイコンも極小化。
Phase 3b前半までは正常だった。

### 潰し済みの仮説（全て効果なし）

1. `@media (max-width: 480px)` でフォント/icon-btn縮小 — 対症療法、却下
2. viewport metaに `minimum-scale=1.0` 追加 — UX悪化、却下
3. `html, body { max-width: 100vw; overflow-x: hidden }` — 効果なし
4. 6コミットrollback（`e3e5262`まで） — 症状継続
5. PWAアンインストール→再インストール — 症状継続
6. localStorage クリア — 症状継続
7. IndexedDB クリア — 症状継続

### 裏取り済みの事実

- preview を 1080×2424 viewport にリサイズすると症状再現（CSSの問題ではない）
- 412 viewport では `scrollWidth = 412` ではみ出し要素ゼロ
- `index.html` の viewport meta は Phase 1 から変わっていない
- ビルド出力 `dist/index.html` も同じ viewport meta
- GitHub Pages の配信は正常
- Service Worker は `skipWaiting + clientsClaim` 設定済み

### 有力仮説

**(A) ChromeのサイトごとのZoom状態**が `misfortunemate-png.github.io` に対して38%で固定されている。
PWA storageではなくブラウザ側の状態なので、PWA再インストールでは消えない。

### 推奨デバッグ手順

**Step 1:** PCとPixel 10をUSB接続し、PC Chromeで `chrome://inspect/#devices` を開いてInspect。
Console で以下を実行:
```javascript
({
  innerWidth: window.innerWidth,                     // 期待: 412
  outerWidth: window.outerWidth,
  documentElementClientWidth: document.documentElement.clientWidth,
  visualViewportWidth: window.visualViewport?.width,
  visualViewportScale: window.visualViewport?.scale,  // 期待: 1
  devicePixelRatio: window.devicePixelRatio,          // Pixel 10: ~2.625
  zoom: getComputedStyle(document.documentElement).zoom,
})
```

**判定:**
- `innerWidth` が 1080 → viewport metaが無視されている → meta タグまたは Chrome設定の問題
- `visualViewportScale` が 0.38 → Chromeのサイト固有ズームが固定 → サイトデータ削除で解消

**Step 2（仮説A確認）:** Android 設定 → アプリ → Chrome → ストレージ → サイト別ストレージ から `misfortunemate-png.github.io` を削除。

**Step 3（切り分け）:** 別ブラウザ（Firefox）または別端末で同じURLを開く。正常表示ならPixel 10 Chrome固有の問題と確定。

**Step 4（端末設定確認）:** 設定 → ディスプレイ → 表示サイズ。「大」にしている場合、Chrome上でも基準が変わる。

---

## 3. Phase 3c スコープ

### 方針

Phase 3bで機能は一通り揃った。Phase 3cは「安定化と体験の仕上げ」に集中する。
技術的に困難なもの（縦書き§17、Google Drive連携§19）はPhase 4に送る。

### 実装順序

| 順序 | セクション | 内容 | リスク |
|---|---|---|---|
| 1 | §20 | モバイル表示問題の診断と修正 | 中（原因がアプリ外の可能性） |
| 2 | §21 | コンテキストメニュー（長押しメニュー）による読み替え操作 | 中 |
| 3 | §22 | チャットログ変換の品質改善 | 低 |
| 4 | §23 | 全体のUI磨き込み | 低 |

### Phase 4に送るもの

| セクション | 内容 | 送る理由 |
|---|---|---|
| §17 | 縦書き表示（writing-mode: vertical-rl） | CSS multi-columnとの組み合わせでブラウザ差異が大きい |
| §19 | Google Drive連携（OAuth + フォルダブラウズ） | OAuth認証 + GitHub Pages静的配信の制約 + PKCEフロー |
| — | 本棚の本格UI（表紙画像、編集性、特別感のあるデザイン） | 設計の検討が必要 |
| — | プロダクトB着手（ロアブック＋執筆環境） | ビューアの安定化が先 |

---

## 4. 機能仕様

### §20: モバイル表示問題の診断と修正

**何を:** Pixel 10実機でのレイアウト異常を診断し、修正する。

**アプローチ:**

これはコードの問題ではない可能性が高い。上記§2のデバッグ手順を実行し、原因を特定した上で対処する。

**PGの作業として想定されるケース:**

ケースA: ブラウザのサイト固有ズーム → ユーザー操作で解消。コード変更なし。
ケースB: Service Workerが古いバンドルをキャッシュ → SWのキャッシュバージョニングを見直す。
ケースC: CSSの何かが1080pxを要求している → DevToolsで特定して修正。
ケースD: 上記いずれでもない → リモートデバッグの結果を報告し、PMと判断。

**どのケースでも:**
- リモートデバッグで `innerWidth` / `visualViewport.scale` / `devicePixelRatio` を測定し、結果を`_STATUS.md`に記録する
- 別ブラウザ（Firefox）での表示確認結果も記録する

**制約:**
- 対症療法（フォントサイズを小さくする等）は行わない。根本原因を特定する
- viewport metaは変更しない（Phase 1から正しい値が入っている）

### §21: コンテキストメニュー（長押しメニュー）

**何を:** ビューア上でテキストを長押しすると、読み替え操作のコンテキストメニューが表示されるようにする。

**背景:**
現在の読み替え操作はRewritePanelを開いて行番号を入力する方式。これは機能するが、「読みながら操作する」体験ではない。長押しメニューにより、読書体験を中断せずに読み替え操作ができるようになる。

Phase 3cではこれを第一優先のUIとし、RewritePanelは補助的な一括管理画面として残す。

**操作フロー:**

1. ビューア上でテキストを長押し（700ms）
2. 長押し位置にコンテキストメニューが表示される:

```
┌────────────────────┐
│ この行を非表示にする │
│ テキストを読み替える │
│ ここに画像を差し込む │
│ ────────────────── │
│ 読み替え設定を開く   │
└────────────────────┘
```

3. 各メニュー項目の動作:

**「この行を非表示にする」:**
- 長押し位置の行番号を特定する
- hiddenRangesに1行の非表示ルールを追加する
- 即座にビューアが再描画され、その行が消える
- 取り消しはRewritePanelから

**「テキストを読み替える」:**
- 長押し位置の段落（または行）のテキストを取得する
- インラインの入力UIを表示する:
  ```
  ┌────────────────────────────┐
  │ 元: [選択されたテキスト    ] │
  │ →  [読み替え後のテキスト   ] │
  │          [適用] [キャンセル] │
  └────────────────────────────┘
  ```
- 「適用」でreplacementsにルールを追加し、即座に反映

**「ここに画像を差し込む」:**
- 長押し位置の行番号を特定する
- ファイルピッカーを開く（既存のImageInserter.jsxのロジックを再利用）
- 選択した画像をその行の後に差し込む

**「読み替え設定を開く」:**
- 既存のRewritePanelを開く

**行番号の特定方法:**

MarkdownRenderer.jsxが描画する各要素にdata属性を付与する:
```jsx
// react-markdownのカスタムコンポーネントで、各ブロック要素にsourcePositionを渡す
<p data-source-line={node.position?.start?.line}>...</p>
<h1 data-source-line={node.position?.start?.line}>...</h1>
```

長押しイベントのtarget要素から最寄りの`[data-source-line]`を探索し、行番号を取得する。

react-markdownの`remarkPlugins`にある`remark-gfm`等がAST上にpositionを保持している前提。保持していない場合は、MDテキストを行分割して要素内テキストとのマッチングで近似する。

**コンテキストメニューの実装（ContextMenu.jsx）:**

- position: fixedで長押し位置に表示
- 画面端にはみ出す場合は位置を調整
- メニュー外タップで閉じる
- アニメーション: opacity 0→1のフェードイン（100ms）
- ページネーションのタップ操作との競合: 長押し（700ms）はタップ（即時）と時間で区別できるため、競合しない
- スワイプとの競合: 長押し中に指が動いた場合（移動量10px超）はメニューを表示しない

**制約:**
- コンテキストメニューはページネーションモードとスクロールモードの両方で動作すること
- 画像ビューアモード（ImageViewer.jsx）ではコンテキストメニューを表示しない
- HTML/JSON表示モードでもコンテキストメニューを表示しない（MDのみ）
- コンテキストメニューのスタイリングはテーマのCSS変数に従う

### §22: チャットログ変換の品質改善

**何を:** Phase 3bで実装したチャットログ変換（§18）の品質を改善する。

**改善項目:**

1. **変換後のMDフォーマットの見直し**
   - 実際のClaude.aiエクスポートJSONで変換した結果を確認し、不自然な部分を修正
   - 長い会話（100メッセージ超）でのページネーションの動作確認
   - `<details>` 折りたたみ（拡張思考・ツール）がCSS multi-column内で正しく動作するか確認

2. **話者名スタイリングの改善**
   - 現在: `**human**` のBoldテキスト
   - 改善: 話者名の前後に視覚的な区切り（背景色、左ボーダー等）を追加
   - CSSクラスで実装（`speaker-human` / `speaker-assistant`）
   - 読み替え後の話者名にも同じスタイルが適用されること

3. **ChatImporter UIの改善**
   - 会話リストの検索/フィルタ（タイトルで絞り込み）
   - 会話のプレビュー（最初の数メッセージを表示）
   - 変換進捗の表示（大量会話の一括変換時）

**制約:**
- chatConverter.jsの変換ロジック（ツリー構造、content[]配列走査）は変更しない
- 既に保存済みのチャットログに影響しない（新規変換のみ）

### §23: 全体のUI磨き込み

**何を:** Phase 1〜3bで後回しにしたUI上の粗を修正する。

**改善項目:**

1. **ヘッダーのアイコン整理**
   - 現在: ≡（チャプター）、⚙（設定）、✏（読み替え）、🔖（保存）、↓（エクスポート）が並ぶ
   - モバイルでは幅が足りない可能性。オーバーフローメニュー（⋮）にまとめることを検討
   - 優先度: ≡ と ⚙ は常時表示、他はオーバーフローメニュー内

2. **本棚画面の軽微な改善**
   - ファイルタイプのアイコン表示（mkb/md/txt/json/cbz等）
   - 最終閲覧日の相対表示（「3時間前」「昨日」等）
   - 空の本棚時のウェルカムメッセージ改善

3. **設定パネルの動作確認**
   - Phase 3aで追加した「画像表示」プリセット（文章優先/バランス/画像優先）の実動作確認
   - 「この本 / すべての本」切替の動作確認
   - 全プリセットの値が正しく連動しているか確認

4. **エラーハンドリングの統一**
   - ファイル読み込みエラー、ZIP展開エラー、JSON解析エラー時のユーザー向けメッセージ統一
   - 現在はconsole.errorだけの箇所にトースト通知を追加

**制約:**
- 本棚の本格UI（表紙画像等）には手を付けない（Phase 4）
- 既存機能の動作を壊さない

---

## 5. テスト方針

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| §20: モバイル表示 | Pixel 10実機 + リモートデバッグ | innerWidth=412、正常なモバイルレイアウト |
| §20: 別ブラウザ | Pixel 10 Firefox | 正常に表示されること（切り分け用） |
| §21: 長押しメニュー表示 | Pixel 10実機 | テキスト長押しでメニューが表示される |
| §21: タップとの競合 | Pixel 10実機 | 通常タップでページ送り、長押しでメニュー。誤動作なし |
| §21: 行の非表示 | Pixel 10実機 | メニューから行非表示 → 即座に反映 → RewritePanelで確認・取消可 |
| §21: テキスト読み替え | Pixel 10実機 | メニューからインライン入力 → 適用 → 即座に反映 |
| §21: 画像差し込み | Pixel 10実機 | メニューからファイルピッカー → 画像表示 |
| §22: 話者名スタイル | Pixel 10実機 | 話者名が視覚的に区別できる |
| §22: 長い会話 | 手動 | 100メッセージ超の会話でページネーション正常 |
| §23: ヘッダー | Pixel 10実機 | アイコンが画面幅に収まる |
| §23: エラーメッセージ | 手動 | 不正なファイルを開いた時にトースト表示 |

---

## 6. 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1 | 2026-04-29 | 初版作成。Phase 3b完了を受けての安定化・体験仕上げフェーズ |
