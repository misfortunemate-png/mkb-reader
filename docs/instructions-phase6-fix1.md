# Phase 6 追補指示 fix1（簡略フロー・小規模修正）

発行日: 2026-07-23 ／ 発行者: クリーデ（PM） ／ 宛先: PG
根拠: PM検査（clone・inspect実走・build・サーバ実走スモーク）で検出した不適合3点の是正。
参照: docs/spec-phase6.md ／ 設計変更なし・新機能なし。

## 修正1: bat改行のリポジトリ実体がLF
- 現象: docs/start-all-v4-append.bat / library-backup.bat の**blob実体がLF**（報告はCRLF。フラン上はautocrlfでCRLF化されていた可能性が高い）
- 対処: `.gitattributes` を新設し `*.bat text eol=crlf` を定義。`git add --renormalize .` で実体をCRLF化
- inspect §7 にCRLF検査を追加（bat 2ファイルが `\r\n` 改行であること）

## 修正2: resolveSafe単体テストのプラットフォーム依存
- 現象: 「Windows絶対パスの拒否」がLinux環境で不成立（`C:\...` がposix解決では通常ファイル名になり root 内に解決される）。脆弱性ではないがテストが環境依存
- 対処: resolveSafeの二重デコード後に明示拒否を追加
  `if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith('\\\\')) return null;`（ドライブレター・UNC接頭辞のみ。バックスラッシュ全面拒否は**しない**）
- あわせて索引の path をスラッシュ区切りに正規化（Windowsのreaddirが返す `\` を `/` に置換）。クライアントは常に `/` を送る形に統一
- 単体テストは変更不要のまま両OSで10項目合格になることを確認

## 修正3: _STATUS.md 96行（規約30行以内）
- 全Phase合格表・実装済み機能一覧は README.md へ移設（新規ファイルは作らない）
- _STATUS.md は現在地のみ30行以内に圧縮
- inspect に _STATUS.md 30行以内検査を追加（標準項目の欠落補完）

## 記録のみ（作業不要）
- §35〜§39が単一コミットだった点は指示（各節ごとコミット）からの逸脱として記録。今回のやり直しは不要、次回から遵守

## 完了時
- inspect（追加検査込み・全緑）を添えて docs/reports/phase6-fix1-report.md へ。5W1Hコミット（修正ごと）
