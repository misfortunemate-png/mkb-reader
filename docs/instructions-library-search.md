# mkb-reader 作業指示書 — §43 書庫全文検索

発行日: 2026-08-08 ／ 発行者: クリーデ（PM） ／ 宛先: PG（Claude Code on フラン）
フロー: 簡略（PM裁量）。小規模機能追加。

---

## マニフェスト
| 種別 | リポジトリ内パス |
|---|---|
| 本指示書 | docs/instructions-library-search.md |
| 支給物 | なし |

## 何を・なぜ

書庫に保管されたチャットログ・文書を横断検索できるようにする。LLMは使わない決定的コード（P-5）による純粋な文字列マッチ。ファイルは検索のたびに都度読みし、テキストのキャッシュは持たない。MKBファイル（ZIP展開が必要）の検索はオプションとする。

## 作業範囲

### S-1: 検索APIの新設（server/index.js）

`GET /api/library/search?q=<キーワード>&mkb=<0|1>`

- `q`: 検索文字列（必須）。大文字小文字を区別しない
- `mkb`: MKBファイルも検索対象にするか（省略時 `0`）
- 空文字・未指定の `q` には 400 を返す

処理の流れ:
1. `LIBRARY_ROOT` を再帰走査し、対象ファイルを列挙する
   - 常に検索: `.md`, `.markdown`, `.txt`
   - `mkb=1` のとき追加: `.mkb`
   - それ以外の拡張子はスキップ
2. 各ファイルを都度読みする
   - MD/TXT: `fs.promises.readFile` でUTF-8テキストとして読む
   - MKB: `fs.promises.readFile` → `JSZip.loadAsync` → `index.md` + `pages/*.md` のテキストを結合（チャプター区切りに `\n---\n` を挿入）
3. テキスト内で `q` に大文字小文字無視でマッチする行を探す
4. マッチした行と前後2行をコンテキストとして抽出する
5. ファイルごとにマッチ数の上限を **10件** とする（それ以上はカウントだけ返す）
6. 全体の検索対象ファイル数の上限は設けない（都度読みの負荷はファイル数に比例するが、検索頻度は低いため許容する）

レスポンス:
```json
{
  "query": "キーワード",
  "totalFiles": 150,
  "searchedFiles": 120,
  "results": [
    {
      "path": "chats/2026-04/ガクチカ.md",
      "title": "ガクチカ",
      "kind": "md",
      "totalMatches": 15,
      "matches": [
        {
          "lineNumber": 42,
          "line": "ガクチカAIアシスタントなるサービスを...",
          "context": ["前の行1", "前の行2", "マッチ行", "後の行1", "後の行2"]
        }
      ]
    }
  ]
}
```

- `totalFiles`: LIBRARY_ROOT内の全ファイル数
- `searchedFiles`: 検索対象として読み込んだファイル数（拡張子フィルタ後）
- `results`: マッチがあったファイルのみ。マッチ数降順でソート

パフォーマンス対策:
- ファイル読み込みは逐次処理（Promise.allで全並行にしない）。I/O負荷を抑える
- AbortControllerへの対応は不要（Express側ではリクエスト中断時に自動で打ち切られる）

### C-1: 検索UIの追加（src/components/RemoteLibraryView.jsx）

書庫タブの上部に検索バーを追加する。既存の `filterText`（タイトルフィルタ）とは別の、サーバー全文検索用のUI。

UI構成:
- 検索入力欄（`type="search"`, placeholder「書庫内を検索…」）
- MKBを含むチェックボックス（ラベル「MKBも検索」、デフォルトOFF）
- 検索ボタン（「🔍」）
- 検索中はボタンを「検索中…」に変更してdisable

入力欄でEnterキー押下でも検索を実行する。

### C-2: 検索結果の表示（src/components/RemoteLibraryView.jsx）

検索結果がある場合、通常の書庫一覧の**代わりに**検索結果を表示する。

- ファイルごとにカード形式で表示: アイコン（KIND_ICON）＋タイトル＋パス＋マッチ数
- カードをタップすると展開し、マッチ箇所のコンテキスト（前後2行）をプレビュー表示
- マッチ行のキーワード部分を `<mark>` で強調（CSS: `mark { background: var(--accent-dim, #ffd54f40); }` ）
- 「このファイルを開く」ボタン → 既存の `onOpenItem` に `path` を渡す
- 検索結果の上部に「✕ 検索を解除」リンク → クリックで通常の書庫一覧に戻る
- `totalMatches > 10` のファイルには「他に N 件のマッチ」と表示

### C-3: useRemoteLibrary.jsに検索関数を追加

```js
async function searchLibrary(query, includeMkb = false) {
  const url = `/api/library/search?q=${encodeURIComponent(query)}&mkb=${includeMkb ? '1' : '0'}`;
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),  // MKB展開を含むため長めに
  });
  if (!res.ok) throw new Error(`search: ${res.status}`);
  return res.json();
}
```

返却値: `{ searchLibrary, searchResults, searching, searchError }` を既存のreturnオブジェクトに追加。

## 禁止事項

- 検索インデックスやテキストキャッシュを持たない（都度読み方針）
- buildIndexやgetIndexの既存処理を変更しない
- 既存の書庫一覧UI（ソート・フィルタ・種別絞り込み）を変更しない
- LLMを使わない

## テスト

### PG自己完結分
1. `npm run build` 成功
2. サーバー起動 → `curl "http://127.0.0.1:8788/api/library/search?q=テスト"` → 正常レスポンス
3. `q` 未指定 → 400エラー
4. 存在するキーワードで検索 → マッチが返る
5. 存在しないキーワード → results が空配列
6. `mkb=0` でMKBファイル内のテキストはヒットしないこと
7. `mkb=1` でMKBファイル内のテキストもヒットすること
8. マッチ10件超のファイルで `totalMatches` が正しく、`matches` 配列は10件で打ち切られていること

### 実機テスト（発注者に依頼）
1. Pixel 10から書庫タブを開き、検索バーが表示されること
2. キーワードを入力して検索 → 結果が表示されること
3. 結果からファイルを開けること
4. 「MKBも検索」をONにして検索 → MKB内のテキストもヒットすること

## 完了条件

- S-1, C-1, C-2, C-3 実装済み
- テスト項目1〜8 PG確認済み
- `npm run build` 成功
- _STATUS.md更新
- 5W1Hコミット
