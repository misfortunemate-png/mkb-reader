# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-05-02（Phase 4 仕様書承認・指示書発行）
更新者: PM（クリーデ）

## 現在のフェーズ
**Phase 4 — §27+§28 実装中（main）/ §30 実装中（feature/vertical）**

---

## 合格状況

| Phase | 範囲 | 実機検証 |
|---|---|---|
| Phase 1 | §1〜§4（読込・MD描画・チャプターナビ・ページネーション） | 合格 |
| Phase 2 | §5〜§9（フォント・テーマ・カスタマイズ・本棚・PWA） | 合格 |
| Phase 3a | §10〜§13（HTML/JSON/画像/CBZ・リサイズ・禁則）+ 設定パネル改訂 | 合格 |
| Phase 3b | §14〜§18（読み替え・画像差し込み・エクスポート・チャットログ変換） | 合格 |
| Phase 3c | §20〜§26（タップゾーン・欧文フォント・中断再開・コンテキストメニュー・UI磨き） | 合格 |

---

## Phase 4 作業計画

### ブランチ構成
```
main ──→ §27+§28 ──→ 実機検証 ──→ §29 ──→ 実機検証
feature/vertical ──→ §30 ──→ 実機検証 ──→ mainにmerge
```

### 進捗

| § | 内容 | ブランチ | 状態 |
|---|---|---|---|
| §27 | 層A本格化（ソート・リネーム・タグ） | main | 未着手 |
| §28 | 層B基盤（LibraryView・ツリー構造） | main | 未着手 |
| §29 | 層B編集（ファイル接続・画像切り出し・mkb変換） | main | §28合格待ち |
| §30 | 縦書き表示（vertical-rl・スクロール固定） | feature/vertical | 未着手 |

---

## 仕様書・指示書

- 仕様書: `docs/spec-phase4.md`
- 指示書: `docs/instructions-phase4ab.md`（§27+§28用）
- 指示書: `docs/instructions-phase4d.md`（§30用、feature/verticalブランチ）
- §29の指示書は§28合格後にPMが作成する

---

## 次のアクション

- 誰が: PG（Claude Code）
- 何を: §27+§28の実装（instructions-phase4ab.md に従う）、§30の実装（instructions-phase4d.md に従う、feature/verticalブランチ）
