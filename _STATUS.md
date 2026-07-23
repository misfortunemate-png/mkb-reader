# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-07-23（Phase 6 fix1 適用）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**Phase 6 実装完了・実機検証待ち（fix1 適用済み）**

## Phase 一覧（詳細は README.md）
Phase 1〜5: 実機検証合格 ／ Phase 6（§35〜§38 リモート書庫）: 実機検証待ち

## 仕様書
- docs/spec-phase6.md（§35〜§38）・docs/spec-phase5.md〜docs/spec-phase1.md

## 直近の作業（2026-07-23 fix1）
- bat CRLF: .gitattributes 新設 (*.bat text eol=crlf)
- resolveSafe: ドライブレター・UNC 明示拒否（Linux 環境対応）
- index.js: buildIndex の rel をスラッシュ正規化
- _STATUS.md: 30行以内に圧縮 / README.md に Phase 表・機能一覧を移設
- inspect: §7 CRLF 検査追加・§8 _STATUS 行数検査追加
