# mkb-reader 作業指示書（Phase 4d: §30 縦書き表示）

作成日: 2026-05-02
PM: クリーデ
対応仕様書: docs/spec-phase4.md
ブランチ: `feature/vertical`（mainから分岐）

---

## 作業範囲

- 何を: 縦書き表示機能の実装（fileType: 'vertical'、スクロールモード固定、writing-mode: vertical-rl）
- なぜ: 仕様書 §30
- どこで: 下記ファイル一覧参照

## 参照ドキュメント

- 仕様書: `docs/spec-phase4.md`（§2.1 BookEntry拡張、§4 機能仕様の§30）
- `_STATUS.md`: 作業開始前に必ず読むこと
- `CLAUDE.md`: リポジトリの規約を確認すること

## ブランチ運用

```
git checkout main
git checkout -b feature/vertical
```

このブランチは§27+§28（main上で進行）とは独立。merge先はmainだが、実機検証の結果次第で破棄する可能性がある。**mainの変更をこのブランチに取り込まないこと**（コンフリクトを避けるため、マージはPM判断で行う）。

## 対象ファイル

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| src/components/FileLoader.jsx | md/txt選択時に「縦書きとして読み込む」チェックボックス追加 |
| src/hooks/useMkbLoader.js | fileType='vertical' のパース分岐（md/txtと同じパーサー、ViewerContent type='vertical'） |
| src/App.jsx | ViewerContent type='vertical' の分岐追加。Paginatorにverticalフラグ伝播 |
| src/components/Paginator.jsx | verticalモード時: スクロールモード固定、writing-mode: vertical-rl、overflow-x: auto / overflow-y: hidden |
| src/components/SettingsPanel.jsx | verticalモード時: ページネーショントグル非表示、スワイプ方向非表示、タップゾーン非表示 |
| src/hooks/useSettings.js | fileType='vertical' 判定時の設定制限ロジック |
| src/hooks/useBookshelf.js | TYPE_BY_EXT / fileToBookEntry は変更不要（verticalはUI側で明示的に設定するため拡張子からの自動判定は行わない） |
| src/styles/reader.css | .vertical-mode スタイル追加 |

### 新規ファイル

なし。

## 禁止事項

- 仕様書に記載のない機能を追加しない
- 仕様書に記載のないファイルを新規作成しない
- ページネーションモード（CSS multi-column）での縦書き対応は行わない（スクロールモード固定）
- 設定での横書き/縦書き切り替え機能は実装しない（D-005: インポート時確定）
- BookEntry.fileData を変更しない
- mainブランチの変更を取り込まない

## 実装順序

1. **FileLoader.jsx** — チェックボックスUI追加。md/txt/markdownの場合のみ表示
2. **useBookshelf.js** — fileToBookEntry()にverticalフラグ受け取り口を追加（第3引数 or オプション）
3. **useMkbLoader.js** — fileType='vertical' の分岐。md/txtと同じパーサーを通し、ViewerContent type='vertical' を返す
4. **App.jsx** — type='vertical' の分岐追加
5. **Paginator.jsx** — verticalプロップ追加。trueの場合: viewMode='scroll'固定、.vertical-modeクラス付与
6. **reader.css** — .vertical-mode のスタイル定義
7. **SettingsPanel.jsx / useSettings.js** — vertical時の設定制限
8. **テスト用テキスト** — docs/test-files/ に短い縦書きテスト用テキスト（青空文庫から数段落）を配置

## 完了条件

- [ ] md/txtファイル選択時に「縦書きとして読み込む」チェックボックスが表示される
- [ ] mkb/cbz/html/json/画像ではチェックボックスが表示されない
- [ ] チェックONで読み込んだファイルが fileType='vertical' で保存される
- [ ] 縦書きファイルを開くとテキストが右→左に縦書き表示される
- [ ] 左方向スクロールで読み進められる（**実機検証必須**）
- [ ] 日本語フォント3種が縦書きで正しく表示される
- [ ] 半角英数字がtext-orientation: mixedで横倒し表示される
- [ ] ページネーションのトグルが非表示になっている
- [ ] 読み替え（rewrite）が縦書きファイルにも適用される
- [ ] 画像差し込みが縦書きフロー内で正しく配置される
- [ ] `npm run build` がエラーなく完了する
- [ ] _STATUS.md を更新していること

## リスク項目（実機検証で判断）

§30.6 に記載の通り、**縦書きの横スクロールがPixel 10 Chromeのタッチ操作で自然に動作するか**が最大のリスク。実装後に以下を報告すること:

1. タッチスクロールの方向は自然か（左スワイプで先へ進むか）
2. スクロール速度・慣性は縦スクロールと同等か
3. Paginator.jsxのスクロールモードのイベントハンドラに追加修正が必要だったか

自然に動作しない場合は作業を停止し報告すること。PMが設計変更または棚上げを判断する。

## コミットメッセージ形式

```
[Phase4d] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §30 への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。仕様書のセクション番号（§30）を参照に含めること。
