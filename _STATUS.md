# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-10-17（§44 ChatGPT 会話の取込 実装完了）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**0.3.0 §44 ChatGPT 会話の取込 実装完了・PM検収待ち（AC-5 書庫へ保存は既存不具合で赤・PM判断待ち）**

## Phase 一覧（詳細は README.md）
Phase 1〜5: 実機検証合格 ／ §42（MD書き出し）: 実機検証合格
§43（書庫全文検索）: 実装完了・実機検証待ち ／ クラウド接続設定: 実機統合テスト待ち

## 直近の作業（2026-10-17 §44・mkb-reader#1）
- S-1: chatConverter.js — mapping を持つ会話を ChatGPT 形式と判別し Claude.ai 形式へ正規化
- S-2: ChatImporter.jsx — 案内文を「Claude.ai または ChatGPT」に
- S-3: public/test-chatgpt-conversations.json 新設・App.jsx 見本に ChatGPT 版追加
- S-4: 版 0.3.0（稼働中 8788 の healthz は未再起動のため 0.2.0 のまま）
- 既存不具合: 書庫へ保存の PUT が Content-Type なしで 500（報告書 §5）
- inspect: 24 passed ／ build: 830KB ／ 報告: docs/reports/chatgpt-import-report.md
