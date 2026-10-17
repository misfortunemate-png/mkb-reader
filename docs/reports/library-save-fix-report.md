# 報告: 書庫へ保存の不具合修正（mkb-reader 0.3.1）

日時: 2026-10-17
PG: Claude Code on フラン
対応指示書: docs/instructions-library-save-fix.md（v1.0）／ 関連Issue: mkb-reader#2（発端 mkb-reader#1 報告 §5-1・§5-2）
着工: pull a2d1f88 ／ マニフェスト照合 OK（4件とも存在）／ inspect 緑（24 passed）

---

## 1. 実装内容の要約

| 節 | コミット | 内容 |
|---|---|---|
| S-1 | 9e04e1e | `src/hooks/useRemoteLibrary.js` `putFile`: PUT に `Content-Type: application/octet-stream` を付けた。`libFetch` は `options.headers` を複製して `Authorization` を足すので、両方が併存する。putFile 以外の要求は変えていない |
| S-2 | 357e63f | `src/utils/chatConverter.js` に `toSafeFileName(title)` を追加・export。`\ / : * ? " < > |` を全角の同形に置換、制御文字（U+0000〜U+001F）を除去、末尾の空白・ピリオドを除去、空なら `untitled`。`src/components/ChatImporter.jsx` の既定の保存先2か所を `` `${toSafeFileName(mkb.metadata.title)}.mkb` `` に（import 行に `toSafeFileName` を追加） |
| S-3 | 606bb05 | `src/components/SaveToLibraryDialog.jsx`: 送信前に保存先を「/」で区切った各部分を調べ、禁止文字・制御文字・空の部分・`.`・`..`・末尾の空白やピリオドに当たれば PUT を送らず、指示書どおりの文言をダイアログ内に出す。入力を変えると文言を消す。判定は既存の `relPath.trim()` 後（実際に送る値）に対して行う |
| S-4 | bfa7e6e | `src/components/ChatImporter.jsx`: 補足文を「Claude.ai・ChatGPT とも、設定からデータをエクスポートすると届く ZIP に同梱されています」に |
| S-5 | cd3be70 | `package.json`・`server/package.json`・`server/index.js` の版を 0.3.1 に（server は版の行のみ。ロックファイルは触らない） |

server/ の振る舞いは変えていない。稼働中の 8788 は再起動していない。

## 2. AC対応表

書庫の試験はすべて、稼働中の 8788 に触れず、`server/index.js` を PORT=8799・空の試験用 LIBRARY_ROOT（作業用一時フォルダ）で別起動して行った。画面は `http://127.0.0.1:8799/mkb-reader/`。変更前の記録は 1de9129 の build（`index-DrOyoJE1.js`）、変更後は 0.3.1 の build（`index-Z7c1wCj2.js`。試験前に Service Worker とキャッシュを消して読み直した）。

| AC | 検証項目 | 結果 | 証跡 |
|---|---|---|---|
| AC-1 | ChatGPT「分岐あり」・Claude.ai「短い雑談」を変換して書庫へ保存 → PUT 200・大きさ一致・索引に出る・開いて読める | **緑**（negative control 赤→緑） | 変更前: `PUT …分岐あり%3A…mkb → 500`（#1 試験時）、`PUT …技術相談%3A…mkb → 500`（本件着工前）。変更後: `PUT …分岐あり%EF%BC%9A…mkb → 200 OK`・`PUT …短い雑談.mkb → 200 OK`。書庫の実ファイルと、同じ会話を同じコードで変換した mkb との照合は付録A（大きさ 664／383 が一致・index.md が一致）。索引は付録B。書庫タブから「技術相談」「分岐あり」を開き、本文が描画された（分岐あり: 【新しい枝】の6発言、1/2 ページ） |
| AC-2 | 「技術相談: CSS multi-column の罠」の既定の保存先が `技術相談： CSS multi-column の罠.mkb`、その名前の実ファイル（0 バイトでない）ができ、0 バイトの「技術相談」ができない | **緑**（negative control 赤→緑） | 変更前の既定値: `技術相談: CSS multi-column の罠.mkb`。変更後の既定値: `技術相談： CSS multi-column の罠.mkb`。書庫フォルダの一覧とストリーム一覧（付録C）: `技術相談： CSS multi-column の罠.mkb` 1047 バイト、ストリームは `:$DATA` のみ。「技術相談」というファイルはない |
| AC-3 | `toSafeFileName` の単体試験 | **緑** | 13 件すべて PASS（付録D） |
| AC-4 | ダイアログで `a:b.mkb`・`foo?.mkb`・`sub//x.mkb`・`../x.mkb`・`x. ` は文言が出て PUT なし、`chat/foo.mkb` は保存できる | **緑** | 5 件とも文言が表示されダイアログが残った（`a:b.mkb` の文言全文:「保存先に使えない文字や形があります（\ : * ? " < > | ・空の部分・. ・..・末尾の空白やピリオド）」）。入力を1文字変えると文言が消えた。ネットワークの記録では、直前の `GET …分岐あり…mkb`（27820.5490）と `PUT …chat%2Ffoo.mkb → 200 OK`（27820.6037）の間に PUT はない。索引に `chat/foo.mkb (643)` |
| AC-5 | 本の書き出しからの書庫へ保存（§36.3）が 200 で保存でき、索引に出る | **緑** | 本棚の「単純な往復」を開く → エクスポート → 書庫へ保存 → 既定値 `単純な往復_ 朝の散歩コース.mkb`（ExportDialog 側の既存の名前付け）のまま保存 → `PUT …単純な往復_%20朝の散歩コース.mkb → 200 OK`、索引に `単純な往復_ 朝の散歩コース.mkb (643)` |
| AC-6 | 既存の2つの試験データの変換結果（全会話・両分岐モード）が 1de9129 と一致 | **緑** | 着工前に 1de9129 のコードで取った出力（Claude.ai 257行・ChatGPT 479行）と変更後の出力を `diff` → 両方とも終了コード 0（差分なし） |
| AC-7 | inspect 全緑・build 成功（既存の chunk size 警告のほかに新しい警告なし）・版 0.3.1 で一致 | **緑** | inspect 24 passed 0 failed（付録E）。build 成功、警告は既存の chunk size（830.39 kB）のみ。版は3か所 0.3.1。lint は変更した4ファイルとも、指摘の規則の集合が 1de9129 と同一（新規指摘なし） |

## 3. inspect 結果・CI

- inspect: **緑**（24 passed, 0 failed, 0 warnings）全文は付録E
- CI run URL: 該当なし

## 4. 完了条件の充足状況

| 完了条件 | 状況 |
|---|---|
| S-1〜S-5 の実装 | 充足（5コミット） |
| 検証計画の全項目を実行し証跡を添付 | 充足（AC-1〜AC-7 すべて緑）。実機系は §5 |
| pull・push | 実施（§7） |
| 稼働中 8788 の配信 | `http://127.0.0.1:8788/mkb-reader/` の index.html は `assets/index-Z7c1wCj2.js`（0.3.1 の build と同じ）を読み込んでいる → 画面は 0.3.1。サーバーは再起動していないので `/healthz` は `{"ok":true,"version":"0.2.0","files":18}` のまま。S-1 の修正はクライアント側なので、再起動なしで 8788 にも効く |
| inspect 緑・_STATUS.md 更新 | 充足 |

## 5. 未完了・未検証の項目

1. **実機系（発注者に依頼）**: Pixel 10 で書庫に接続した状態で、取り込んだ会話を1件「書庫へ保存」し、書庫の一覧に出て開けること — 未実施。なお Pixel 10 の PWA は Service Worker が古い build を持っている可能性がある。保存が 500 のままなら、アプリを開き直して更新を当ててから試してほしい
2. **クラウド側の書庫サーバー（書庫サーバーURLを設定した場合）での保存**: 指示書どおり本件の検証範囲外で、**未検証**
3. 稼働中の 8788 の healthz の版（0.2.0）は、再起動するまで上がらない（本件では再起動しない）

## 6. 発注者指示による仕様外修正

なし。

## 7. コミット・プッシュ

- 9e04e1e S-1 ／ 357e63f S-2 ／ 606bb05 S-3 ／ bfa7e6e S-4 ／ cd3be70 S-5 ／ 本報告と _STATUS.md 更新の報告コミット
- origin/main へ push 済み
- 作業ツリーに元からあった無関係の変更（public/ の削除・更新・未追跡のメディア類、docs/reports/cloud-settings-report.md）はコミットに含めていない

## 8. 書庫へ保存がいつから 500 だったか

書庫へ保存を入れた最初のコミット e8cef64（2026-07-23 Phase 6）から、`putFile` は ArrayBuffer（ChatImporter・ExportDialog とも JSZip の `type: 'arraybuffer'`）を Content-Type なしで PUT しており、サーバーは当初から `express.raw({ type: '*/*' })`（ac9adbb で PUT 限定に移しただけ）なので、本文の型が途中で変わったのではなく、導入時から 500 だった。Phase 6 の報告（phase6-report.md）では「チャットログ変換→書庫へ保存→一覧反映」が実機未検証項目4として残っていた。

## 補足（判断を要した点）

- S-2 の「末尾の空白」と S-3 の「末尾が空白」は、どちらも正規表現 `\s`（全角空白などの Unicode 空白を含む）で判定した。両者の判定をそろえ、S-2 で作った既定値が S-3 で弾かれないようにするため
- S-3 の判定は、既存の処理どおり前後の空白を落とした値（実際に送る値）に対して行う。したがって AC-4 の `x. ` は `x.`（末尾ピリオド）として弾かれる
- 制御文字の判定は U+0000〜U+001F（指示書の範囲）。U+007F は残す（付録D の7件目）

---

## 付録A: AC-1・AC-2 書庫の実ファイルと変換結果の照合

~~~~
分岐あり: file="分岐あり： 質問を編集・再生成した会話.mkb" size=664 expectedZipSize=664 sizeMatch=true index.mdMatch=true yamlTitle="title: '分岐あり: 質問を編集・再生成した会話'"
短い雑談: file="短い雑談.mkb" size=383 expectedZipSize=383 sizeMatch=true index.mdMatch=true yamlTitle="title: 短い雑談"
技術相談: file="技術相談： CSS multi-column の罠.mkb" size=1047 expectedZipSize=1047 sizeMatch=true index.mdMatch=true yamlTitle="title: '技術相談: CSS multi-column の罠'"
~~~~

## 付録B: 試験用書庫の索引（AC-1・AC-2 保存直後の /api/library/index）

~~~~
{"version":1,"generatedAt":"2026-10-17T05:12:44.951Z","files":[{"path":"分岐あり： 質問を編集・再生成した会話.mkb","kind":"mkb","title":"分岐あり: 質問を編集・再生成した会話","size":664,"mtime":"2026-10-17T05:12:12.430Z","meta":{"chapters":1,"tags":[]}},{"path":"短い雑談.mkb","kind":"mkb","title":"短い雑談","size":383,"mtime":"2026-10-17T05:12:41.720Z","meta":{"chapters":1,"tags":[]}},{"path":"技術相談： CSS multi-column の罠.mkb","kind":"mkb","title":"技術相談: CSS multi-column の罠","size":1047,"mtime":"2026-10-17T05:12:44.940Z","meta":{"chapters":1,"tags":[]}}]}
~~~~

## 付録C: AC-2 書庫フォルダの一覧とストリーム（AC-1・AC-2 保存直後）

~~~~
$ ls -la lib44
total 17
drwxr-xr-x 1 la_fr 197609    0 Oct 17 14:12 .
drwxr-xr-x 1 la_fr 197609    0 Oct 17 14:13 ..
-rw-r--r-- 1 la_fr 197609  664 Oct 17 14:12 分岐あり： 質問を編集・再生成した会話.mkb
-rw-r--r-- 1 la_fr 197609 1047 Oct 17 14:12 技術相談： CSS multi-column の罠.mkb
-rw-r--r-- 1 la_fr 197609  383 Oct 17 14:12 短い雑談.mkb

$ Get-Item -Stream * （全ファイル）
分岐あり： 質問を編集・再生成した会話.mkb | stream=:$DATA | 664 bytes
技術相談： CSS multi-column の罠.mkb | stream=:$DATA | 1047 bytes
短い雑談.mkb | stream=:$DATA | 383 bytes
~~~~

## 付録D: AC-3 toSafeFileName 単体試験

~~~~
PASS "a:b" → "a：b"
PASS "a/b" → "a／b"
PASS "a\\b" → "a＼b"
PASS "*?\"<>|" → "＊？＂＜＞｜"
PASS "題名. " → "題名"
PASS "題名...   " → "題名"
PASS "a\u0000b\tc\u001fd\u007fe" → "abcd\u007fe"
PASS "\u0001\u0002" → "untitled"
PASS "" → "untitled"
PASS ". . ." → "untitled"
PASS null → "untitled"
PASS "技術相談: CSS multi-column の罠" → "技術相談： CSS multi-column の罠"
PASS "分岐あり: 質問を編集・再生成した会話" → "分岐あり： 質問を編集・再生成した会話"

=== ALL PASS (13 cases) ===
~~~~

## 付録E: inspect 出力全文

~~~~

=== mkb-reader inspect ===

[ 1. 必須ファイル ]
  ✓ server/index.js
  ✓ server/resolveSafe.js
  ✓ server/resolveSafe.test.mjs
  ✓ server/package.json
  ✓ server/.env.example
  ✓ scripts/inspect.mjs
  ✓ src/hooks/useRemoteLibrary.js
  ✓ src/components/RemoteLibraryView.jsx
  ✓ src/components/SaveToLibraryDialog.jsx
  ✓ library-backup.bat
  ✓ docs/start-all-v4-append.bat

[ 2. バージョン整合 ]
  ✓ root package.json (0.3.1) === server/package.json (0.3.1)
  ✓ server/index.js VERSION (0.3.1) === 0.3.1

[ 3. resolveSafe 経由検査 ]
  ✓ resolveSafe imported
  ✓ 全 fs.* 操作が安全な変数を経由している

[ 4. SWキャッシュ除外 ]
  ✓ /api/ が NetworkOnly ルールに含まれる
  ✓ /healthz が NetworkOnly ルールに含まれる

[ 5. LIBRARY_ROOT ハードコード検査 ]
  ✓ 書庫ファイルシステムパスのハードコードなし（デフォルト値除く）

[ 6. セキュリティ設定 ]
  ✓ server/.env が .gitignore に含まれる

[ 7. bat ファイル ASCII + CRLF確認 ]
  ✓ library-backup.bat: ASCII のみ
  ✓ library-backup.bat: CRLF改行
  ✓ docs/start-all-v4-append.bat: ASCII のみ
  ✓ docs/start-all-v4-append.bat: CRLF改行

[ 8. _STATUS.md 行数確認 ]
  ✓ _STATUS.md: 21 行（≤30）

=== 結果: 24 passed, 0 failed, 0 warnings ===

~~~~
