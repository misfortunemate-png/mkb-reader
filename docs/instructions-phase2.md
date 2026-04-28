# mkb-reader 作業指示書（Phase 2: §5〜§9 + §4修正）

作成日: 2026-04-28
PM: クリーデ
対応仕様書: docs/spec-phase2.md

---

## 作業範囲

- 何を: ビューアの実用化（PWA・本棚・オフライン）と読書体験のカスタマイズ機能
- なぜ: 検証デプロイ合格を受け、日常使用に耐える状態にする（仕様書 §4修正 + §5〜§9）
- どこで: 既存リポジトリ `mkb-reader`

## 参照ドキュメント

- 仕様書: docs/spec-phase2.md（全ての実装判断の根拠）
- Phase 1仕様書: docs/spec-phase1.md（既存実装の参照）
- _STATUS.md: 作業開始前に必ず読むこと
- CLAUDE.md: リポジトリの規約を確認すること

## 作業手順

### Step 1: §4修正 — 画像表示バグ

1. 原因を調査する
   - build-test-mkb.mjsでtest.mkb内に実際の画像バイナリが含まれているか確認
   - mkbParser.jsのassets→Blob URL変換ロジックを確認
   - MarkdownRenderer.jsxのカスタムimgコンポーネントを確認
2. テスト用画像を実際のPNG画像に差し替える（プレースホルダではなく小さな実画像）
3. ローカルで画像表示を確認する

### Step 2: §9 PWA + オフライン対応

1. `npm install -D vite-plugin-pwa` でインストール
2. vite.config.jsにVitePWA設定を追加する（仕様書§9の設定コードに従う）
3. public/にPWAアイコンを配置する（icon-192.png, icon-512.png — 仮アイコン）
4. Service Workerの動作確認: ビルド後にオフラインでアプリが起動することを確認
5. Google FontsのruntimeCaching設定を確認

### Step 3: §8 本棚（仮実装）

**重要: §8は仮実装である。将来全面差替する前提で、以下の方針に従うこと。**
- useBookshelf.jsのインターフェース（saveBook, getBook, getAllBooks, deleteBook, updateLastOpened）は仕様書通りに安定させる
- Bookshelf.jsxは最小限のUI。装飾に凝らない
- ビューア本体との接点は「ファイルのバイナリを渡す/受け取る」のみ

1. useBookshelf.js を実装する
   - IndexedDB（DB名: mkb-reader、ストア名: books）
   - 仕様書記載のBookEntry型とインターフェースに従う
2. Bookshelf.jsx を実装する
   - 保存済みファイルのリスト表示（タイトル / 著者 / 追加日）
   - タップ → ファイルを開く
   - 左スワイプ → 削除確認 → 削除
   - ファイル選択ボタン（上部常設）
3. App.jsxを変更する
   - アプリ起動時に本棚画面を表示
   - 本棚 ↔ ビューアの画面遷移
4. ビューア画面のヘッダーに「本棚に保存」ボタン（ブックマークアイコン）を追加
   - タップ → saveBook()
   - 同名ファイルの上書き確認

### Step 4: §5 フォント選択

1. useSettings.jsにフォント設定を追加する（デフォルト: Noto Serif JP）
2. フォントの動的ロード関数を実装する
   - 選択フォントの`<link>`をheadに挿入
   - 未選択フォントの`<link>`を削除
   - `&display=swap`パラメータ付与
3. 欧文ペアリングフォント（Cormorant Garamond）もGoogle Fontsから読み込む
4. SettingsPanel.jsxにフォント選択UIを追加する
   - ラジオボタン3つ + プレビューテキスト

### Step 5: §6 テーマ切替

1. reader.cssにダーク・セピアのCSS変数を追加する（仕様書§6の定義に従う）
2. useSettings.jsにテーマ設定を追加する（デフォルト: light）
3. テーマ切替: `document.documentElement.setAttribute('data-theme', theme)`
4. SettingsPanel.jsxにテーマ選択UIを追加する（色見本ボタン3つ）

### Step 6: §7 表示カスタマイズ

1. useSettings.jsに全設定項目を追加する
   - fontSize: 18（14〜28）
   - lineHeight: 1.9（1.4〜2.4）
   - contentPadding: 1.5（0.5〜3.0）
   - swipeDirection: 'horizontal'（'horizontal' | 'vertical'）
   - hrStyle: 'page-break'（'page-break' | 'line' | 'space' | 'ornament'）
2. CSS変数への反映: `document.documentElement.style.setProperty()` で即時適用
3. SettingsPanel.jsxに以下を追加する
   - プリセットボタン3つ（ゆったり / 標準 / コンパクト）
   - フォントサイズ・行間・余白のスライダー（各値表示つき）
   - スワイプ方向トグル
   - ---表示方式の4択ラジオ
4. SettingsPanel.jsx全体をボトムシート形式で実装する（画面下部からスライドアップ）
5. MarkdownRenderer.jsxの`<hr>`カスタムコンポーネントで表示方式を分岐する
6. usePagination.jsにスワイプ方向の分岐を追加する
7. プリセット適用後のスライダー微調整でプリセット選択解除

### Step 7: 設定永続化の統合確認

1. 全設定項目がlocalStorageに保存されることを確認
2. アプリ再起動後に全設定が復元されることを確認
3. Phase 1で実装済みのページネーション/スクロール切替設定をuseSettings.jsに統合する

### Step 8: デプロイと実機確認

1. ビルド確認: `npm run build` が正常完了すること
2. `git push origin main` でGitHub Pagesにデプロイ
3. Pixel 10実機で全テスト項目（仕様書§5参照）を確認

## 禁止事項

- 仕様書に記載のない機能を追加しない
- 仕様書に記載のないファイルを新規作成しない
- 仕様書の原本を改変しない
- 本棚UI（Bookshelf.jsx）のスタイリングに凝らない（仮実装である）
- 仕様外の設計判断が必要な場合は作業を停止し報告する

## 完了条件

1. mkb内画像が Pixel 10 実機で正しく表示される
2. PWAとしてホーム画面に追加できる
3. オフラインでアプリが起動し、保存済みファイルが読める
4. ファイルを本棚に保存でき、再起動後も一覧に表示される
5. 本棚からタップでファイルを開ける
6. 本棚からスワイプでファイルを削除できる
7. 3種のフォント切替が即座に反映される
8. 3種のテーマ切替が即座に反映される
9. フォントサイズ・行間・余白のスライダー変更が即座に反映される
10. プリセット適用 → スライダー微調整が動作する
11. スワイプ方向の左右/上下切替が動作する
12. ---の4表示方式が正しく切り替わる（特に改ページ方式）
13. 全設定がアプリ再起動後も維持される
14. GitHub Pagesにデプロイされている
15. _STATUS.mdが更新されている

## コミットメッセージ形式

各コミットは以下の形式で記録すること:

```
[Phase2] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §N への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。
特に以下の箇所は意図を詳しく記述すること:
- useBookshelf.jsのインターフェース定義（「安定IF・差替不可」の注記）
- ---表示方式の分岐ロジック（スクロールモード時のフォールバック含む）
- Google Fontsの動的ロード/アンロード
