# mkb-reader 仕様・指示書 Phase 6.1 — 見開き表示・動画再生（§40〜§41）

発行日: 2026-07-24 ／ 発行者: クリーデ（PM） ／ 宛先: PG（Claude Code on フラン）
フロー: 簡略（PM裁量）。小規模機能追加。fix1修正を前提とする（未適用なら先にfix1を着工）。
前提: Phase 6完了・fix1適用済みのコードベース

---

## マニフェスト
| 種別 | リポジトリ内パス |
|---|---|
| 本指示書 | docs/instructions-phase6.1.md |
| 支給物 | なし |

## §40 見開き表示トグル（電子書籍用）

### 40.1 対象
content.type === 'images' のとき（CBZ・画像ZIP・複数画像選択）。ImageViewer.jsx の改修。

### 40.2 トグルUI
- app-header 内に見開きトグルボタンを追加。表示条件: content.type === 'images'
- アイコン: Icons.jsx に SpreadIcon を新設（四角2つ横並び程度のシンプルなSVG）
- 状態: `spreadMode`（boolean）。localStorage に `image-spread` キーで永続化。既定 false（単ページ）
- トグルON時はアイコンを active 表示（既存 icon-btn active スタイルがあればそれを使用、なければ opacity で区別）

### 40.3 見開きレイアウト
- spreadMode === true のとき、ImageViewer は2枚の画像を**横並び（左が偶数ページ=0始、右が奇数ページ）**で表示
- 最終ページが奇数枚の場合は1枚のみ表示（右寄せ）
- ページ送りは2ページ単位（next: +2、prev: -2）。インジケーターは「1-2 / N」形式
- 各画像は見開き枠の半分幅 × 全高に object-fit: contain
- レイアウト: flexbox 横並び、gap なし（漫画見開きの模擬）
- タップゾーン・スワイプ・キーボード操作は既存ロジックをそのまま使用（ページ送り単位が変わるだけ）
- ピンチズーム: 見開き全体に対して適用（既存ロジックのまま。枠が2画像を含むdivに変わるだけ）

### 40.4 注意
- 見開きは横幅が狭いモバイルでは実用的でない場合があるが、ユーザー判断でトグルできるのでガードしない
- 書庫リモート閲覧でも同様に動作する（画像配列の扱いは同一）

## §41 動画再生

### 41.1 サーバ側（server/index.js）
- KIND_MAP に動画拡張子を追加: `.mp4: 'video'`, `.webm: 'video'`, `.mkv: 'video'`, `.mov: 'video'`, `.avi: 'video'`
- CONTENT_TYPES に追加: `.mp4: 'video/mp4'`, `.webm: 'video/webm'`, `.mkv: 'video/x-matroska'`, `.mov: 'video/quicktime'`, `.avi: 'video/x-msvideo'`
- 索引の kind は `video`。実体配信は既存の GET /api/library/file でそのまま（追加工事なし）

### 41.2 クライアント側
- 新コンポーネント: `src/components/VideoPlayer.jsx`
- HTML5 `<video>` タグ。controls 属性（ブラウザネイティブコントロール）で再生・一時停止・シーク・全画面・音量を提供。独自UIは作らない
- スタイル: 全幅全高（100vw × 100vh の枠、object-fit: contain）。ImageViewer と同じ .image-frame 流用、またはシンプルな新クラス .video-frame
- App.jsx に content.type === 'video' の分岐を追加（ImageViewer / PdfRenderer と同列）

### 41.3 ローカルファイル対応
- ローカル（本棚）から動画ファイルを開いた場合も同様に表示。loadFile のファイル拡張子判定で video 拡張子を認識し、content.type = 'video' として Blob URL を渡す
- 本棚の索引（fileType 等）への追加は不要。表示時の拡張子判定のみで十分

### 41.4 書庫一覧
- RemoteLibraryView の kind フィルタに 'video' を追加（既存のフィルタUIがあれば）。なければ一覧にそのまま表示されるだけで追加工事不要

### 41.5 制約の明記
- ブラウザがネイティブ再生できない形式（mkv等）はフォールバック不可。エラー時はトーストで「この形式は再生できません」を表示
- 大容量動画のストリーミングは HTTP Range リクエストが必要だが、Express の静的配信は Range 対応済み。ただし resolveSafe 経由の手動 fs.createReadStream を使う場合は Range ヘッダのパースが必要になる。**実装方針**: 動画ファイルの配信のみ express.static のフォールバックを使うか、Range 対応の sendFile を使う。PGの裁量で選択してよいが、選択理由をコミットメッセージに記載すること

---

## 着工手順
1. `git pull` でfix1適用済みを確認（.gitattributes の存在、inspect全緑）
2. §40 → §41 の順で実装。各節ごとに5W1Hコミット
3. inspect実走・build確認（バンドルサイズ記録）
4. _STATUS.md 更新（30行以内）
5. docs/reports/phase6.1-report.md にpush

## 実機系テスト（発注者に依頼）
1. CBZ/画像ZIP を開き、見開きトグルON→2枚並び表示・ページ送り（+2/-2）・トグルOFF→単ページ復帰
2. 書庫に .mp4 を配置→一覧に表示→タップ→動画再生（再生・一時停止・シーク・全画面）
3. ローカルから動画ファイルを開いて再生
