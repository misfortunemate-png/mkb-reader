# プロダクトA ビューア 実装仕様書（Phase 3a: §10〜§13）

作成日: 2026-04-29
PM: クリーデ
前提: Phase 1（§1〜§4）+ Phase 2（§5〜§9）実装済み・実機検証合格

---

## 1. 概要

- 何を作るか: ビューアが扱えるファイル形式を拡張し、画像・HTML・JSONを含む幅広いコンテンツを鑑賞できるようにする
- なぜ作るか: 現状はmd/txt/mkbのみ。実用的なビューアには画像文書・Web出力・データファイルの閲覧が不可欠
- 誰が使うか: ショウゴさん（Pixel 10 Chrome）

**このフェーズのゴール:** mkb-readerで「テキストも画像も、生成AIの出力も、スキャンした紙も」開ける状態にする。

## 2. 実装順序

| 順序 | セクション | 理由 |
|---|---|---|
| 1 | §10 HTML/JSON閲覧 | 最も軽い。既存のビューアに表示パスを追加するだけ |
| 2 | §11 画像ビューアモード + CBZ | 新しい描画パス（ImageViewer）の追加。§4のPaginatorとは独立 |
| 3 | §12 画像リサイズ | §8の本棚保存と§11の画像取り込みに影響。IndexedDB容量管理 |
| 4 | §13 ページネーション禁則改善 | 既存§4の品質改善。他の§に依存しない |

## 3. ファイル構成（追加・変更分）

```
src/
├── components/
│   ├── HtmlRenderer.jsx        # 新規 §10: HTML表示
│   ├── JsonRenderer.jsx        # 新規 §10: JSON整形表示
│   ├── ImageViewer.jsx         # 新規 §11: 画像ビューアモード
│   ├── MarkdownRenderer.jsx    # 変更 §13: 禁則改善CSS追加
│   └── Paginator.jsx           # 変更 §13: 禁則改善
├── hooks/
│   ├── useMkbLoader.js         # 変更 §10§11: ファイルタイプ判定拡張
│   └── useImageResize.js       # 新規 §12: 画像リサイズロジック
├── utils/
│   └── mkbParser.js            # 変更 §11: 画像のみZIP判定
└── styles/
    └── reader.css              # 変更 §13: 禁則CSSルール追加
```

## 4. 機能仕様

### §10: HTML / JSON閲覧

**何を:** .html / .json ファイルをビューアで開けるようにする。表示設定は固定（横書き、現在のテーマ・フォントサイズを適用）。

**ファイル選択の拡張:**
- `<input type="file">` の accept に `.html,.json` を追加
- useMkbLoader.js で拡張子による分岐を追加

**HTML表示（HtmlRenderer.jsx）:**
- HTMLファイルの内容をサンドボックス化して表示する
- 方式: `<iframe sandbox="allow-same-origin" srcdoc={htmlContent}>` を使用
  - scriptの実行を許可しない（sandbox属性でブロック）
  - 外部リソース（CSS、画像）は読み込めない前提
  - iframeにはテーマのCSS変数を注入する（背景色・文字色だけ合わせる）
- ページネーション: 非対応（スクロールモード固定）。HTML文書はCSS multi-columnとの相性が悪いため
- チャプターナビ: 非表示（単一文書扱い）

**JSON表示（JsonRenderer.jsx）:**
- JSONをパースし、整形（インデント付き）で表示する
- シンタックスハイライト: キー名、文字列、数値、真偽値を色分け
  - CSS変数のテーマカラーに合わせた配色（ライブラリ不使用、自前CSS）
- 折りたたみ: オブジェクト/配列を開閉可能にする（クリックでトグル）
- 大規模JSON（1MB超）の場合: 最初の1000行まで表示し、「続きを表示」ボタン
- ページネーション: 非対応（スクロールモード固定）
- フォント: コードブロック用の等幅フォント（--font-code）を使用

**データフローの変更:**

現在のApp.jsxは `mkbData` を前提にしている。これを抽象化する:
```typescript
type ViewerContent =
  | { type: 'mkb'; data: MkbData }         // 既存
  | { type: 'html'; content: string }       // 新規
  | { type: 'json'; content: string }       // 新規
  | { type: 'images'; images: ImageEntry[] } // §11で追加
```
App.jsxのビューア画面で`type`に応じてレンダラーを切り替える。

**制約:**
- HTML内の`<script>`は実行しない
- HTML内の外部CSSやフォントは読み込まない（ローカルHTML前提）
- JSON内にバイナリデータ（base64画像等）が含まれていても特別な処理はしない
- 設定パネルからのフォント・テーマ切替はHTML/JSON表示にも影響する（背景色・文字色のみ）

### §11: 画像ビューアモード + CBZ対応

**何を:** 画像ファイル（単体/複数）、画像のみのZIP（CBZ含む）を1ページ1画像で表示し、スワイプで送れるようにする。また、MD内の画像を含むmkbでも画像が正しく表示されるようにする。

**入力フォーマットの拡張:**

| フォーマット | 判定方法 | 対応 |
|---|---|---|
| .cbz | 拡張子 | ZIPとして展開、画像のみ抽出 |
| .zip | 拡張子 + 中身判定 | MDを含めばmkb扱い、画像のみなら画像ビューア |
| .jpg/.jpeg/.png/.gif/.webp | 拡張子 | 単体画像表示 |
| 画像複数選択 | input multiple | 画像ビューアモード |
| .mkb（画像のみ） | ZIP展開後にMDなし | 画像ビューア |

**ファイル選択の拡張:**
- accept に `.cbz,.zip,.jpg,.jpeg,.png,.gif,.webp` を追加
- `<input>` に `multiple` 属性を追加（画像複数選択対応）

**mkbParser.jsの変更:**
ZIP展開後の判定ロジック:
```
1. index.md が存在する → 従来通りmkb処理
2. .md ファイルが1つ以上存在する → mkb処理（最初のMDをindex扱い）
3. MDファイルなし + 画像ファイルあり → 画像ビューアモード
4. 上記いずれでもない → エラー表示
```

**ImageViewer.jsx:**

表示方式:
- 1ページ1画像。`img`要素を `width: 100%; height: 100vh; object-fit: contain` で配置
- 背景はテーマの背景色（--color-bg）
- 画像の並び順: ファイル名の自然順ソート（page1, page2, page10 の順）
  - 自然順ソート: 数値部分を数値として比較（`localeCompare('en', { numeric: true })`）

ナビゲーション:
- タップ: 右半分 → 次画像、左半分 → 前画像（§4と同じ操作体系）
- スワイプ: §7のスワイプ方向設定に従う
- キーボード: 左右矢印
- ページインジケーター: 「3 / 12」形式（§4と同じ）

ピンチズーム:
- 二本指ピンチで拡大/縮小（CSS transformで実装）
- ダブルタップで等倍/フィットの切替
- ズーム中はスワイプによるページ送りを無効化

ヘッダー:
- タイトル: ZIPファイル名 or 「画像」
- チャプターナビ: 非表示
- 設定パネル: テーマ切替のみ有効（フォント・余白はテキスト用なので無関係）

**MD内画像の表示モード判定:**

MD内に埋め込まれた画像は、サイズに応じて3つの表示モードを自動選択する。
判定基準は画像の長辺とビューポート幅の比率。

| 表示モード | 判定条件 | 表示方法 |
|---|---|---|
| インライン | 長辺 ≤ ビューポート幅 × 閾値A | テキスト行内に流す。前後の文と連続 |
| ブロック | 閾値A < 長辺 ≤ ビューポート幅 × 閾値B | 段落間に中央配置。前後に余白。max-width: 100% |
| フルページ | 長辺 > ビューポート幅 × 閾値B | break-before: columnで強制改ページ。object-fit: containで1ページ全面表示 |

閾値はプリセットで選択する:

| プリセット | 閾値A（インライン上限） | 閾値B（フルページ下限） | 想定用途 |
|---|---|---|---|
| 文章優先 | 15% | 90% | 論文・技術文書。画像はあくまで補助 |
| バランス | 25% | 75% | 一般的な文書。挿絵と文章が共存 |
| 画像優先 | 10% | 50% | 絵本・図鑑的。画像を大きく見せたい |

実装方式:
- MarkdownRenderer.jsxのimgカスタムコンポーネントで、画像のonLoadイベントから自然サイズ（naturalWidth/naturalHeight）を取得
- ビューポート幅との比率を計算し、CSSクラス（`img-inline` / `img-block` / `img-fullpage`）を付与
- フルページ画像には `break-before: column; width: 100%; height: calc(100vh - ヘッダー高さ); object-fit: contain` を適用
- 画像読み込み前は `img-block`（デフォルト）として仮配置し、読み込み後にクラスを差し替える

設定パネルへの追加:
- 「画像表示」セクションを新設し、プリセット3択（文章優先/バランス/画像優先）を配置
- useSettings.jsに `imageDisplayMode: 'balance'` を追加

**画像タップ拡大:**

全表示モード共通:
- 画像をタップすると拡大表示する（モーダルで100vw × 100vh、object-fit: contain）
- 拡大表示中にピンチズームで更に拡大可能
- モーダル外タップ or 戻るボタンで閉じる

**制約:**
- 動画ファイルは非対応
- アニメーションGIFは静止画として表示する（ブラウザ任せ — 実際にはアニメーション再生される）
- HEIC/HEIF形式は非対応（ブラウザサポートが不完全）

### §12: 画像リサイズ

**何を:** 本棚に保存する際、大きな画像をリサイズしてIndexedDBの容量を節約する。

**リサイズルール:**
- 対象: mkb/CBZ/ZIP内のassets/画像、および単体画像ファイル
- 条件: 長辺が2048pxを超える場合にリサイズ
- リサイズ先: 長辺2048px（アスペクト比維持）
- 品質: JPEG 85%（PNG→JPEG変換はしない。PNGのままリサイズ）
- 処理タイミング: 本棚保存時（`saveBook()`呼び出し時）
- 閲覧のみ（保存しない）の場合はリサイズしない

**useImageResize.js:**
```typescript
type ResizeOptions = {
  maxLongSide: number;  // デフォルト2048
  jpegQuality: number;  // デフォルト0.85
};

resizeImage(blob: Blob, options?: ResizeOptions): Promise<Blob>
// Canvas APIでリサイズ。元のMIMEタイプを維持
```

処理フロー:
1. `saveBook()`が呼ばれる
2. ファイルタイプがmkb/cbz/zipの場合:
   a. ZIPを展開
   b. 各画像ファイルに対してresizeImageを適用
   c. リサイズ後の画像でZIPを再構築
   d. 再構築したZIPバイナリをfileDataとして保存
3. ファイルタイプが単体画像の場合:
   a. resizeImageを適用
   b. リサイズ後のBlobをfileDataとして保存

**制約:**
- リサイズ処理はメインスレッドで行う（Web Workerは将来最適化）
- 大量の画像を含むZIP（50枚以上）の場合、処理に数秒かかる可能性がある。プログレス表示を入れる
- 2048pxの上限値はハードコード（将来設定化の余地あり）

### §13: ページネーション禁則改善

**何を:** CSS multi-columnでのページ分割時に、見出し・段落・リスト項目の不適切な分割を軽減する。

**追加CSSルール（reader.css）:**

```css
/* 見出しの孤立防止: 見出しの直後でページが切れないようにする */
.markdown h1, .markdown h2, .markdown h3,
.markdown h4, .markdown h5, .markdown h6 {
  break-after: avoid;
}

/* 段落・リストの分割制御 */
.markdown p, .markdown li {
  orphans: 2;    /* ページ末尾に最低2行残す */
  widows: 2;     /* ページ先頭に最低2行残す */
}

/* 引用ブロック・コードブロックの分割回避 */
.markdown blockquote, .markdown pre {
  break-inside: avoid;
}

/* テーブルの分割回避 */
.markdown table {
  break-inside: avoid;
}

/* 画像の分割回避（既存、再確認） */
.markdown img {
  break-inside: avoid;
}

/* リスト全体は分割可能だが、個々の項目は保護 */
.markdown li {
  break-inside: avoid;
}
```

**Paginator.jsxの改善:**

ページ計算の安定化:
- 現状: コンテナのscrollWidth / viewportWidthでページ数を算出
- 問題: フォント読み込み完了前にページ数を計算すると、フォント変更後にずれる
- 対策: `document.fonts.ready`を待ってからページ数を計算する
- 追加: フォント変更時にページ数を再計算するトリガーを入れる

画像読み込み待ち:
- MD内の画像が読み込まれる前にページ数を計算すると、画像表示後にずれる
- 対策: コンテナ内の全`<img>`のloadイベントを待ってからページ数を確定する
- タイムアウト: 5秒以内に全画像が読み込まれない場合は現在の値で確定

**制約:**
- `break-after: avoid` 等のCSS制御はブラウザのベストエフォート。完全な禁則制御は不可能
- 非常に長いコードブロック（1ページに収まらない）は分割される（`break-inside: avoid`を無視）
- orphans/widowsのサポートはChromeでは良好

## 4.5 設定パネル設計原則（Phase 2 §7の改訂）

**原則: プリセットで選ばせる。数値は上級者向けの補助。**

Phase 2で作成したSettingsPanel.jsxを以下の方針で改訂する:

セクション分割:
- 全設定を1画面に並べず、セクション（アコーディオン or タブ）で分割する
- 各セクションの主UIはプリセット選択（2〜4択のボタン）
- スライダー・数値入力は「詳細設定」として折りたたむ。デフォルトでは非表示

| セクション | プリセット | 詳細（折りたたみ） |
|---|---|---|
| 文字 | ゆったり / 標準 / コンパクト | フォントサイズ、行間、余白のスライダー |
| フォント | Noto / Shippori / Zen Old Mincho | （プレビューのみ） |
| テーマ | ライト / ダーク / セピア | （なし） |
| 操作 | 左右スワイプ / 上下スワイプ | （なし） |
| 区切り線 | 改ページ / 線 / 余白 / 装飾 | （なし） |
| 画像表示 | 文章優先 / バランス / 画像優先 | 閾値の数値調整 |
| 表示モード | ページ送り / スクロール | （なし） |

プリセットを選んだ時点で関連する数値が全て連動して変わる。
プリセット選択後に詳細を開いて微調整した場合、プリセット選択状態は解除される。

**この改訂はPhase 3aのスコープに含める。** §11の画像表示プリセット追加と併せて、SettingsPanel全体を再構成する。

## 4.6 グローバル設定とローカル設定の二層構造

**原則: 原本は変更しない。全ての変更はローカル設定として保存する。**

設定を「アプリ全体のデフォルト（グローバル）」と「ファイルごとの上書き（ローカル）」の二層にする。ローカル設定が存在すればそちらを優先し、なければグローバルにフォールバックする。

さらに将来（Phase 3b）では、テキスト編集や画像挿入もファイルの書き換えではなく、ローカル設定内のパッチとして保存する。原本を一切変更しない非破壊編集モデル。

**データ構造:**

BookEntry（§8で定義済み）への追加:
```typescript
type BookEntry = {
  // ...既存フィールド（id, title, author, fileType, fileData, addedAt, lastOpenedAt）

  localSettings?: LocalSettings;  // 新規追加
};

type LocalSettings = {
  // 表示設定の上書き（undefinedならグローバル設定に従う）
  display?: {
    fontFamily?: string;
    theme?: string;
    fontSize?: number;
    lineHeight?: number;
    contentPadding?: number;
    imageDisplayMode?: string;
    hrStyle?: string;
    swipeDirection?: string;
    viewMode?: string;  // 'pagination' | 'scroll'
  };

  // コンテンツ変更（Phase 3bで実装。Phase 3aではフィールド定義のみ）
  patches?: ContentPatch[];
  insertedAssets?: InsertedAsset[];
};

// Phase 3bで詳細化する型定義（Phase 3aでは予約のみ）
type ContentPatch = {
  chapterId: string;
  type: 'replace' | 'insert' | 'delete';
  position: number;     // 行番号
  content?: string;     // replace/insertの場合
};

type InsertedAsset = {
  path: string;         // 例: 'assets/inserted-001.png'
  data: ArrayBuffer;
  mimeType: string;
};
```

**設定の解決順序:**
```
表示に使う値 = localSettings.display.X ?? globalSettings.X ?? デフォルト値
```

**useSettings.jsの変更:**

Phase 2で作成したuseSettings.jsを拡張する:
- `getEffectiveSettings(bookId?)`: グローバルとローカルをマージした実効設定を返す
- `setLocalSetting(bookId, key, value)`: ローカル設定を保存
- `clearLocalSettings(bookId)`: ローカル設定を全削除（グローバルに戻す）
- ローカル設定はuseBookshelf.jsのBookEntry内に保存（localStorageではなくIndexedDB）

**設定パネルUIの変更:**

- 設定パネルのヘッダーに「この本 / すべての本」の切替を追加
  - 「この本」: ローカル設定を編集。上書きされた項目にはインジケータ（ドット等）を表示
  - 「すべての本」: グローバル設定を編集
- ローカル設定がある項目に「リセット」ボタン（グローバルに戻す）

**Phase 3aで実装する範囲:**
- BookEntryへのlocalSettingsフィールド追加
- useSettings.jsのグローバル/ローカルマージロジック
- 設定パネルの「この本 / すべての本」切替
- ローカル設定のインジケータとリセットボタン

**Phase 3bに委ねる範囲:**
- ContentPatchの実装（テキスト編集）
- InsertedAssetの実装（画像挿入）
- パッチ適用 → MKBエクスポート

**このモデルの利点:**
- 原本が常に保持される。いつでも「元に戻す」が可能
- ZIP再構築が「毎回の編集保存」から「MKBエクスポート時の一回」に減る
- 表示設定とコンテンツ変更が同じ枠組み（localSettings）で統一される
- Phase 3bの編集機能が「パッチを作成・保存するUI」に単純化される

## 5. テスト方針

| テスト対象 | 方法 | 合格条件 |
|---|---|---|
| §10: HTML表示 | 手動。簡単なHTML文書を開く | テーマの背景色・文字色が適用され、スクロールで読める |
| §10: HTML安全性 | 手動。script入りHTMLを開く | scriptが実行されないこと |
| §10: JSON表示 | 手動。Claude.aiエクスポートJSONを開く | 整形表示、色分け、折りたたみが動作する |
| §10: 大規模JSON | 手動。1MB超のJSONを開く | 表示が遅延なく開始される（全件表示は不要） |
| §11: CBZ | Pixel 10実機。CBZファイルを開く | 1ページ1画像で表示、スワイプで送れる |
| §11: 画像複数選択 | Pixel 10実機 | ファイルピッカーで複数画像を選択し、ビューアで表示 |
| §11: 画像のみZIP | 手動。画像だけのZIPを開く | 画像ビューアモードで表示される |
| §11: ピンチズーム | Pixel 10実機 | 二本指ピンチで拡大/縮小。ダブルタップで切替 |
| §11: 挿絵タップ拡大 | Pixel 10実機。画像入りmkbを開く | 画像タップでモーダル拡大表示 |
| §11: 画像表示モード | Pixel 10実機。大小混在の画像入りmkb | プリセット切替で画像の表示モードが変わる |
| §12: リサイズ | 手動。3000px超の画像を含むmkbを保存 | 保存後に画像が2048px以下になっている |
| §12: プログレス | 手動。20枚画像のZIPを保存 | リサイズ進捗が表示される |
| §13: 見出し禁則 | Pixel 10実機 | 見出しがページ末尾に孤立しない |
| §13: orphans/widows | Pixel 10実機 | 段落がページ末尾に1行だけ残らない |
| §13: フォント変更後 | Pixel 10実機 | フォント切替後にページ数が再計算される |
| 設定パネル | Pixel 10実機 | セクション分割、プリセット選択、詳細折りたたみが動作する |
| ローカル設定 | Pixel 10実機 | 「この本」でフォント変更→別の本を開くとグローバル設定で表示 |
| ローカルリセット | Pixel 10実機 | ローカル設定をリセットするとグローバルに戻る |

### テスト用ファイル

以下のテスト用ファイルを docs/test-files/ に用意する:
- test.html: 見出し・段落・リスト・テーブル・script入りのHTML
- test.json: Claude.aiエクスポートJSONの構造を模したサンプル（5会話分）
- test.cbz: 5枚のJPEG画像を含むCBZ（画像は小さな実画像）
- test-large-images.zip: 3000px超のPNG画像3枚（リサイズテスト用）

## 6. 入力フォーマット対応表（Phase 3a完了時点）

| フォーマット | 対応 | 表示モード | ページネーション |
|---|---|---|---|
| .mkb（MD含む） | Phase 1〜 | Markdown | ○ |
| .md | Phase 1〜 | Markdown | ○ |
| .txt | Phase 1〜 | プレーンテキスト | ○ |
| .html | **Phase 3a** | HTMLサンドボックス | ×（スクロール固定） |
| .json | **Phase 3a** | JSON整形表示 | ×（スクロール固定） |
| .cbz | **Phase 3a** | 画像ビューア | 独自（1ページ1画像） |
| .zip（画像のみ） | **Phase 3a** | 画像ビューア | 独自（1ページ1画像） |
| .zip（MD含む） | **Phase 3a** | mkb扱い | ○ |
| .jpg/.png/.gif/.webp | **Phase 3a** | 画像ビューア | 独自（単一画像） |
| 画像複数選択 | **Phase 3a** | 画像ビューア | 独自 |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1 | 2026-04-29 | 初版作成。§10〜§13 |
| v1.1 | 2026-04-29 | §11にMD内画像表示モード判定（3プリセット）を追加。§4.5に設定パネル設計原則（プリセット優先・セクション分割）を追加 |
| v1.2 | 2026-04-29 | §4.6にグローバル/ローカル設定の二層構造を追加。非破壊編集モデルの基盤定義 |
