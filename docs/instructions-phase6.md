# mkb-reader 実装指示書 Phase 6 — リモート書庫

発行日: 2026-07-23 ／ 発行者: クリーデ（PM） ／ 宛先: PG（Claude Code on フラン）

## マニフェスト（着工前照合）
| 種別 | リポジトリ内パス | 備考 |
|---|---|---|
| 要件定義 | docs/requirements-phase6.md | 2026-07-23承認済み |
| 仕様書 | docs/spec-phase6.md | v1.0 |
| 支給物 | なし | — |

欠落があれば着工不可（R-014）。docs/reports/ に報告して停止すること。

## PG三則（R-011）
1. 難航時はPMへ差し戻す（docs/reports/）
2. 原因判明時は「原因X・対策Y・実行可否」で報告→指示待ち
3. セッション外プロセスの停止等は事前許可

宛先振り分け: 仕様疑義・技術判断→PM（docs/reports/）／環境・インフラの未知の問題・実機試験→発注者。

## 着工手順
1. `git pull` → 現行version・ブランチ状態の確認（feature/verticalの残置は触らない）
2. `scripts/inspect.mjs` を仕様§39.2に従い新設（既存リポジトリのため最初に整備）
3. 実装順: §35（server）→ §36（クライアント）→ §37（変換直結）→ §38（bat・git補助物）
4. 各節ごとに5W1Hコミット、_STATUS.md更新（30行以内）

## 実装範囲
仕様書 docs/spec-phase6.md の§35〜§39全項。要点のみ再掲:
- server/ 新設（Express・.env: PORT=8788, LIBRARY_ROOT）。dist配信＋索引＋実体配信＋PUT保存＋healthz
- resolveSafe必須（単体テスト同梱）。私室棚はコードに一切登場させない（LIBRARY_ROOT外なので実装対象外）
- SWは `/api/` `/healthz` をキャッシュしない
- クライアント: healthz自動検出・書庫一覧・既存読込パイプラインへの合流・書庫へ保存・トースト・設定表示
- ChatImporter出力先に「書庫へ保存」
- 納品物bat 2点（library-backup.bat／start-all.bat追記ブロック）は**ASCII・CRLF厳守**（教訓: UTF-8日本語はcmdで構文崩壊）

## 自己完結テスト（PG実施）
- resolveSafe単体テスト（遡上・絶対パス・エンコード遡上の拒否）
- 索引生成: 空ディレクトリ／混在形式（mkb・md・txt・pdf・画像）／サブディレクトリ
- PUT保存→再スキャン→索引反映
- `npm run build` 警告なし・バンドルサイズ記録
- inspect全項目緑（出力を報告に添付）

## 実機系テスト（発注者に依頼するもの・列挙）
1. フランでserver起動→PC・ブラウザで `http://127.0.0.1:8788` 表示
2. インフラPG適用後、Pixel 10（standalone）で `https://fraine.tail204746.ts.net:8443/` から書庫一覧→mkb閲覧
3. PDF・画像・txtの表示（PDF はiframe表示）
4. チャットログ変換→書庫へ保存→一覧反映
5. 書庫ディレクトリにPCでファイル追加→索引再取得→一覧反映
6. Pages版の無退行確認（従来どおり動くこと）

## インフラPG作業（別セッション・本指示書を参照）
- LIBRARY_ROOT実パスの作成（正式パスは発注者指定。.envに設定）
- 書庫ルートのgit init・privateリモート作成と紐付け（リポジトリ名は発注者指定）
- start-all.bat v4への追記ブロック適用・tailscale serve追加（--https=8443 → 127.0.0.1:8788）

## 完了時
- inspect緑・自己完結テスト結果・未検証項目（実機系）を明記して docs/reports/phase6-report.md にpush
- 完了宣言はしない。「確認をお願いします」で止める
