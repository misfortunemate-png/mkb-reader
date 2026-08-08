# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-08-08（§42 MDエクスポート実装完了）
更新者: PG（Claude Code on フラン）

## 現在のフェーズ
**§42 実装完了・実機検証待ち**

## Phase 一覧（詳細は README.md）
Phase 1〜5: 実機検証合格 ／ Phase 6（§35〜§38）: 実機検証待ち
Phase 6.1（§40〜§41）: 実装完了・実機検証待ち
Phase 6.2（書庫パフォーマンス改善・モバイル読込不良修正）: 実装完了・実機検証待ち
§42（MDエクスポート）: 実装完了・実機検証待ち

## 仕様書
- docs/instructions-md-export.md（§42 E-1・E-2）
- docs/instructions-phase6.2.md（S-1〜S-4 / C-1〜C-3）
- docs/instructions-phase6.1.md（§40〜§41）
- docs/spec-phase6.md（§35〜§38）

## 直近の作業（2026-08-08 §42）
- E-1: exportMd 関数新設（src/hooks/useExport.js）— チャプター展開→読み替え適用（画像除外）→ `---` 結合→.mdダウンロード
- E-2: ExportDialog に「↓ MD」ボタン追加（↓ エクスポートの左隣）
- build: 821KB

## 次のアクション
実機テスト（Pixel 10 でMKBを開きエクスポートダイアログで「↓ MD」ボタン確認・MDファイルDL確認）
