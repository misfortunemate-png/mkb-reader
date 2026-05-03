# mkb-reader 作業指示書（Phase 4a+4b: §27+§28）

作成日: 2026-05-02
PM: クリーデ
対応仕様書: docs/spec-phase4.md

---

## 作業範囲

- 何を: 層Aの本格化（§27: ソート・リネーム・タグ）と層Bの基盤（§28: ライブラリUI・ツリー構造・useLibrary.js）
- なぜ: 仕様書 §27, §28
- どこで: 下記ファイル一覧参照

## 参照ドキュメント

- 仕様書: `docs/spec-phase4.md`（§2 データモデル、§4 機能仕様の§27・§28）
- `_STATUS.md`: 作業開始前に必ず読むこと
- `CLAUDE.md`: リポジトリの規約を確認すること
- `docs/spec-phase3c-v2.md` §0: 設計思想（原本不変・プリセット優先・rewriteEngine純粋関数）

## 対象ファイル

### 変更ファイル

| ファイル | 変更内容 | 該当§ |
|---|---|---|
| src/hooks/useBookshelf.js | renameBook追加、tags CRUD追加、カスケード削除時のライブラリ参照確認 | §27 |
| src/components/Bookshelf.jsx | ソート機能、リネームUI、タグフィルタバー、削除警告の改善 | §27 |
| src/App.jsx | 本棚/ライブラリ切り替えタブ、LibraryOpenContext受け取り、層Bのedits重ね適用 | §27§28 |
| src/styles/reader.css | ライブラリUIのスタイル | §28 |

### 新規ファイル

| ファイル | 内容 | 該当§ |
|---|---|---|
| src/hooks/useLibrary.js | Library / LibraryNode の IndexedDB CRUD | §28 |
| src/components/LibraryView.jsx | ライブラリUI（ドリルダウン・編集モード・アイテム追加） | §28 |

### IndexedDB スキーマ変更

DB_VERSIONを1→2に上げる。onupgradeneededで:
- 既存 `books` ストアは変更しない（tagsはBookEntryのフィールドとして保存。専用インデックスは不要）
- 新規 `libraries` ストアを追加（keyPath: 'id', index: 'updatedAt'）

openDb()関数はuseBookshelf.jsに存在する。useLibrary.jsからも同じDBを開く必要があるため、openDb()を共通化するか、useLibrary.js側で同じDB_NAME/DB_VERSIONを参照すること。DB_VERSIONが一致しないとonupgradeneededが二重発火するため、**DB_VERSIONは1箇所で管理すること**。

## 禁止事項

- 仕様書に記載のない機能を追加しない
- 仕様書に記載のないファイルを新規作成しない（共通ユーティリティの抽出が必要な場合はPMに報告）
- 仕様書の原本（docs/spec-phase4.md）を改変しない
- 仕様外の設計判断が必要な場合は作業を停止し報告する
- useBookshelf.jsの安定IF（saveBook, getBook, getAllBooks, deleteBook, updateLastOpened）の戻り値型を変更しない。新規関数は追加の形で拡張すること
- BookEntry.fileData を変更しない

## 実装順序

1. **§27 ソート機能** — Bookshelf.jsxにソートUI追加、localStorageに保存
2. **§27 リネーム機能** — useBookshelf.jsにrenameBook追加、Bookshelf.jsxにUI追加
3. **§27 タグ機能** — BookEntryにtags追加、Bookshelf.jsxにタグフィルタバー追加
4. **§28 IndexedDB** — DB_VERSION=2、librariesストア新設、openDb共通化
5. **§28 useLibrary.js** — Library/LibraryNode CRUD実装
6. **§28 LibraryView.jsx** — ドリルダウンUI、編集モード、アイテム追加
7. **§28 App.jsx統合** — タブ切り替え、LibraryOpenContext受け取り、edits重ね適用
8. **§27 削除警告** — useLibrary.findReferencingLibraries を使った警告表示（§28のuseLibrary完成後）

## 完了条件

- [ ] ソート3基準が動作し、選択状態がリロード後に復元される
- [ ] リネームがBookshelf表示とヘッダー表示の両方に反映される
- [ ] タグの追加・削除・フィルタが動作する
- [ ] ライブラリの作成・リネーム・削除が動作する
- [ ] フォルダ作成、ドリルダウン、パンくず遷移が動作する
- [ ] 本棚からアイテムを追加し、ライブラリからタップで開ける
- [ ] 編集モードでドラッグ並び替えが動作する
- [ ] タブ切り替えで本棚/ライブラリが正しく表示される
- [ ] ライブラリ参照がある本の削除時に警告が表示される
- [ ] 既存機能（本の追加・削除・開く・読み替え・エクスポート）に回帰がない
- [ ] `npm run build` がエラーなく完了する
- [ ] _STATUS.md を更新していること

## コミットメッセージ形式

```
[Phase4] 作業タイトル

何を: 実装した内容
なぜ: 仕様書 §N への参照
どのように: 技術的アプローチ
テスト: 実行結果
```

## コード内コメント

各ブロックに「何を・なぜ」のコメントを残すこと。仕様書のセクション番号（§27, §28）を参照に含めること。
