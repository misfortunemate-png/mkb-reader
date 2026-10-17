# mkb-reader 作業指示書 — 書庫へ保存の不具合修正（0.3.1）
文書種別: 権威文書

作成日: 2026-10-17 ／ PM ／ 対応仕様: docs/spec-phase6.md §36.3・§37（書庫への保存）／ 対応要件定義: なし（既存機能の不具合修正。簡略フロー）／ 関連Issue: mkb-reader#2（発端: mkb-reader#1 の完了報告 §5-1・§5-2）／ 本書一枚で完結（追補なし）

## 添付マニフェスト（着工前照合・必須）

以下がすべて交換所（リポジトリ）に存在すること。**1つでも欠けたら着工せず docs/reports/ に報告。**

| # | パス | 種別 | SHA-256（支給物のみ） |
|---|---|---|---|
| 1 | docs/instructions-library-save-fix.md | 本指示書 | — |
| 2 | docs/reports/chatgpt-import-report.md | 発端の報告（§5） | — |
| 3 | public/test-conversations.json | 既存の試験データ | — |
| 4 | public/test-chatgpt-conversations.json | 既存の試験データ | — |

支給物: なし

## PG運用規律（定型・全フェーズ共通）

1. **停止条件**: 仕様にない判断が必要／仕様どおりだと問題が生じる／技術的に実現困難または難航／セッション外プロセスの停止等の副作用がある操作。原因判明時は「原因X・対策Y・実行可否」で報告し指示を待つ
2. **支給物改変禁止**: PM支給物はdiffゼロで検収される。技術的整合の調整もPMへ差し戻す
3. **発注者指示による仕様外修正**: 発注者から直接指示を受けた修正は実施・効果確認してよい。報告時に「発注者の指示により実装/修正」と明記する。権威文書は書き換えない
4. **着工前**: `git pull` → inspect実行（マニフェスト照合・版確認）。緑でなければ着工しない。着工確認はチャット定型②で発話する
5. **稼働設定の変更三手順**: 稼働中の共有インフラ設定（ポート・serve/funnel等）に触れる場合は、状態記録→スクリプト一本で変更→差分確認の順とする（本件では触れない。稼働中の 8788 は再起動しない）

## 作業範囲

- **何を**: 書庫へ保存が 500 で失敗する不具合と、題名に「:」などを含む会話を保存すると壊れたファイルができる問題を直す
- **なぜ**: mkb-reader#1 の完了報告 §5-1（原因: `putFile` が Content-Type なしで PUT し、サーバーの `express.raw` が本文を解析しない）・§5-2（Windows で「:」を含むパスが代替データストリームになり、0 バイトの実体ができる）
- **どこで**: mkb-reader のクライアントのみ。server/ は変えない（稼働中のサーバーを再起動せずに直るほうを選ぶ。クラウド側の書庫サーバーにも同じ要求が届く）

### S-1 保存の要求に Content-Type を付ける（src/hooks/useRemoteLibrary.js）

- `putFile` の PUT に `Content-Type: application/octet-stream` を付ける。`libFetch` が付ける `Authorization` と併存すること
- `putFile` 以外の要求は変えない

### S-2 会話の題名から既定の保存先を作るときに、ファイル名に使えない文字を置き換える

- `src/utils/chatConverter.js` に、題名からファイル名を作る関数 `toSafeFileName(title)` を足して export する
  - `\ / : * ? " < > |` を全角の `＼ ／ ： ＊ ？ ＂ ＜ ＞ ｜` に置き換える（題名の読みやすさを保つため。「/」も置き換え、題名がフォルダの区切りにならないようにする）
  - 制御文字（U+0000〜U+001F）を取り除く
  - 末尾の空白とピリオドを取り除く
  - 結果が空なら `untitled` とする
- `src/components/ChatImporter.jsx` の2か所（141行・148行付近）の既定の保存先を `` `${toSafeFileName(mkb.metadata.title)}.mkb` `` にする

### S-3 保存ダイアログで、使えない保存先を送らない（src/components/SaveToLibraryDialog.jsx）

- 送信の前に、入力を「/」で区切った各部分を調べ、次のどれかに当たれば PUT を送らず、ダイアログ内に「保存先に使えない文字や形があります（\ : * ? " < > | ・空の部分・. ・..・末尾の空白やピリオド）」と出す
  - `\ : * ? " < > |` または制御文字を含む
  - 空の部分（先頭・末尾・連続の「/」）
  - `.` または `..` そのもの
  - 末尾が空白またはピリオド
- 当たらなければ現行どおり `onSave` を呼ぶ。「/」によるフォルダ指定（例: `chat/foo.mkb`）は現行どおり受け付ける
- 入力を書き換えて直したら、表示した文言は消す

### S-4 取込画面の補足文（src/components/ChatImporter.jsx）

- 229行付近の「Settings → Privacy → Export Data で取得した ZIP に同梱されています」は Claude.ai 向けなので、「Claude.ai・ChatGPT とも、設定からデータをエクスポートすると届く ZIP に同梱されています」に改める（mkb-reader#1 完了報告 §8-8）

### S-5 版

- `package.json`・`server/package.json`・`server/index.js` の `VERSION` を 0.3.0 → 0.3.1 に揃える（R-012）。ロックファイルの版は触らない

## 影響範囲（PM調査済み——「ここが全部だ」）

検索キーワード: `putFile` `onRequestSaveToLibrary` `SaveToLibraryDialog` `Export Data`（src/・server/、HEAD 1de9129）

| ファイル | 該当箇所 | 対応要否 |
|---|---|---|
| src/hooks/useRemoteLibrary.js | 82行付近 `putFile` | 要修正（S-1） |
| src/utils/chatConverter.js | 関数の追加 | 要修正（S-2） |
| src/components/ChatImporter.jsx | 141・148行（既定の保存先）・229行（補足文） | 要修正（S-2・S-4） |
| src/components/SaveToLibraryDialog.jsx | 20行付近 `handleSubmit` | 要修正（S-3） |
| package.json・server/package.json・server/index.js | 版 | 要修正（S-5） |
| src/components/ExportDialog.jsx | 70行付近 既定の保存先（`remoteItemPath` またはファイル名） | 確認のみ（変えない。S-3 の検査が保存の前にかかる） |
| src/App.jsx | 618行付近 `handleDoSaveToLibrary` | 対象外 |
| server/index.js | 141行 `rawParser`・252行 PUT | 対象外（版の行のみ S-5） |

表にない箇所を触る場合は停止条件1で報告すること。

## 作業手順

1. `git pull` → inspect 実行 → 着工確認（定型②）
2. 着工前に、変更前（1de9129）のコードで AC-1・AC-2 の negative control の赤を記録する
3. S-1 → S-5 の順に実装。各節ごとに5W1Hコミット
4. 検証計画を実行。書庫の試験は mkb-reader#1 と同じく、稼働中の 8788 に触れず、試験用の空の LIBRARY_ROOT で別ポートに起動したサーバーで行う
5. `npm run build`・inspect 緑・_STATUS.md 更新・push

## 禁止事項

- server/ の振る舞いを変えること・稼働中のサーバーを再起動すること
- Claude.ai・ChatGPT の変換結果（MD）を変えること
- 本書の範囲外の整理（ロックファイルの版合わせ、連続する assistant 発言の統合など）

## 検証計画（受入基準との対応・これが検収の正になる）

| AC | 検証項目（手順） | 手段 | 証跡様式 | negative control |
|---|---|---|---|---|
| AC-1 | ChatGPT の見本「分岐あり」と Claude.ai の見本「短い雑談」をそれぞれ「変換して書庫へ保存」し、PUT が 200、書庫のファイルの大きさが送った mkb と一致し、索引に出て、開いて読めること | PG実行（ブラウザ操作） | 操作記録・PUT の応答・ファイルの大きさ・索引の応答 | 有（変更前は PUT 500） |
| AC-2 | Claude.ai の見本「技術相談: CSS multi-column の罠」を書庫へ保存するとき、既定の保存先が `技術相談： CSS multi-column の罠.mkb` になり、保存後に書庫にその名前の実ファイル（0 バイトでない）ができ、「技術相談」という0バイトのファイルができないこと | PG実行（ブラウザ操作＋書庫フォルダの一覧） | ダイアログの既定値・`dir /r` 等の書庫フォルダ一覧 | 有（変更前は既定値に「:」が入る） |
| AC-3 | `toSafeFileName` に、`a:b`・`a/b`・`a\b`・`*?"<>|`・`題名. `・制御文字入り・空文字 を渡し、期待どおりの結果になること | PG実行（node の単体試験） | 生ログ（入力と出力の対照） | 該当なし |
| AC-4 | 保存ダイアログで `a:b.mkb`・`foo?.mkb`・`sub//x.mkb`・`../x.mkb`・`x. ` を入れると文言が出て PUT が送られず、`chat/foo.mkb` は保存できること | PG実行（ブラウザ操作。ネットワークの記録で PUT の有無を見る） | 操作記録・ネットワークの記録 | 該当なし |
| AC-5 | 本の書き出しからの「書庫へ保存」（§36.3）も 200 で保存でき、索引に出ること | PG実行（ブラウザ操作） | 操作記録・PUT の応答 | 該当なし |
| AC-6 | 既存の2つの試験データの変換結果（全会話・両分岐モード）が 1de9129 と一致すること | PG実行（diff） | diff 出力（差分なし） | 該当なし |
| AC-7 | inspect 全項目緑、`npm run build` 成功（既存の chunk size 警告のほかに新しい警告がない）、3か所の版が 0.3.1 で一致 | inspect | inspect 出力全文・build ログ | 該当なし |

- negative control は「変更前で赤の記録→変更後に緑」の両方を証跡に残す
- **実機系（発注者に依頼）**: Pixel 10 で書庫に接続した状態で、取り込んだ会話を1件「書庫へ保存」し、書庫の一覧に出て開けること。クラウド側の書庫サーバー（書庫サーバーURLを設定した場合）での保存は本件の検証範囲外とし、報告では「未検証」と明記する

## 完了条件

- S-1〜S-5 の実装
- 検証計画の全項目を実行し、証跡を完了報告に添付済み
- pull・push 実施済み。稼働中の 8788 は `dist/` をそのまま配信しているため、build 後の配信が 0.3.1 の画面になっていることを報告に記す（サーバーの再起動はしない）
- inspect緑・_STATUS.md 更新

## 報告基準

報告は docs/reports/library-save-fix-report.md に置く（AC対応表様式）。チャット発話は定型③または④のみ。コンテキスト圧縮後もこのセクションを読み返してから報告すること。

1. 実装内容の要約
2. **AC対応表**: | AC | 検証項目 | 結果 | 証跡（生ログ引用 or reports/内パス） |
3. inspect結果（緑/赤と出力の添付）・CI run URL（なければ「該当なし」）
4. 完了条件の各項に対する充足状況
5. 未完了・未検証の項目があれば列挙（#012・美化しない）
6. 発注者指示による仕様外修正があればその旨と内容
7. コミット・プッシュの実施状況
8. 書庫へ保存がいつから 500 になっていたか（`putFile` の呼び出し側が渡す本文の型の変化など、git の履歴で分かる範囲で一行）

## 発令文（PMがpush後チャットへ転写する）

```
【発令】mkb-reader 0.3.1 — 書庫へ保存の不具合修正
作業: 書庫へ保存の 500 と、「:」などを含む題名で壊れたファイルができる問題をクライアント側で直す
リポジトリ: misfortunemate-png/mkb-reader ／ Issue: mkb-reader#2
手順: git pull → docs/instructions-library-save-fix.md を読む
      → マニフェスト照合・inspect緑を確認して着工
報告先: docs/reports/library-save-fix-report.md（AC対応表様式）
```

## 改訂履歴

| 版 | 日付 | 変更者 | 内容 |
|---|---|---|---|
| v1.0 | 2026-10-17 | PM | 初版 |
