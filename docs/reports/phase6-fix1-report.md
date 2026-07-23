# Phase 6 fix1 実装報告書

報告日: 2026-07-23
報告者: PG（Claude Code on フラン）
宛先: PM（クリーデ）

---

## inspect 全項目（24項目）

```
[ 1. 必須ファイル ]          11/11 ✓
[ 2. バージョン整合 ]          2/2  ✓
[ 3. resolveSafe 経由検査 ]    2/2  ✓
[ 4. SWキャッシュ除外 ]        2/2  ✓
[ 5. LIBRARY_ROOT ハードコード検査 ] 1/1 ✓
[ 6. セキュリティ設定 ]        1/1  ✓
[ 7. bat ファイル ASCII + CRLF確認 ] 4/4 ✓
[ 8. _STATUS.md 行数確認 ]     1/1  ✓

結果: 24 passed, 0 failed, 0 warnings
```

### §7 CRLF 詳細

```
  ✓ library-backup.bat: ASCII のみ
  ✓ library-backup.bat: CRLF改行
  ✓ docs/start-all-v4-append.bat: ASCII のみ
  ✓ docs/start-all-v4-append.bat: CRLF改行
```

### §8 _STATUS.md

```
  ✓ _STATUS.md: 21 行（≤30）
```

### resolveSafe 単体テスト（全10項目）

```
  ✓ 正常なファイル名
  ✓ サブディレクトリ内ファイル
  ✓ ルート自体は許可
  ✓ .. 遡上の拒否
  ✓ / で始まる絶対パスの拒否
  ✓ Windows 絶対パスの拒否
  ✓ URLエンコード遡上の拒否 (%2F%2E%2E)
  ✓ ダブルエンコード遡上の拒否 (%252F)
  ✓ null バイト拒否
  ✓ 空文字列拒否

resolveSafe: 10 passed, 0 failed
```

---

## 修正内容

### 修正1: bat CRLF（fix1-1）

- `.gitattributes` 新設: `*.bat text eol=crlf`
- `git add --renormalize` で既存 blob に属性適用
- `scripts/inspect.mjs` §7 に CRLF 検査追加（CR 数 === LF 数）

**根拠:** PM 検査で bat blob が LF と判明。`*.bat eol=crlf` により Linux 含む全環境でチェックアウト時 CRLF 保証。

### 修正2: resolveSafe プラットフォーム依存（fix1-2）

- `server/resolveSafe.js`: デコード後にドライブレター・UNC 接頭辞を明示拒否
  ```js
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith('\\\\')) return null;
  ```
- `server/index.js` `buildIndex()`: `rel` 構築に `.replace(/\\/g, '/')` を追加（安全網）

**根拠:** Linux では `path.resolve(root, 'C:\\...')` が相対パスとして解決し、root 内判定を通過してしまう。デコード後の明示チェックで OS 非依存に。

### 修正3: _STATUS.md 圧縮（fix1-3）

- `_STATUS.md`: 96行 → 21行（現在地のみ残し）
- `README.md`: Phase 合格表・実装機能一覧・書庫サーバ節を追加
- `scripts/inspect.mjs` §8 追加: `_STATUS.md` 30行以内検査

---

## コミット一覧

| コミット | 内容 |
|---|---|
| fix1-1 | .gitattributes + inspect §7 CRLF |
| fix1-2 | resolveSafe Linux 対応 + path 正規化 |
| fix1-3 | _STATUS.md 圧縮 + README 機能表移設 + inspect §8 |
| fix1-report | 本報告書 |

---

以上で fix1 PG 作業を完了しました。確認をお願いします。
