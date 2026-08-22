# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-08-22（クラウド接続設定 実装完了）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**クラウド接続設定 実装完了・実機統合テスト待ち**

## Phase 一覧（詳細は README.md）
Phase 1〜5: 実機検証合格 ／ §42（MD書き出し）: 実機検証合格
§43（書庫全文検索）: 実装完了・実機検証待ち

## 直近の作業（2026-08-22 クラウド接続設定）
- S-1: 設定パネル書庫Sectionに書庫サーバーURL・トークン入力欄追加（SettingsPanel.jsx）
- S-2: useRemoteLibrary の全fetch を libFetch でラップ・baseUrl付与・Authorizationヘッダ付与
- 設定が空の場合は既存動作（相対パス・ヘッダなし）を完全維持
- inspect: 24 passed ／ build: 826KB
