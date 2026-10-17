# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-10-17（0.3.1 書庫へ保存の不具合修正 実装完了）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**0.3.1 書庫へ保存の不具合修正 実装完了・PM検収待ち（mkb-reader#2）**

## Phase 一覧（詳細は README.md）
Phase 1〜5: 実機検証合格 ／ §42（MD書き出し）: 実機検証合格
§43（書庫全文検索）: 実装完了・実機検証待ち ／ クラウド接続設定: 実機統合テスト待ち
§44（ChatGPT 会話の取込・0.3.0）: 実装完了・PM検収待ち（mkb-reader#1）

## 直近の作業（2026-10-17 0.3.1・mkb-reader#2）
- S-1: useRemoteLibrary.js putFile に Content-Type: application/octet-stream
- S-2: chatConverter.js toSafeFileName（禁止文字→全角）・ChatImporter の既定の保存先に適用
- S-3: SaveToLibraryDialog — 使えない保存先は PUT を送らず文言を出す
- S-4: 取込画面の補足文を Claude.ai・ChatGPT 共通に ／ S-5: 版 0.3.1
- 稼働中 8788: 画面は 0.3.1 の build を配信中・healthz は未再起動のため 0.2.0
- inspect: 24 passed ／ build: 830KB ／ 報告: docs/reports/library-save-fix-report.md
