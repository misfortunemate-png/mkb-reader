# mkb-reader 作業指示書 — §44 ChatGPT 会話の取込
文書種別: 権威文書

作成日: 2026-10-17 ／ PM ／ 対応仕様: docs/spec-phase3b.md §18（本書で ChatGPT 形式を追加）／ 対応要件定義: なし（発注者要求「Claude.ai と同じ仕様で取り込めればよい」2026-10-17。PM裁量の小規模機能追加）／ 関連Issue: mkb-reader#1 ／ 本書一枚で完結（追補なし）

## 添付マニフェスト（着工前照合・必須）

以下がすべて交換所（リポジトリ）に存在すること。**1つでも欠けたら着工せず docs/reports/ に報告。**

| # | パス | 種別 | SHA-256（支給物のみ） |
|---|---|---|---|
| 1 | docs/instructions-chatgpt-import.md | 本指示書 | — |
| 2 | docs/spec-phase3b.md | 仕様書（§18） | — |
| 3 | public/test-conversations.json | 既存の試験データ（回帰比較に使う） | — |

支給物: なし（ChatGPT 形式の試験データは PG が作る。下記 S-4）

## PG運用規律（定型・全フェーズ共通）

1. **停止条件**: 仕様にない判断が必要／仕様どおりだと問題が生じる／技術的に実現困難または難航／セッション外プロセスの停止等の副作用がある操作。原因判明時は「原因X・対策Y・実行可否」で報告し指示を待つ
2. **支給物改変禁止**: PM支給物はdiffゼロで検収される。技術的整合の調整もPMへ差し戻す
3. **発注者指示による仕様外修正**: 発注者から直接指示を受けた修正は実施・効果確認してよい。報告時に「発注者の指示により実装/修正」と明記する。権威文書は書き換えない
4. **着工前**: `git pull` → inspect実行（マニフェスト照合・版確認）。緑でなければ着工しない。着工確認はチャット定型②で発話する
5. **稼働設定の変更三手順**: 稼働中の共有インフラ設定（ポート・serve/funnel等）に触れる場合は、状態記録→スクリプト一本で変更→差分確認の順とする（本件では触れない想定）

## 作業範囲

- **何を**: §18 チャットログ取込で、ChatGPT のデータエクスポートに含まれる `conversations.json` を読めるようにする
- **なぜ**: 発注者要求。Claude.ai 形式と同じ仕様で取り込めればよい。§18 で「ChatGPT等は将来」と留保していた部分の実施
- **どこで**: mkb-reader（クライアントのみ。server/ の機能変更なし）

### 方式（PM指定）

ChatGPT 形式の会話を、読込の段階で**現行の Claude.ai 形式の会話オブジェクトに正規化**する。以降の会話一覧・空会話の除外・分岐の選択・MD組立・本棚保存・書庫へ保存は、現行コードをそのまま通す。形式は自動で判別し、利用者に選ばせない。

### S-1 形式判別と正規化（src/utils/chatConverter.js）

- 判別: 会話オブジェクトが `mapping`（オブジェクト）を持てば ChatGPT 形式とする。持たなければ現行どおり Claude.ai 形式として扱う
- 正規化の対応（PMの理解に基づく。実データと食い違えば停止条件1で報告）:

| 正規化後（Claude.ai 形式） | ChatGPT 形式の取り出し元 |
|---|---|
| `uuid` | `conversation_id`、無ければ `id` |
| `name` | `title` |
| `created_at` / `updated_at` | `create_time` / `update_time`（UNIX秒）を ISO 8601 文字列に |
| `model` | `default_model_slug`（無ければ省略） |
| `current_leaf_message_uuid` | `current_node` |
| `chat_messages[]` | `mapping` の各ノードのうち `message` を持つもの |
| 各メッセージの `uuid` | ノードの `id` |
| 各メッセージの `parent_message_uuid` | ノードの `parent`。ただし除外したノード（下記）を親に持つ場合は、除外されていない最も近い祖先につなぐ |
| 各メッセージの `sender` | `message.author.role`。`user`→`human`、`assistant`→`assistant`、`tool`→`assistant`（内容は道具の折りたたみに入れる） |
| 各メッセージの `created_at` | `message.create_time`（ISO 8601 に。無ければ省略） |

- **除外するノード**: `message` が null のもの／`message.metadata.is_visually_hidden_from_conversation` が真のもの／`content.content_type` が `user_editable_context` のもの／role が `system` で本文が空のもの
- **本文（content）の変換**。現行の Claude.ai の表示（思考・道具の折りたたみ）に乗せる:

| ChatGPT の content_type | 変換後 |
|---|---|
| `text` | `parts` の文字列を改行で連結した本文 |
| `multimodal_text` | `parts` のうち文字列だけを本文に。画像などの非文字列の要素は取り込まない |
| `code` | `text` を言語名（`language`、無ければ空）つきのコードフェンスで本文に |
| `thoughts`・`reasoning_recap` | 思考の折りたたみ（現行の `claude-thinking`）に入れる |
| role が `tool` のもの、および `execution_output`・`tether_browsing_display`・`tether_quote`・`system_error` | 道具の折りたたみ（現行の `claude-tool`）に入れる。見出しに content_type を出す |
| 上記以外 | 道具の折りたたみに入れ、取り出せる文字列があれば本文に。取り出せなければ content_type 名だけを残す（情報を黙って落とさない） |

- `parseConversationsJson` が ChatGPT 形式の配列も受け付けること。どちらの形式とも認識できない場合のエラー文は「Claude.ai または ChatGPT の conversations.json 形式と認識できません」とする
- Claude.ai 形式の処理経路（`selectActiveBranch`・`messageBodyToMd`・`messagesToMd`・`conversationToMkbData`）の振る舞いを変えない

### S-2 取込画面の文言（src/components/ChatImporter.jsx）

- 案内文「Claude.ai の conversations.json を選択してください」を「Claude.ai または ChatGPT の conversations.json を選択してください」に改める
- 冒頭コメントを同様に改める。それ以外の画面・操作は変えない

### S-3 試験データと見本（public/・src/App.jsx）

- ChatGPT 形式の合成試験データ `public/test-chatgpt-conversations.json` を作る。実在の会話を使わない。最低限、次を含めること:
  - ① 単純な往復の会話
  - ② 編集・再生成で枝分かれし、`current_node` が古くない方の枝を指す会話
  - ③ `thoughts`・`code`・`execution_output`・role `tool`・画像を含む `multimodal_text` を含む会話
  - ④ 除外対象（不可視の system・`user_editable_context`）を含む会話
  - ⑤ 中身のない会話（一覧から除外されるもの）
- `src/App.jsx` の見本一覧に、既存の「💬 チャットログ取込（取込フロー：5会話）」と同じ形（`kind: 'chat-import'`）で ChatGPT 版の見本を1件追加する

### S-4 版

- `package.json`・`server/package.json`・`server/index.js` の `VERSION` を 0.2.0 → 0.3.0 に揃える（R-012。inspect が照合する）

## 影響範囲（PM調査済み——「ここが全部だ」）

検索キーワード: `chatConverter` `ChatImporter` `conversations` `chat_messages` `claude`（src/・server/・scripts/、HEAD 2fb6ae1）

| ファイル | 該当箇所 | 対応要否 |
|---|---|---|
| src/utils/chatConverter.js | `parseConversationsJson`（68行付近）・`isReadableConversation`（47行付近）・冒頭コメント | 要修正（S-1） |
| src/components/ChatImporter.jsx | 1行・228行の文言 | 要修正（S-2） |
| src/App.jsx | 50行付近の見本一覧 | 要修正（S-3） |
| public/test-chatgpt-conversations.json | 新設 | 要作成（S-3） |
| package.json・server/package.json・server/index.js | 版 | 要修正（S-4） |
| src/styles/reader.css | 1178行以降 `claude-thinking`・`claude-tool` | 確認のみ（クラス名は流用し変えない） |
| src/components/SaveToLibraryDialog.jsx・Bookshelf.jsx | 取込の入口・保存経路 | 対象外 |
| src/components/JsonRenderer.jsx・MarkdownRenderer.jsx | コメント中の「Claude」 | 対象外 |

表にない箇所を触る場合は停止条件1で報告すること。

## 作業手順

1. `git pull` → inspect 実行 → 着工確認（定型②）
2. 着工前に、変更前のコードで次の二つの証跡を取る（下記 AC-1・AC-6 の比較の基準）
   - 既存の `public/test-conversations.json` を変換した結果（全会話の MD）を保存する
   - S-3 の ChatGPT 試験データを先に作り、変更前のコードで読ませて失敗することを記録する
3. S-1 → S-2 → S-3 → S-4 の順に実装。各節ごとに5W1Hコミット
4. 検証計画を実行し、証跡を報告書に添付
5. `npm run build`・inspect 緑・_STATUS.md 更新・push

## 禁止事項

- Claude.ai 形式の変換結果を変えること（回帰。AC-6 で検査する）
- 取込画面に形式の選択肢を足すこと（自動判別で足りる）
- 実在の ChatGPT 会話を試験データとしてリポジトリに置くこと
- エクスポート ZIP の直接読込・画像の取込など、本書の範囲外の機能を足すこと

## 検証計画（受入基準との対応・これが検収の正になる）

| AC | 検証項目（手順） | 手段 | 証跡様式 | negative control |
|---|---|---|---|---|
| AC-1 | ChatGPT 試験データを読ませ、①〜④の会話が一覧に出て、⑤が出ないこと | PG実行（node スクリプトで `parseConversationsJson`＋`isReadableConversation` を通す） | 生ログ（一覧に出た会話の題名と件数） | 有（変更前のコードで読ませると形式エラーで赤） |
| AC-2 | ①を変換し、human／assistant の発言が交互に区切られ、題名・作成日時（ISO 8601）・モデルがメタデータに入ること | PG実行 | 変換結果の MD 全文とメタデータ | 該当なし |
| AC-3 | ②を「最終分岐のみ」（既定）で変換すると `current_node` までの経路の発言だけが出ること。「全分岐」で変換すると両方の枝が出ること | PG実行 | 両モードの変換結果 MD | 該当なし |
| AC-4 | ③で、思考が `claude-thinking`、道具・実行結果が `claude-tool` の折りたたみに入り、画像の要素が本文に出ないこと。④で除外対象が出ないこと | PG実行 | 変換結果 MD | 該当なし |
| AC-5 | ChatGPT 試験データから複数会話を選んで本棚に一括保存し、開き直して読めること。1件を「書庫へ保存」し索引に出ること | PG実行（ブラウザ操作。dev サーバーで可） | 操作手順と結果の記録（スクリーンショット可） | 該当なし |
| AC-6 | 既存の `public/test-conversations.json` の変換結果（全会話・両分岐モード）が変更前と一致すること | PG実行（作業手順2の保存結果と diff） | diff 出力（差分なし） | 該当なし |
| AC-7 | inspect 全項目緑、`npm run build` 警告なし、3か所の版が 0.3.0 で一致 | inspect | inspect 出力全文・build ログ | 該当なし |

- negative control は「変更前で赤の記録→変更後に緑」の両方を証跡に残す
- **実機系（発注者に依頼）**: 発注者自身の ChatGPT エクスポートの `conversations.json` を取込画面で読ませ、一覧が出ること・任意の会話を数件開いて読めることを確認する。実データはリポジトリに置かない。読めない会話があれば、その会話の content_type を PG が調べて報告する

## 完了条件

- S-1〜S-4 の実装
- 検証計画の全項目を実行し、証跡を完了報告に添付済み
- pull・push 実施済み（サーバー側の機能変更はないため再起動は不要。版を上げたため、稼働中の書庫サーバーの healthz が新しい版を返すかは報告に記す）
- inspect緑・_STATUS.md 更新

## 報告基準

報告は docs/reports/chatgpt-import-report.md に置く（AC対応表様式）。チャット発話は定型③または④のみ。コンテキスト圧縮後もこのセクションを読み返してから報告すること。

1. 実装内容の要約
2. **AC対応表**: | AC | 検証項目 | 結果 | 証跡（生ログ引用 or reports/内パス） |
3. inspect結果（緑/赤と出力の添付）・CI run URL（なければ「該当なし」）
4. 完了条件の各項に対する充足状況
5. 未完了・未検証の項目があれば列挙（#012・美化しない）
6. 発注者指示による仕様外修正があればその旨と内容
7. コミット・プッシュの実施状況
8. 正規化の対応表（S-1）のうち、実装で読み替えた・判断を要した箇所があれば列挙

## 発令文（PMがpush後チャットへ転写する）

```
【発令】mkb-reader 0.3.0 — §44 ChatGPT 会話の取込
作業: チャットログ取込で ChatGPT の conversations.json を Claude.ai と同じ仕様で読めるようにする
リポジトリ: misfortunemate-png/mkb-reader ／ Issue: mkb-reader#1
手順: git pull → docs/instructions-chatgpt-import.md を読む
      → マニフェスト照合・inspect緑を確認して着工
報告先: docs/reports/chatgpt-import-report.md（AC対応表様式）
```

## 改訂履歴

| 版 | 日付 | 変更者 | 内容 |
|---|---|---|---|
| v1.0 | 2026-10-17 | PM | 初版 |
