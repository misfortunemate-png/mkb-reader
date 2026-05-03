ブランチにともない文脈が喪失したので、以下の内容も上書きして取り入れること。

設計の構造：
writingMode はlocalSettings（サイドカー）ではなく、BookEntryのメタデータとして保持。これは「どう表示するか」の設定ではなく「どういう本として取り込んだか」の属性だからです。fileData（原本バイナリ）は一切変わらない。
typescripttype BookEntry = {
  // ...既存フィールド...
  writingMode: 'horizontal-tb' | 'vertical-rl';  // インポート時に確定
};
操作フロー：
新規インポート時：ファイル選択後に「横書き / 縦書き」の2択を表示。デフォルトは横書き。選択後にBookEntryが生成される。
既存の横書き本を縦書きにしたい場合：本棚のメニューから「縦書きコピーを作成」。新しいBookEntry（新ID、fileDataのコピー、writingMode: vertical-rl）が本棚に追加される。元の横書き版はそのまま残る。localSettings（読み替えルール等）はコピーしない。新しい本として白紙の状態で始まる。
表示エンジンへの影響：
writingMode === 'vertical-rl' の場合：

Paginator.jsx はスクロールモードを強制（ページネーション無効）
.paginator-track に writing-mode: vertical-rl を適用
スクロール方向が水平（左方向）になる
MarkdownRenderer、rewriteEngine、コンテキストメニュー、挿絵挿入はそのまま動く
設定パネルの「表示モード」（ページ/スクロール切替）はグレーアウト

層Bとの関係：
縦書きのBookEntryは層Bのライブラリに配置できるが、層Bの編集機能（ファイル接続、画像切り出し）の対象外。エイリアスとしてツリーに並べることはできるが、コピーとして編集はできない。



層A/層BはLightroomのカタログ/コレクションモデル。同一アプリ・同一ストレージ
層Bは3階層限定（親・子・孫）。ドリルダウンのみ
縦書きはスクロールモード限定。インポート時に確定。ページネーションとの組み合わせは放棄
横書き→縦書き変換はコピー生成で対応（D-005との整合）
ビジュアルはAI生成画像のユーザーインポート前提。フレーム装飾不要
画像挿入は端末UI/クリップボード方式
Google Drive連携は削除
縦書きBookEntryは層Bの編集対象外








---------------------------------------------------------
ここから下が上書き先


# Phase 4 ロードマップ

作成日: 2026-04-29
作成者: ショウゴ（発注者）・クリーデ（PM）

設計思想: `process.md §8 D-001〜D-007` を全ての設計判断の基盤とする。

---

## 概要

Phase 4 はプロダクトA（ビューア）の本棚本格化と、プロダクトB（エディタ/ライブラリ）の新設。
同一アプリ・同一ストレージ・同一設定・同一表示エンジンで共存する。

**Lightroomで喩えると:**
- 層A（プロダクトA）= カタログ。素材の原本を保持し、閲覧し、非破壊の読み替えを適用する
- 層B（プロダクトB）= コレクション。カタログから素材を引っ張ってきて、自由に構成・編集・飾り付ける

---

## 実装順序

| Phase | 内容 | 難易度 | 依存 |
|---|---|---|---|
| 4a | 層Aの本格化（分類・ソート・リネーム・表紙画像・検索） | 低〜中 | なし |
| 4d-proto | 縦書きプロトタイプ検証（4aと並行） | 不明 | なし |
| 4b | 層Bの基盤（Library構造、ツリーUI、テーマ、エイリアス/コピー） | 中〜高 | 4a完了 |
| 4c | 層Bの編集機能（ファイル接続・画像切り出し・mkb変換） | 高 | 4b完了 |
| 4d | 縦書き表示（プロトタイプ結果に基づき本実装） | 極めて高 | 4d-proto, 全Phase |

**削除:** Google Drive連携（§19）は不要と判断。

---

## 確定済み設計判断

### 層Aと層Bの関係

1. **display設定は共有。** 層Bは `localSettings.display` を層AのBookEntryから読む。層B独自のdisplayは持たない。同じ本は同じ見え方をする
2. **カスケード削除。** 層A削除 → 層Bからも消える。層B削除 → 層Aに影響なし。層A削除時に「このファイルはライブラリでも使用されています」と表示
3. **旧本棚をフォールバックとして残す。** 現行 Bookshelf.jsx をベースに拡張（層A）。LibraryView.jsx を新設（層B）。切り替え可能

### 層Bの参照モデル

- **エイリアス:** `sourceBookId` のみ保持。実行時に層AからfileDataを取得。層Aで原本が消えればライブラリからも消える
- **コピー:** `sourceBookId` + fileData/metadata のスナップショットを保持。層Aから独立して存在。編集はコピーに対して行う

### 層Bの編集とrewriteの関係

- 層Aの `localSettings.rewrite`（閲覧時の読み替え）は層Bでもそのまま適用される
- 層Bの編集（`LibraryItem.edits`）は層Aの rewrite とは別枠で、その上に追加される
- rewriteEngine.js は両方の処理に再利用する

---

## データモデル

### 既存（層A — 変更なし）

```typescript
type BookEntry = {
  id: string;
  title: string;
  author: string;
  fileType: 'mkb' | 'md' | 'txt' | 'html' | 'json' | 'images';
  fileData: ArrayBuffer;        // 原本。絶対に変更しない
  addedAt: number;
  lastOpenedAt: number;
  charCount?: number;
  localSettings?: {
    display?: DisplaySettings;  // 層A・B共有
    rewrite?: RewriteRules;     // 層A・B共有（閲覧時の読み替え）
    lastPosition?: LastPosition;
  };
};
```

### 新設（層B — IndexedDB: mkb-libraries）

```typescript
type Library = {
  id: string;
  name: string;
  theme: string;                // デザインテーマの選択
  createdAt: number;
  children: LibraryNode[];      // ツリー構造（ネストしたJSONで保持）
};

type LibraryNode =
  | { type: 'folder'; id: string; name: string; children: LibraryNode[] }
  | { type: 'item'; item: LibraryItem };

type LibraryItem = {
  id: string;
  mode: 'alias' | 'copy';
  sourceBookId: string;         // → BookEntry.id

  // copy mode のみ: スナップショット
  content?: {
    fileData: ArrayBuffer;
    fileType: string;
    title: string;
    author: string;
  };

  // 層B独自の編集（層Aのrewriteの上に追加適用）
  edits?: {
    lineEdits?: LineEdit[];
    hiddenRanges?: HiddenRange[];
    insertedAssets?: InsertedAsset[];
    importedAssets?: ImportedAsset[];  // 他の本から切り出した画像
  };

  description?: string;         // ユーザーが編集する説明文
  coverImage?: ArrayBuffer;     // カスタム表紙（サムネイルサイズ）
};

// 他の本からの画像切り出し
type ImportedAsset = {
  id: string;
  sourceBookId: string;         // 切り出し元のBookEntry.id
  data: ArrayBuffer;
  mimeType: string;
  altText: string;
};
```

### フィールド依存マップ

| BookEntry フィールド | 層A利用 | 層B利用 |
|---|---|---|
| id | 全コンポーネントの主キー | エイリアスの参照先 |
| title, author | 本棚表示、ヘッダー、エクスポート | ライブラリノード表示 |
| fileType | パーサー分岐、アイコン選択 | コピー作成時に保持 |
| fileData | 展開→MkbData生成、エクスポート | alias=実行時取得 / copy=スナップショット |
| charCount | 本棚表示 | 情報表示 |
| addedAt, lastOpenedAt | ソート、相対日時表示 | 使わない（層B独自のタイムスタンプ） |
| localSettings.display | 表示設定 | **共有**（同じBookEntryから読む） |
| localSettings.rewrite | 閲覧時の読み替え | **共有**（層B editsはその上に追加） |
| localSettings.lastPosition | 中断箇所の復帰 | 使わない（層Bは独自の読書位置を持つ） |

### 共有エンジン（層A・B共通）

| モジュール | 層Bでの再利用 |
|---|---|
| rewriteEngine.js | ○ 層Bのeditsにも同じエンジン |
| MarkdownRenderer.jsx | ○ そのまま共用 |
| Paginator.jsx | ○ そのまま共用 |
| useSettings.js | ○ 層BのdisplayもBookEntry経由で注入 |
| useMkbLoader.js | ○ コピーからもパース可能 |
| useImageResize.js | ○ 表紙サムネイル生成にも使用 |

---

## 4a: 層Aの本格化

### 追加機能

- 分類: ファイルタイプ別フィルタ、カテゴリタグ（ユーザー定義）
- ソート: タイトル順 / 追加日順 / 最終閲覧順 / 文字数順
- リネーム: タイトル・著者のインライン編集
- 表紙画像: mkbの場合はassets/内の最初の画像を自動抽出。手動設定可。useImageResize.jsでサムネイルサイズに圧縮して永続化
- 検索: タイトル・著者のテキストマッチ（IndexedDBのIDBKeyRange）

### 技術的注意点

- 表紙画像はBookEntryに `coverImage: ArrayBuffer` を追加。サムネイルサイズ（200px程度）にリサイズして保存し、メモリを節約
- 現行Bookshelf.jsxを拡張する形で実装。旧UIへのフォールバック切り替えは設定パネルから

---

## 4b: 層Bの基盤

### モバイルツリーUIの設計方針

通常時: フォルダをタップして階層を降りるドリルダウンUI（スマホのファイルマネージャと同じ）
編集モード: ドラッグ&ドロップを有効にして並び替え・移動。通常のブラウジングとの誤操作を分離

ライブラリ候補: React Arborist または React Complex Tree（ドラッグ&ドロップ + 仮想化）。
ただしデスクトップ前提のライブラリが多いため、モバイルタッチ操作への適応は検証が必要。

### 「特別感のあるデザイン」

- 大アイコン表示（CSS grid、カバー画像中心）
- テーマ選択（ライブラリごとに背景・配色を選べる）
- 個々のファイルタップ → 詳細カード（タイトル・著者・説明・表紙。編集可能。もう1タップで開く）

---

## 4c: 層Bの編集機能

### ファイル接続

複数BookEntryのMDテキストを指定順序で連結。データモデルはPG裁量（mkb出力のしやすさ優先）。
結合時のチャプター分割、各ファイルのrewriteRules統合方法はPGが提案しPMが判断。

### 他の本からの画像切り出し

BookEntry AのfileDataからJSZipでassetを展開 → ImportedAssetとしてLibraryItem.editsに保存。
UIフロー: 本を開く → 画像をタップ → 「この画像を切り出す」→ 切り出し先のLibraryNodeを選択。

### mkb変換

LibraryNodeのツリーをmkbのチャプター構造に変換。既存useExport.jsの拡張。

---

## 4d: 縦書き

### プロトタイプ検証（4aと並行）

既存Paginator.jsxとは別にVerticalPaginator.jsxを作り、単純なMDテキストで `writing-mode: vertical-rl` + `column-fill: auto` がPixel 10のChromeで動作するか検証。

検証項目:
- multi-columnの列方向（右→左）でページ送りが成立するか
- translateXの計算方向
- scrollWidthの解釈
- 英数字のtext-orientation
- 禁則処理（orphans/widows）の動作

### 本実装の判断

プロトタイプ結果に基づき、既存Paginatorの拡張で行くか、完全に別のレンダリングパスを持つか判断。
縦書きは層Bの責務（「どう見せたいか」の作り込み）として位置づける。

---

## 改訂履歴

| 日付 | 変更者 | 変更内容 |
|---|---|---|
| 2026-04-29 | ショウゴ・クリーデ | 初版作成 |
