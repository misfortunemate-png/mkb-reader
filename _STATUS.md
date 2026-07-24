# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-07-24（Phase 6.1 §40・§41 実装完了）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**Phase 6.1 実装完了・実機検証待ち**

## Phase 一覧（詳細は README.md）
Phase 1〜5: 実機検証合格 ／ Phase 6（§35〜§38）: 実機検証待ち
Phase 6.1（§40〜§41）: 実装完了・実機検証待ち

## 仕様書
- docs/instructions-phase6.1.md（§40〜§41）
- docs/spec-phase6.md（§35〜§38）・docs/spec-phase5.md〜docs/spec-phase1.md

## 直近の作業（2026-07-24 Phase 6.1）
- §40 見開き表示トグル: SpreadIcon / ImageViewer spreadMode / localStorage永続化
- §41 動画再生: VideoPlayer.jsx / useMkbLoader 動画Blob URL / server KIND_MAP拡張
- inspect: 24 passed ／ build: 818KB（警告は既存）

## 次のアクション
実機検証（Pixel 10 / Tailscale）: §40 見開き表示 / §41 動画再生
