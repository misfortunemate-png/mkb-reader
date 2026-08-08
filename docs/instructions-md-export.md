# mkb-reader 作業指示書 — §42 MD書き出し

発行日: 2026-08-08 ／ 発行者: クリーデ（PM） ／ 宛先: PG（Claude Code on フラン）
フロー: 簡略（PM裁量）。小規模機能追加。

---

## マニフェスト
| 種別 | リポジトリ内パス |
|---|---|
| 本指示書 | docs/instructions-md-export.md |
| 支給物 | なし |

## 何を・なぜ

MKBエクスポート（§16）は加工・画像挿入を含む再編集用途に適しているが、AIへの読み込みや他ツールへの受け渡しにはMarkdownの方が素直。既存のExportDialogにMDエクスポートを追加する。

## 作業範囲

### E-1: `exportMd` 関数の新設（src/hooks/useExport.js）

既存の `_buildMkbCore` と同じ入力（bookEntry, rewriteRules, title, applyRewrite）を受け取り、単一 `.md` ファイルをダウンロードする関数を追加する。

処理の流れ:
1. `_buildMkbCore` と同じ方法でチャプターを展開する（ft判定・index.md・pages/*.md）
2. 読み替え適用時: `applyRewrite` を呼ぶが、**画像差し込みを除外する**。具体的には、rulesから `insertedAssets` と `importedAssets` を除いたコピーを作って渡す
   ```js
   const rulesForMd = {
     ...rewriteRules,
     insertedAssets: [],
     importedAssets: [],
   };
   applyRewrite(content, rulesForMd, chapterId, { highlight: false, assetUrlOf: null });
   ```
3. チャプターの結合: 複数チャプターがある場合は `\n\n---\n\n` で区切って結合する。先頭はindex、以降はorder順
4. `downloadBlob` で `{タイトル}.md` としてダウンロード

### E-2: ExportDialogにMDボタン追加（src/components/ExportDialog.jsx）

- 既存の「↓ エクスポート」ボタン（MKB用）の**左隣**に「↓ MD」ボタンを追加する
- `settings-btn` クラス（activeなし）。MKBが `settings-btn active` のまま
- クリック時に `exportMd` を呼ぶ。引数は既存の `run()` と同じ（bookEntry, rewriteRules, title, author, applyRw）
- 「読み替えを適用する」チェックボックスはMKB・MD共有（既存のまま）
- busy / error 処理も既存と同じパターン
- 「書庫へ保存」はMD書き出しには不要（MKBのみ）

## 禁止事項

- 既存のMKBエクスポート処理（`_buildMkbCore` / `exportMkb` / `buildMkbBuffer`）を変更しない
- `downloadBlob` ヘルパは既存のものを再利用する（exportする必要があれば関数をexportに変更してよい）
- ExportDialogのレイアウト変更は最小限（ボタン追加のみ）

## テスト

### PG自己完結分
1. `npm run build` 成功
2. 単一チャプターのMDファイルを開き、MDエクスポート → .mdファイルがDLされ、内容が元テキストと一致すること
3. 複数チャプターのMKBファイルを開き、MDエクスポート → `---` 区切りで結合されていること
4. 読み替えルールがあるファイルで「読み替えを適用する」ON → 読み替え適用済み・画像差し込みなしのMDが出力されること
5. 「読み替えを適用する」OFF → 原本テキストそのまま（画像差し込みなし）のMDが出力されること

### 実機テスト（発注者に依頼）
1. Pixel 10でMKBファイルを開き、エクスポートダイアログで「↓ MD」が表示されること
2. タップしてMDファイルがDLされること

## 完了条件

- E-1, E-2 実装済み
- テスト項目1〜5 PG確認済み
- `npm run build` 成功
- _STATUS.md更新
- 5W1Hコミット
