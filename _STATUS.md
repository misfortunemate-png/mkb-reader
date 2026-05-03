# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-05-03（Phase 4 §27+§28+§30 実装完了・実機検証待ち）
更新者: PG（Claude Code）

## 現在のフェーズ
**Phase 4 — §27+§28 実装完了（main）/ §30 実装完了（feature/vertical）— 実機検証待ち**

---

## 合格状況

| Phase | 範囲 | 実機検証 |
|---|---|---|
| Phase 1 | §1〜§4（読込・MD描画・チャプターナビ・ページネーション） | 合格 |
| Phase 2 | §5〜§9（フォント・テーマ・カスタマイズ・本棚・PWA） | 合格 |
| Phase 3a | §10〜§13（HTML/JSON/画像/CBZ・リサイズ・禁則）+ 設定パネル改訂 | 合格 |
| Phase 3b | §14〜§18（読み替え・画像差し込み・エクスポート・チャットログ変換） | 合格 |
| Phase 3c | §20〜§26（タップゾーン・欧文フォント・中断再開・コンテキストメニュー・UI磨き） | 合格 |
| Phase 4a/b | §27+§28（ソート・リネーム・タグ・ライブラリCRUD・ドリルダウン・編集モード） | 実機検証待ち |
| Phase 4d | §30（縦書き表示・vertical-rl・スクロール固定） | 実機検証待ち |

---

## Phase 4 作業計画

### ブランチ構成
```
main ──→ §27+§28（実装済み）──→ 実機検証 ──→ §29 ──→ 実機検証
feature/vertical ──→ §30（実装済み）──→ 実機検証 ──→ mainにmerge
```

### 進捗

| § | 内容 | ブランチ | 状態 |
|---|---|---|---|
| §27 | 層A本格化（ソート・リネーム・タグ） | main | 実装完了・実機検証待ち |
| §28 | 層B基盤（LibraryView・ツリー構造） | main | 実装完了・実機検証待ち |
| §29 | 層B編集（ファイル接続・画像切り出し・mkb変換） | main | §28合格待ち |
| §30 | 縦書き表示（vertical-rl・スクロール固定） | feature/vertical | 実装完了・実機検証待ち |

---

## §27+§28 実装内容（mainブランチ）

- `src/hooks/useBookshelf.js`: DB_VERSION=2、openDb()エクスポート、renameBook/addTag/removeTag追加
- `src/hooks/useLibrary.js`（新規）: Library/LibraryNode CRUD、findReferencingLibraries/removeNodesByBookId
- `src/components/Bookshelf.jsx`: ソートUI（最終閲覧日/追加日/タイトル・昇降順）、タグフィルタ、リネーム、削除時ライブラリ警告
- `src/components/LibraryView.jsx`（新規）: ライブラリ選択・ドリルダウン・編集モード・タッチDnD
- `src/App.jsx`: shelfView切り替えタブ、libraryContext（層B）、effectiveRewriteRules合成
- `src/styles/reader.css`: ライブラリUI・本棚拡張のスタイル追加

## §30 実装内容（feature/verticalブランチ）

- `src/components/FileLoader.jsx`: md/txt選択時に「縦書きとして読み込む」チェックボックス表示
- `src/hooks/useMkbLoader.js`: loadFile(file, opts) — opts.vertical=true で type='vertical' を返す
- `src/hooks/useBookshelf.js`: fileToBookEntry(file, meta, opts) — opts.vertical で fileType='vertical' 保存
- `src/App.jsx`: isVertical/mkb解決、handleOpenBook での vertical 検出、SettingsPanel に fileType 渡し
- `src/components/Paginator.jsx`: vertical prop 追加、スクロール固定、.vertical-mode クラス
- `src/styles/reader.css`: .vertical-mode スタイル（writing-mode: vertical-rl）
- `src/components/SettingsPanel.jsx`: vertical 時にページネーション・スワイプ・タップゾーンを非表示
- `docs/test-files/tategumi_test.txt`: 縦書きテスト用テキスト（吾輩は猫である・竹取物語）

---

## 仕様書・指示書

- 仕様書: `docs/spec-phase4.md`
- 指示書: `docs/instructions-phase4ab.md`（§27+§28用）
- 指示書: `docs/instructions-phase4d.md`（§30用、feature/verticalブランチ）
- §29の指示書は§28合格後にPMが作成する

---

## 次のアクション

- 誰が: PM（クリーデ）+ ショウゴ（実機検証：Pixel 10 Chrome）
- 何を:
  1. `npm run build && デプロイ`（mainブランチ: §27+§28、feature/verticalブランチ: §30）
  2. §27+§28 実機検証（ソート・タグ・ライブラリCRUD・ドリルダウン・タッチDnD）
  3. §30 実機検証（縦書き横スクロール — **最大リスク項目**。自然に動かなければ停止・報告）
  4. §29 実装開始（§28合格後）

## §30 実機検証チェックリスト

- [ ] md/txtファイル選択時にチェックボックスが表示される
- [ ] mkb/cbz/html/json/画像ではチェックボックスが表示されない
- [ ] 縦書きで開くとテキストが右→左方向に縦組みで表示される
- [ ] **左方向スワイプで自然に読み進められるか（最大リスク項目）**
- [ ] ページネーションのトグルが非表示になっている
- [ ] 読み替えが縦書きファイルにも適用される
- [ ] `npm run build` がエラーなく完了する（確認済み）
