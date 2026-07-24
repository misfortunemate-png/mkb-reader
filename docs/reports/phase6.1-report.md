# Phase 6.1 実装レポート

作成日: 2026-07-24
担当PG: Claude Code on フラン

---

## 概要

Phase 6.1（仕様書: docs/instructions-phase6.1.md）の §40・§41 を実装した。

---

## §40 見開き表示トグル

### 実装内容

| 対象ファイル | 変更内容 |
|---|---|
| `src/components/Icons.jsx` | `SpreadIcon` 追加（2枚の rect を横並び） |
| `src/components/ImageViewer.jsx` | `spreadMode` prop 追加・スナップ・±2ナビ・見開きレイアウト |
| `src/App.jsx` | `spreadMode` state + `handleToggleSpread` + ヘッダトグルボタン |
| `src/styles/reader.css` | `.image-frame-spread` / `.image-spread-half` / `.icon-btn.active` |

### 技術判断メモ

- 最終ページが奇数枚（単ページ）になる場合: 左スロットを空にして右スロットに表示（右寄せ）
- ページ上限: `Math.floor((total-1)/2)*2` — total が奇数でも偶数でも正しく機能
- localStorage キー: `image-spread`（`true`/`false` 文字列）

---

## §41 動画再生

### 実装内容

| 対象ファイル | 変更内容 |
|---|---|
| `server/index.js` | KIND_MAP / CONTENT_TYPES に mp4/webm/mkv/mov/avi を追加 |
| `src/components/VideoPlayer.jsx` | 新規作成（HTML5 `<video controls>`） |
| `src/hooks/useMkbLoader.js` | VIDEO_RE/VIDEO_MIME 定数 + loadFile 動画分岐 + revokeContent 対応 |
| `src/App.jsx` | VideoPlayer import + `content.type === 'video'` 分岐 |
| `src/styles/reader.css` | `.video-frame` / `.video-player` |
| `src/components/RemoteLibraryView.jsx` | KIND_ICON に `video: '🎬'` 追加 |

### 技術判断メモ

- **動画デリバリ**: `res.sendFile` を採用（既存コードを流用）。Express の sendFile は HTTP Range リクエストをネイティブ処理するため、別途 Range ヘッダ解析コードを書かずにビデオシーク機能が得られる。
- **Blob URL 生成**: `File` は `Blob` のサブクラスのため `URL.createObjectURL(file)` で直接 URL を作成できる。`arrayBuffer()` 読み取りは不要。
- **非対応フォーマット通知**: `<video>` の `onError` イベントでトーストを表示（mkv など一部コーデックはブラウザ非対応）。

---

## ビルド結果

| 項目 | 値 |
|---|---|
| inspect | 24 passed, 0 failed |
| bundle | 818.85 kB（チャンクサイズ警告は Phase 3 以降の既存課題） |
| gzip | 249.07 kB |

---

## コミット

| § | コミット | 内容 |
|---|---|---|
| §40 | 1件 | 見開き表示トグル |
| §41 | 1件 | 動画再生対応 |

---

## 次のアクション

実機検証（Pixel 10 / Tailscale）:
- §40: CBZ を開いて見開きトグルが機能するか確認
- §41: mp4 ファイルを開いてブラウザ再生・シーク確認
