# プロダクトA ビューア 実装仕様書（Phase 4）

作成日: 2026-04-30
PM: クリーデ
承認済み要件: 2026-04-29 会話内確定（依存関係ブランチ + 縦書きブランチ）

---

## 0. プロジェクト概要（文脈ゼロの引き継ぎ用）

### mkb-reader とは

MarkBook（.mkb）およびMarkdownファイルを美しく読むためのPWAビューア。
GitHub Pages（静的配信）で公開し、Pixel 10のChromeから使う個人ツール。

リポジトリ: `https://github.com/misfortunemate-png/mkb-reader`
公開URL: `https://misfortunemate-png.github.io/mkb-reader/`

### 設計思想（Phase 3c仕様書 §0 から継承）

1. **原本不変（サイドカーモデル）** — `BookEntry.fileData` は何があっても触らない。全変更は `localSettings` に保存。エクスポート時にのみ適用
2. **設定UIの原則: プリセット優先** — 2〜4択のボタンで選ばせ、詳細は折りたたむ。グローバル/ローカル二層
3. **rewriteEngine は純粋関数** — 副作用ゼロ、UIから完全分離

### 実装済みフェーズ

| Phase | 範囲 | 状態 |
|---|---|---|
| Phase 1 | §1〜§4: mkb/md/txt読込、MD描画、チャプターナビ、CSS multi-columnページネーション | 合格 |
| Phase 2 | §5〜§9: フォント・テーマ・カスタマイズ・本棚（IndexedDB）・PWA | 合格 |
| Phase 3a | §10〜§13: HTML/JSON/画像/CBZ・リサイズ・禁則・設定パネル改訂・global/local二層 | 合格 |
| Phase 3b | §14〜§16,§18: 読み替え・画像差し込み・MKBエクスポート・チャットログ変換 | 合格 |
| Phase 3c | §20〜§26: タップゾーン・欧文フォント・中断再開・コンテキストメニュー・チャットログ改善・UI磨き | 合格 |

### 技術スタック（Phase 3c時点、変更なし）

React 18+ / Vite 6+ / Tailwind CSS 4+ / react-markdown + remark-gfm + rehype-raw / JSZip / js-yaml / CSS multi-column / Google Fonts / vite-plugin-pwa / IndexedDB / localStorage / GitHub Pages + GitHub Actions

---

## 1. Phase 4 概要

### 目的

Phase 3までで「読めるビューア」は完成した。Phase 4は2つの方向に拡張する。

**層Aの本格化** — 現行の本棚（Bookshelf.jsx）に分類・ソート・リネーム機能を追加し、日常使いに耐える水準にする。

**層Bの新設** — ライブラリ機能（LibraryView）を新規に追加する。層Aの本棚はファイルの保管庫（フラットなリスト）。層Bのライブラリはコレクションの構築場（ツリー構造でフォルダ分類、編集、結合、mkb出力）。層Aと層Bは同じBookEntryを参照するが、責務が異なる。

**縦書き表示** — `fileType: 'vertical'` としてインポート時に縦書きを確定する。スクロールモード固定でページネーションは使わない。既存エンジンはそのまま共用。

### Phase 4 構成とサブフェーズ

| サブフェーズ | セクション | 内容 | 難易度 | 依存 |
|---|---|---|---|---|
| 4a | §27 | 層Aの本格化（分類・ソート・リネーム） | 低〜中 | なし |
| 4b | §28 | 層Bの基盤（LibraryView・ツリー構造・UI） | 中〜高 | なし（4aと並行可） |
| 4c | §29 | 層Bの編集機能（ファイル接続・画像切り出し・mkb変換） | 高 | §28 |
| 4d | §30 | 縦書き表示（vertical-rl・スクロール固定） | 中 | なし（他と並行可） |

4aと4dは独立しており並行して進められる。4bと4cは連続で、4bの基盤がないと4cに入れない。

### スコープ外（Phase 5以降）

| 内容 | 理由 |
|---|---|
| §19 Google Drive連携（OAuth + フォルダブラウズ） | OAuth認証 + 静的配信の制約。層Bの基盤が先 |
| プロダクトB（ロアブック＋執筆環境） | ビューアの安定化が先 |
| 表紙画像のリッチUI（背表紙テクスチャ等） | 層Bの基本機能が先 |

---

## 2. データモデル

### 2.1 BookEntry の拡張

```typescript
type BookEntry = {
  id: string;
  title: string;
  author: string;
  fileType: 'mkb' | 'md' | 'txt' | 'html' | 'json' | 'images'
          | 'vertical';    // §30 新規: 縦書きテキスト
  fileData: ArrayBuffer;   // 原本。絶対に変更しない
  charCount?: number;
  addedAt: number;
  lastOpenedAt: number;
  localSettings?: LocalSettings;
};
```

変更点: `fileType` に `'vertical'` を追加。それ以外のBookEntryスキーマは変更しない。

### 2.2 Library / LibraryNode（§28 新規）

```typescript
// ライブラリ全体（IndexedDB 'libraries' ストアに保存）
type Library = {
  id: string;
  name: string;             // ユーザーが編集可能
  createdAt: number;
  updatedAt: number;
  rootNodes: string[];      // トップレベルノードのid配列（表示順序）
  nodes: Record<string, LibraryNode>;  // 全ノードのフラットマップ
};

// ライブラリ内の各ノード（フォルダまたはアイテム）
type LibraryNode = {
  id: string;
  type: 'folder' | 'item';
  name: string;              // 表示名（フォルダ名 or ファイル表示名）
  parentId: string | null;   // null = トップレベル
  children?: string[];       // type='folder' の場合のみ。子ノードのid配列（表示順序）

  // type='item' の場合のみ
  sourceBookId?: string;     // → BookEntry.id への参照
  description?: string;      // ユーザーが編集する説明文
  edits?: LibraryEdits;      // 層B独自の編集（層AのlocalSettings.rewriteとは別枠）
};

// 層B独自の編集データ
type LibraryEdits = {
  lineEdits?: LineEdit[];
  hiddenRanges?: HiddenRange[];
  insertedAssets?: InsertedAsset[];
  importedAssets?: ImportedAsset[];   // 他の本からの画像切り出し
};

// 他の本から切り出した画像
type ImportedAsset = {
  id: string;
  sourceBookId: string;      // 切り出し元のBookEntry.id
  sourcePath: string;        // 切り出し元のassetパス
  data: ArrayBuffer;         // コピーされた画像データ
  mimeType: string;
  insertAfter: { chapterId: string; lineNumber: number };
  altText: string;
  displaySize: 'inline' | 'block' | 'fullpage';
  enabled: boolean;
};
```

### 2.3 設計判断の記録

**D-001: display設定は層A/B共有。** 層Bは独自のdisplayを持たない。同じBookEntryの`localSettings.display`を参照する。同じ本であるから同じローカル設定に従う。

**D-002: カスケード削除。** 層A（BookEntry）を削除すると、そのBookEntryを参照する全てのLibraryNodeも削除される。削除確認ダイアログに「このファイルはライブラリ○○でも使用されています。削除するとライブラリからも消えます」と1行追加。層BのLibraryNodeを削除しても層AのBookEntryは消えない。

**D-003: 層Bの編集と層Aの読み替えは別枠。** 層Aの`localSettings.rewrite`は「閲覧時の読み替え」。層Bの`LibraryNode.edits`は「コレクションとしての編集」。責務が異なる。ビューアで本を開いたとき、層Aのrewriteは常に適用される。層Bのeditsはライブラリ経由で開いたときに追加適用される（rewriteの上に重ねる）。

**D-004: 旧本棚をフォールバックとして残す。** 層A＝現行Bookshelf.jsxを拡張。層B＝LibraryView.jsx（新規）。画面上部のタブまたはトグルで切り替え可能。

**D-005: 縦書きはインポート時に確定。** `fileType: 'vertical'` はインポート時のユーザー選択で決まる。設定での切り替えは存在しない。スクロールモード固定、ページネーション不可。原本のfileDataは変更しない（フラグの付与のみ）。

**D-006: ファイル接続のデータモデルはPG裁量。** mkb出力のしやすさを優先する。参照配列方式でも結合テキスト方式でもよい。

### 2.4 フィールド依存マップ（層A → 層B）

| BookEntry フィールド | 層Aでの利用 | 層Bでの利用 |
|---|---|---|
| `id` | 全コンポーネントの主キー | LibraryNode.sourceBookId からの参照先 |
| `title` | Bookshelf表示、ヘッダー、重複チェック、ExportDialog | LibraryNode.name のデフォルト値（上書き可能） |
| `author` | Bookshelf表示、ExportDialog | 情報表示 |
| `fileType` | Bookshelfアイコン、useMkbLoaderの分岐判定 | パーサー分岐に使用 |
| `fileData` | 原本。useMkbLoaderで展開 | LibraryNode経由で開く際にsourceBookIdから取得 |
| `charCount` | Bookshelf表示 | 情報表示（動的取得） |
| `addedAt` | Bookshelf表示（フォールバック日付） | 使わない。LibraryNodeに独自の日付 |
| `lastOpenedAt` | Bookshelfのソート順 | 使わない。LibraryNodeで独自に追跡 |
| `localSettings.display` | useSettingsの「ローカル設定」層 | **共有。** 層Bも同じBookEntryのdisplayを読む |
| `localSettings.rewrite` | useRewriteの全CRUD | **持ち越さない。** 層Bは独自のeditsを持つ |
| `localSettings.lastPosition` | Paginator/App.jsxで中断復帰 | **共有。** 同じBookEntryの中断箇所を使う |

### 2.5 共有エンジンの依存関係（層A・B共通）

| モジュール | 入力 | 出力 | 層Bでの再利用 |
|---|---|---|---|
| rewriteEngine.js | MDテキスト + RewriteRules | 変換済みMDテキスト | ○ 層Bのeditsにも同じエンジンを使える |
| MarkdownRenderer.jsx | chapter + rewriteRules | DOM | ○ そのまま共用 |
| Paginator.jsx | chapter + settings | ページネーション済みDOM | ○ そのまま共用 |
| useSettings.js | global + local | 実効設定 | ○ 層Bのdisplayもlocal層として注入可能 |
| useMkbLoader.js | File/ArrayBuffer | MkbData | ○ sourceBookIdからのパースに使用 |
| useImageResize.js | 画像ArrayBuffer | リサイズ済みArrayBuffer | ○ 表紙サムネイル生成にも使える |

---

## 3. ファイル構成（Phase 4での変更）

### 新規ファイル

```
src/
├── components/
│   ├── LibraryView.jsx          # §28: ライブラリUI（ドリルダウン＋編集モード）
│   ├── LibraryEditor.jsx        # §29: ライブラリ編集機能（ファイル接続・画像切り出し）
│   └── LibraryExport.jsx        # §29: ライブラリ→mkb変換エクスポートUI
├── hooks/
│   └── useLibrary.js            # §28: Library / LibraryNode の IndexedDB CRUD
```

### 変更ファイル

```
src/
├── App.jsx                      # §27§28: 本棚/ライブラリ切り替え、縦書きビューア分岐
├── components/
│   ├── Bookshelf.jsx            # §27: 分類・ソート・リネーム追加
│   ├── FileLoader.jsx           # §30: 「縦書きとして読み込む」オプション追加
│   ├── Paginator.jsx            # §30: vertical-rl + スクロールモード固定分岐
│   └── SettingsPanel.jsx        # §30: 縦書き時の設定制限（ページネーション無効化）
├── hooks/
│   ├── useBookshelf.js          # §27: リネーム関数追加。§28: カスケード削除時のライブラリ通知
│   └── useMkbLoader.js          # §30: fileType='vertical' のパース分岐
├── utils/
│   └── rewriteEngine.js         # §29: importedAssetsの適用ロジック追加
└── styles/
    └── reader.css               # §28§30: ライブラリUI・縦書きスタイル追加
```

---

## 4. 機能仕様

### §27: 層Aの本格化（Bookshelf拡張）

**何を:** 現行Bookshelf.jsxに分類・ソート・リネーム機能を追加し、日常使いに耐える本棚にする。

**どのように:**

**ソート機能。** 本棚ヘッダーにソートボタンを追加。ソート基準は3つ: 最終閲覧日（デフォルト、現行動作）、追加日、タイトル（五十音順）。ソート基準はlocalStorageに保存し、次回起動時に復元する。ソート方向（昇順/降順）はトグル。

**リネーム機能。** 本のタイトルをタップ長押し、またはメニューから「名前を変更」で編集可能にする。useBookshelf.jsに `renameBook(id, newTitle)` 関数を追加。BookEntry.titleを直接更新する（fileDataは変更しない）。

**分類（タグ）機能。** BookEntryに `tags?: string[]` フィールドを追加（オプショナル、後方互換）。本棚UIの上部にタグフィルタバーを表示。タグの追加・削除は各本のメニューから。タグ一覧は全BookEntryから動的に集計する（別途マスタは持たない）。

**削除の改善。** §28のカスケード削除に対応。削除確認ダイアログで、ライブラリに参照がある場合は警告文を追加表示する。

**制約:**
- useBookshelf.jsの安定IF（saveBook, getBook, getAllBooks, deleteBook, updateLastOpened）は維持する
- 新規関数（renameBook, タグCRUD）は安定IFに追加する形で拡張

**IndexedDB スキーマ:** DB_VERSIONを2に上げる。onupgradeneededで既存ストアに`tags`インデックスを追加（既存エントリには空配列を初期値として設定しない。undefinedのまま許容）。

---

### §28: 層Bの基盤（LibraryView）

**何を:** ツリー構造のライブラリ機能を新規作成する。層Aの本棚がファイルの保管庫なら、層Bのライブラリはコレクションの構築場。

**どのように:**

#### 28.1 IndexedDB設計

DB_VERSION=2 の onupgradeneeded で `libraries` オブジェクトストアを新設する。

```javascript
if (!db.objectStoreNames.contains('libraries')) {
  const store = db.createObjectStore('libraries', { keyPath: 'id' });
  store.createIndex('updatedAt', 'updatedAt', { unique: false });
}
```

Library オブジェクト全体を1つのレコードとして保存する（§2.2のスキーマ参照）。ノードはLibrary.nodesにフラットマップとして内包する。数百ノードまでは全体読み書きで問題ない。

#### 28.2 useLibrary.js

Library / LibraryNode の CRUD を提供するカスタムフック。

```typescript
// エクスポートするAPI
{
  libraries: Library[];          // 全ライブラリ一覧
  loading: boolean;
  createLibrary(name: string): Promise<Library>;
  deleteLibrary(id: string): Promise<void>;
  renameLibrary(id: string, name: string): Promise<void>;

  // ノード操作（全てlibraryIdを引数に取る）
  addFolder(libraryId, parentId, name): Promise<LibraryNode>;
  addItem(libraryId, parentId, sourceBookId): Promise<LibraryNode>;
  removeNode(libraryId, nodeId): Promise<void>;     // フォルダの場合は子も再帰削除
  moveNode(libraryId, nodeId, newParentId, index): Promise<void>;
  renameNode(libraryId, nodeId, name): Promise<void>;
  updateNodeEdits(libraryId, nodeId, edits): Promise<void>;

  // BookEntry削除時の参照確認
  findReferencingLibraries(bookId: string): Promise<{ libraryId: string; libraryName: string; nodeIds: string[] }[]>;
  removeNodesByBookId(bookId: string): Promise<void>;  // カスケード削除用
}
```

#### 28.3 画面構成

**切り替えUI。** App.jsxの本棚画面上部に2つのタブ（またはトグルボタン）を配置: 「本棚」（層A、Bookshelf.jsx）と「ライブラリ」（層B、LibraryView.jsx）。デフォルトは「本棚」。選択状態はlocalStorageに保存。

**LibraryView.jsx のUI構成:**

1. **ライブラリ選択バー。** 複数ライブラリを水平スクロールのチップで表示。「+」ボタンで新規ライブラリ作成。ライブラリ名の長押しでリネーム・削除メニュー。

2. **ドリルダウンナビゲーション（通常モード）。** スマホのファイルマネージャと同じ操作体系。フォルダをタップすると階層を降りる。画面上部にパンくずリスト（現在のパス）。パンくずの各階層をタップで遡れる。アイテム（ファイル）をタップするとビューアで開く（層Bのeditsが適用された状態で）。

3. **編集モード。** 右上の「編集」ボタンでトグル。編集モードでは各ノードにドラッグハンドルが表示され、並び替え・フォルダ間移動が可能。フォルダ新規作成、アイテム追加（本棚から選択）、ノード削除のボタンが表示される。通常モードではドラッグは無効（誤操作防止）。

4. **アイテム追加フロー。** 「+」→ 本棚の一覧が表示される → タップで選択 → 現在のフォルダにLibraryNodeとして追加。sourceBookIdで参照する（コピーではなくエイリアス）。

**モバイルタッチ対応:**
- タッチターゲットは最低44px
- ドリルダウン操作のタップと編集モードのドラッグを分離することで、誤操作を構造的に防止
- ドラッグ&ドロップはHTML5 Drag and Drop APIではなく、タッチイベント（touchstart/move/end）で実装。モバイルファーストのため

#### 28.4 ビューアとの接続

LibraryView.jsxからアイテムを開いた場合、App.jsxは以下の追加情報を受け取る:

```typescript
type LibraryOpenContext = {
  libraryId: string;
  nodeId: string;
  edits?: LibraryEdits;   // 層Bの独自編集
};
```

App.jsxはBookEntryをsourceBookIdで取得し、通常通りuseMkbLoaderでパースする。rewriteRulesの適用時に、層Aの`localSettings.rewrite` → その上に層Bの`edits`を重ねる（同じrewriteEngineを使う）。

---

### §29: 層Bの編集機能

**何を:** ライブラリノードに対する編集機能を追加する。ファイル接続（複数チャットログの結合）、他の本からの画像切り出し、ライブラリ→mkb変換エクスポート。

**前提:** §28が完了していること。

**どのように:**

#### 29.1 ファイル接続（複数ファイルの結合）

LibraryNode（type='item'）を複数選択し、「結合」操作で新しいLibraryNode（type='item'）を作る。

**データモデルはPG裁量（D-006）。** ただし以下の制約を満たすこと:
- mkbエクスポート時に、結合されたファイルが自然なチャプター構造になること
- 各元ファイルの読み替えルール（層Aのrewrite）が適用された状態で結合されること
- 結合後のLibraryNodeが削除されても元のBookEntryは消えないこと

PGが「sourceBookId配列 + 連結順序」方式と「結合済みテキストをLibraryNode.editsに保持」方式のどちらを採用するかは、実装時に判断してよい。

#### 29.2 他の本からの画像切り出し

ビューアで本を閲覧中に、画像を長押し → コンテキストメニュー → 「ライブラリに切り出す」。

フロー:
1. 画像をタップ長押し → 既存のContextMenu.jsxに「ライブラリに切り出す」選択肢を追加
2. ライブラリ一覧 → フォルダ選択 → 挿入先のLibraryNodeを選択
3. 画像のArrayBufferをBookEntryのfileData（mkb/cbz）からJSZipで展開・コピー
4. ImportedAsset として対象LibraryNode.editsに保存
5. 表示時にrewriteEngineがimportedAssetsを適用（insertedAssetsと同じロジック）

#### 29.3 ライブラリ → mkbエクスポート

LibraryViewの編集モードで「MKBとして出力」ボタン。

フロー:
1. 対象ライブラリ（またはフォルダ）のツリーを走査
2. 各LibraryNode（type='item'）からsourceBookIdでBookEntryを取得
3. useMkbLoaderでパース → 層Aのrewrite適用 → 層Bのedits適用
4. フォルダ構造をmkbのチャプター構造にマッピング:
   - フォルダ = markbook.yamlのpages配列
   - アイテム = pages/内の各MDファイル
   - トップレベルのアイテム = index.md（最初の1つ）+ pages/（残り）
5. importedAssetsの画像をassets/に収集
6. JSZipでZIP構築 → .mkbとしてダウンロード

既存のuseExport.jsを拡張するか、LibraryExport.jsxとして別モジュールにするかはPG判断。

---

### §30: 縦書き表示

**何を:** テキストファイル（md/txt）を縦書き（`writing-mode: vertical-rl`）で表示する機能を追加する。インポート時に「縦書きとして読み込む」を選択すると、`fileType: 'vertical'` で保存され、以降は縦書き固定で表示される。

**なぜ:**
- 青空文庫の小説等、縦書きで読みたいテキストが存在する
- CSS multi-column + vertical-rl の組み合わせは「極めて高」のリスクだが、ページネーションを放棄しスクロールモード固定にすることで「中」に下がる
- 設定での横書き/縦書き切り替えは、全既存設定との組み合わせ爆発を招くため採用しない
- fileType フラグの付与のみで原本のfileDataは変更しない（D-005）

**どのように:**

#### 30.1 インポートUI

FileLoader.jsxに変更を加える。ファイル選択時、拡張子がmd/txtの場合に「縦書きとして読み込む」チェックボックスを表示する。チェックONの場合、fileToBookEntry()の返り値の`fileType`を`'vertical'`に設定する。

チェックボックスの表示条件:
- 拡張子が .md / .txt / .markdown のいずれか
- mkb/cbz/html/json/画像には表示しない

#### 30.2 ビューア表示

App.jsxのViewerContent型分岐に `'vertical'` を追加:

```typescript
type ViewerContent =
  | { type: 'mkb'; data: MkbData }
  | { type: 'html'; content: string }
  | { type: 'json'; content: string }
  | { type: 'images'; images: ImageEntry[] }
  | { type: 'vertical'; data: MkbData };  // 新規
```

vertical型の場合:
- MarkdownRendererはそのまま使う（MDのレンダリングは同じ）
- Paginatorはスクロールモード固定（`viewMode: 'scroll'` 強制）
- `.paginator-track` に `writing-mode: vertical-rl` を適用
- ページネーションモードへの切り替えは無効化（SettingsPanelでトグルを非表示にする）

#### 30.3 CSSの追加

```css
/* §30: 縦書きモード */
.vertical-mode .paginator-track {
  writing-mode: vertical-rl;
  overflow-x: auto;
  overflow-y: hidden;
}

.vertical-mode .paginator-track img {
  max-height: 80vh;    /* 縦書きフロー内で画像が巨大にならないよう制限 */
  width: auto;
}
```

#### 30.4 テキスト表示の注意点

- `text-orientation: mixed`（デフォルト）で半角英数字は横倒し表示。これは標準的な日本語縦書きの挙動であり、変更しない
- Noto Serif JP / Shippori Mincho / Zen Old Mincho はいずれも縦書きメトリクスを持つ。追加のフォント設定は不要
- 欧文フォント（EB Garamond等）は縦書きフローでは使わない。縦書き時のフォントスタックは日本語フォントのみとする

#### 30.5 設定の制限

useSettings.jsで、`fileType === 'vertical'` の場合に以下の設定を制限する:
- `viewMode`: 'scroll' 固定。トグル非表示
- `swipeDirection`: 無効（横スクロールがネイティブのスクロール操作になるため）
- タップゾーン: 無効（ページネーション不使用のため）
- 他の設定（フォント、テーマ、行間、余白）はそのまま有効

#### 30.6 リスク項目

**実機検証が必要:** 縦書きの横スクロール（左方向）がPixel 10 Chromeのタッチ操作で自然に動作するかどうか。Paginator.jsxのスクロールモードは現在縦方向のスクロールを前提としているため、`writing-mode: vertical-rl` を適用した際に `overflow-x: auto` + `overflow-y: hidden` への切り替えが必要になる可能性がある。

検証手順: §30の実装後、最小限のテスト用テキスト（青空文庫から数段落）で実機確認。スクロール方向が自然でなければ、追加のタッチイベント制御を検討する。

---

## 5. テスト方針

### Phase 4a（§27）テスト

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| ソート | 手動テスト | 3基準（最終閲覧日/追加日/タイトル）で正しく並び替わる。選択状態がリロード後も復元される |
| リネーム | 手動テスト | タイトル変更後、本棚表示とヘッダー表示の両方に反映される。fileDataは変更されない |
| タグ | 手動テスト | タグの追加・削除・フィルタが動作する。タグ付き/なしの混在で表示が崩れない |
| カスケード削除警告 | 手動テスト | ライブラリに参照がある本の削除時に警告が表示される |
| 既存機能の回帰 | 手動テスト | 本の追加・削除・開く・最終閲覧日更新が従来通り動作する |

### Phase 4b（§28）テスト

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| ライブラリCRUD | 手動テスト | 作成・リネーム・削除が動作。削除時に確認ダイアログ |
| フォルダ操作 | 手動テスト | フォルダ作成、ドリルダウン、パンくず遷移が動作 |
| アイテム追加 | 手動テスト | 本棚から選択 → ライブラリに追加 → タップで開ける |
| 編集モード | 手動テスト（実機） | ドラッグで並び替え・フォルダ間移動が動作。通常モードでドラッグが誤発火しない |
| 層A/B切り替え | 手動テスト | タブ切り替えで本棚/ライブラリが正しく表示される |
| 層Bからのビューア表示 | 手動テスト | ライブラリからファイルを開いたとき、層Aのrewriteが適用された状態で表示される |

### Phase 4c（§29）テスト

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| ファイル接続 | 手動テスト | 複数チャットログを結合し、自然なチャプター構造でビューアに表示される |
| 画像切り出し | 手動テスト | mkb内の画像を長押し→ライブラリに切り出し→対象ノードに表示される |
| mkbエクスポート | 手動テスト | ライブラリのツリーをmkbとしてダウンロード→再度mkb-readerで開いて内容が正しい |
| 削除の安全性 | 手動テスト | 結合ノード・切り出し画像を含むノードを削除しても元のBookEntryは消えない |

### Phase 4d（§30）テスト

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| インポートUI | 手動テスト | md/txtでチェックボックス表示。mkb/cbz等では非表示 |
| 縦書き表示 | 実機テスト（Pixel 10） | テキストが右→左に縦書き表示され、左方向スクロールで読み進められる |
| フォント | 実機テスト | 日本語フォント3種が縦書きで正しく表示される |
| 英数字 | 実機テスト | 半角英数字が横倒し（text-orientation: mixed）で表示される |
| 画像 | 実機テスト | MD内の画像が縦書きフロー内で正しく配置される |
| 設定制限 | 手動テスト | ページネーションのトグルが非表示。テーマ・フォント・行間は有効 |
| 読み替え | 手動テスト | 縦書きファイルにもrewrite・画像差し込みが適用される |

---

## 6. 実装順序と依存関係

```
§27（層A本格化）─────────────────→ 実機検証 → 合格
                                        ↓
§28（層B基盤）───────────────────→ 実機検証 → 合格
                                        ↓
§29（層B編集）───────────────────→ 実機検証 → 合格

§30（縦書き）──→ 実機検証（スクロール方向） → 合格/設計変更判断
```

§27と§30は他に依存しないため、同時着手可能。
§28は§27の完了を待つ必要はないが、IndexedDBのスキーマ変更（DB_VERSION=2）は§27と§28で共有するため、§27と§28の指示書は同一バッチで出す。
§29は§28が合格してから着手する。

---

## 7. 既知のリスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 縦書き横スクロールがモバイルChromeで自然に動作しない | §30の成否 | §30は早期にプロトタイプを実機検証。不自然ならタッチイベント制御を追加するか、§30を棚上げ |
| モバイルでのドラッグ&ドロップの操作性 | §28の編集モードUX | ドリルダウンと編集モードの分離で誤操作を構造的に防止。編集モードはタッチイベントベースで実装 |
| IndexedDBスキーマ変更の後方互換性 | 既存データの消失 | DB_VERSION=2のonupgradeneededで既存ストアは変更せず、新規ストア追加のみ。既存BookEntryのtags=undefinedを許容 |
| Library.nodesのフラットマップが大きくなった際の読み書き性能 | §28のレスポンス | 数百ノードまでは問題ない。1000ノード超の場合はノード単位ストアへの移行を検討（Phase 5以降） |

---

## 改訂履歴

| バージョン | 日付 | 変更者 | 変更内容 |
|---|---|---|---|
| v1.0 | 2026-04-30 | クリーデ (PM) | 初版作成 |
