# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-04-29
更新者: PG（Claude Code）

## 現在のフェーズ
**Phase 12: Phase 3b 完了（モバイル表示問題は未解決のまま打ち切り）→ Phase 3c 仕様策定待ち**

---

## Phase 1〜Phase 3a の合格状況（前回までの記録）

| Phase | 範囲 | 実機検証 |
|---|---|---|
| Phase 1 | §1〜§4（読込・MD描画・チャプターナビ・ページネーション） | 合格 |
| Phase 2 | §5〜§9（フォント・テーマ・カスタマイズ・本棚・PWA） | 合格 |
| Phase 3a | §10〜§13（HTML/JSON/画像/CBZ・リサイズ・禁則）+ 設定パネル改訂 + global/local 二層 | 合格 |

---

## 完了事項（Phase 3b — §14〜§18 + チャットログ取込まわりの改善）

### 機能本体
- **§14 読み替え**: rewriteEngine.js（純粋関数）/ useRewrite.js / RewritePanel.jsx
  - 話者名 / テキスト置換 / 行非表示 のローカル設定 CRUD
  - rehype-raw 追加で `<mark class="rewritten">` ハイライト描画
  - SettingsPanel の「読み替えハイライト 表示/非表示」トグル
- **§15 画像差し込み**: ImageInserter.jsx
  - ファイルピッカー + プレビュー + alt + 行番号 + §12 リサイズ適用
  - InsertedAsset を localSettings.rewrite.insertedAssets に保存
  - rewriteEngine.applyInsertedAssets で行番号順に MD 内挿入
  - App.jsx で Blob URL キャッシュ管理（id → URL の Map、book 切替時に revoke）
- **§16 MKB エクスポート**: useExport.js / ExportDialog.jsx
  - 原本展開 → applyRewrite → 新 ZIP 構築 → `<a download>` でダウンロード
  - 「読み替え適用 ON/OFF」のみ。ハイライト保存オプションは仕様書から削除
- **§18 チャットログ変換**: chatConverter.js / ChatImporter.jsx
  - Claude.ai conversations.json → mkb 形式 ZIP（fileType:'mkb' で保存）
  - 話者名は `**human**` Bold MD として埋め込み（読み替え対象になる形）
  - メッセージ間は `---` 区切り（§7 表示方式設定が効く）
  - **ツリー構造（current_leaf_message_uuid + parent_message_uuid）対応**:
    - 「最終分岐のみ / 全分岐」トグル
    - 平坦リスト（parent 情報なし）への早期 return フォールバック
  - **拡張思考・ツールブロック対応**:
    - content[] 配列を走査し type='thinking'/'tool_use'/'tool_result' を `<details>` 折りたたみ表示
    - 既定で折りたたみ、応答本文を主役に

### 検証用導線
- 同梱サンプル `test-conversations.json`（5 会話: 技術相談 / 創作 / 拡張思考あり / 編集あり / 短い雑談）
- ウェルカム画面の「💬 チャットログ取込（取込フロー：5会話）」をタップで ChatImporter 自動 fetch
- 設定パネルに「データ管理（検証用）」セクション
  - 「本棚を全削除」（IndexedDB store.clear）
  - 「設定を初期値に戻す」（localStorage の `mkb-reader.settings.v1` 削除 + global を DEFAULTS へ）

---

## ❌ 未解決問題: モバイルレイアウトの異常表示

**症状**:
Pixel 10 実機で開くと、ページ全体が **デスクトップ幅（≈1080 CSS px）でレンダリング**され、
端末の物理表示で 38% 程度に縮小されて見える。フォントもアイコンも極小化。
本来 `width=device-width` で 412 CSS px viewport になるべきところが機能していない。

**ユーザー所見**:
- Phase 3b 前半までは正常（ピンチで拡大縮小可能、モバイル適正サイズ）
- 「スキップ理由を可視化したあたり（commit `bd8040c`）」から崩れ始めた印象
- ヘッダーで `mkb-reader` 左端、`取込 / 開く` ボタンが「はるか右」に陣取って見える

**潰した想定（→ いずれも症状解消せず）**:

1. **`@media (max-width: 480px)` でフォント/icon-btn 縮小** — 構造ではなくサイズだけの対症療法、ユーザー却下
2. **viewport meta に `minimum-scale=1.0` 追加** — ピンチアウト不可になり UX 悪化、却下
3. **`html, body { max-width: 100vw; overflow-x: hidden }` 防御** — 効果なし、ロールバックで除去
4. **`bd8040c` 以降 6 コミット rollback して `e3e5262` まで戻す** — 症状継続
5. **PWA アンインストール → 再インストール** — 症状継続
6. **「設定を初期値に戻す」（localStorage クリア）** — 症状継続
7. **「本棚を全削除」（IndexedDB クリア）** — 症状継続

**裏取りした事実**:
- preview を 1080×2424 viewport（Pixel 10 物理画素相当）にリサイズすると **ユーザーの screenshot とピクセル一致**で症状再現
- 412 viewport では `document.documentElement.scrollWidth = 412` で**はみ出し要素ゼロ**を確認（CSS overflow ではない）
- index.html の viewport meta は Phase 1 から `width=device-width, initial-scale=1.0, viewport-fit=cover` のまま変わっていない
- ビルド出力 `dist/index.html` も同じ viewport meta を持つ
- GitHub Pages の curl 確認で配信は正常（test.cbz 19.8MB が 200 で返る等）
- Service Worker の `skipWaiting + clientsClaim` は Phase 2 後半から設定済み

**有力仮説（未検証）**:

(A) **Chrome のサイト別 zoom 状態**が `misfortunemate-png.github.io` に対して 38% 程度で固定されている。
- これは PWA storage（IndexedDB / localStorage）ではなくブラウザ側の状態
- PWA 再インストールでは消えない可能性が高い
- 復旧手順: Android **設定 → アプリ → Chrome → ストレージ → サイト別ストレージ**
  から `misfortunemate-png.github.io` を選択して削除、または Chrome 全体のデータ削除

(B) **GitHub Pages の Service Worker が古いバンドルを永続的に返している**
- `skipWaiting + clientsClaim` は新 SW インストール後のクライアント全体の更新を保証するが、
  最初の SW が installed されたバージョンに何か別の問題があった可能性
- chrome://serviceworker-internals で確認すると分かるかもしれない

(C) **Pixel 10 の Chrome 設定で「ピンチ・ズーム」の強制有効化や、ページ拡大の自動補正が効いている**
- Settings → ユーザー補助 → テキストの拡大率 や 表示サイズ
- chrome://settings/accessibility 内の「ページのズーム」既定値

**未試行の対処候補**:

- **完全に新しいデバイス／ブラウザで動作確認**（Chrome 別プロファイル、Firefox、別 Android 端末）
  → これで正常表示なら Pixel 10 の固有状態が原因と確定できる
- **Android Chrome の「設定 → サイト設定 → ズーム」を一括リセット**
- **Chrome の DevTools リモートデバッグ**で Pixel 10 の実 viewport / DPR / zoom 値を読み取る
  - PC と USB 接続して `chrome://inspect` 経由
  - これで `window.innerWidth` / `window.devicePixelRatio` / `window.visualViewport.scale` を直接測れる
- **Pixel 10 の表示サイズ・フォントサイズ設定を確認**
  - 「設定 → ディスプレイ → 表示サイズ」を「大」にしている場合、Chrome 上でも基準が変わる
- **Pixel 10 で別の PWA アプリ（同サイズ規模）を確認**
  - 同様の症状が出るなら端末固有の表示問題、出ないなら本アプリ固有

---

## ファイル状態（Phase 3b 完了時点）

主要モジュール:
- `src/utils/chatConverter.js`: 平坦リスト対応 + content[] 走査 + 思考折りたたみ
- `src/utils/rewriteEngine.js`: 純粋関数、speakerNames → replacements → hiddenRanges → insertedAssets の順
- `src/hooks/useSettings.js`: global/local 二層 + resetGlobal 追加
- `src/hooks/useRewrite.js`: localSettings.rewrite の CRUD
- `src/hooks/useBookshelf.js`: deleteAllBooks, getLocalSettings, saveLocalSettings
- `src/hooks/useExport.js`: exportMkb（純粋関数モジュール）
- `src/components/`: ChatImporter, RewritePanel, ImageInserter, ExportDialog 新設

仕様書:
- `docs/spec-phase3b.md` v1.2: §0 設計思想（読み替え装置）+ ツリー追補 v1.2 + 思考追補 v1.1
- `docs/instructions-phase3b.md`

検証用ファイル:
- `public/test-conversations.json`: 5 会話のサンプル（編集あり・拡張思考あり含む）
- `docs/errorScreenshot/`: モバイル表示問題の Pixel 10 実機 screenshot 3 枚

---

## 次のアクション

- 誰が: PM（クリーデ）+ ショウゴ
- 何を:
  1. Phase 3c の仕様策定を進める（Google Drive 連携 / Phase 3a-c 残課題等）
  2. モバイル表示問題は **次のセッションで別件として深掘り**
     - 上記「未試行の対処候補」を優先順位付け
     - リモートデバッグで実 viewport 値の取得が最有効
  3. 縦書き（§17）も Phase 3c または別フェーズで策定

---

## 引き継ぎ向けの技術的補足

### 設計思想の要点（次セッションでも遵守）
- **原本不変**: BookEntry.fileData は何があっても触らない
- **読み替え = サイドカー**: 全変更は localSettings.rewrite に保存
- **rewriteEngine は pure**: 副作用ゼロ、UI から完全分離（将来の長押しメニュー等から再利用可能にする）
- **設定は二層**: global（localStorage）+ local（IndexedDB.BookEntry.localSettings.display）

### モバイル表示問題のデバッグ手順案
PC と Pixel 10 を USB 接続し、PC Chrome で `chrome://inspect/#devices` を開いて Inspect。
Console で次を実行すれば原因の絞り込みが可能:
```js
({
  innerWidth: window.innerWidth,                    // 期待: 412
  outerWidth: window.outerWidth,
  documentElementClientWidth: document.documentElement.clientWidth,
  visualViewportWidth: window.visualViewport?.width,
  visualViewportScale: window.visualViewport?.scale, // 期待: 1
  devicePixelRatio: window.devicePixelRatio,         // Pixel 10 想定 ~2.625
  zoom: getComputedStyle(document.documentElement).zoom,
});
```

`innerWidth` が 1080 なら viewport meta が無視されている → meta タグまたは Chrome 設定の問題。
`visualViewportScale` が 0.38 程度なら **Chrome のサイト固有ズームが 38%** で固定されている可能性大 → サイトデータ削除で解消。

### コミットログ（Phase 3b 関連）
```
908ce23 平坦リスト対応の再適用 + 設定を初期値に戻す
e3e5262 編集あり会話のツリー構造を実 Claude.ai 形式に修正
01ffdd7 取り込みフィルタ + サンプル取込導線 + 本棚全削除（検証用）
6a5c9d5 §18 ツリー構造を辿り「最終分岐のみ」を取り込む
cc5b62c §18 拡張思考・ツールブロックを折りたたみ表示
149fa8a §16 MKBエクスポート + 仕様書修正 + ステータス更新
f7a0c1d §15 画像差し込み（insertedAssets + ImageInserter）
fe84dea §14 読み替え（rewriteEngine + useRewrite + RewritePanel）
4d68f7f §18 チャットログ変換（Claude.ai JSON → mkb）
```

ロールバックで破棄済（再適用済の `selectActiveBranch` フィックスを除く）:
- bd8040c フィルタ緩和 + スキップ診断
- 98f60ad / 6d52ce3 / 79b6dd9 / 029c9a8 モバイル対症療法と撤回
