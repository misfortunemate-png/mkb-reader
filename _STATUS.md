# プロジェクトステータス

プロジェクト: mkb-reader
最終更新: 2026-04-28 20:00
更新者: PG（Claude Code）

## 現在のフェーズ
Phase 6: Phase 2 前半（§4修正 + §9 PWA + §8 本棚）実装完了 → 実機検証待ち

## 完了事項（Phase 1）
- §1〜§4 実装、検証デプロイ済み
- 実機検証で §4 画像表示の不具合を確認（Phase 2 §4修正で対応）

## 完了事項（Phase 2 前半）
- §4修正: 画像表示バグの修正
  - 原因: react-markdown の `urlTransform` が blob: URL を XSS 対策で空文字に置換していた
  - 対応: `urlTransform` を override し blob:/#/data:image を素通しに
  - 副次対応: mkbParser で Blob に MIME type を明示設定（拡張子→type マップ）
  - テスト用画像: 1x1 透過 → 64x64 視認可能な茶色円 PNG に差替
- §9 PWA + オフライン対応
  - vite-plugin-pwa 導入（registerType: autoUpdate）
  - manifest（name, theme_color, display:standalone, start_url, scope, icons 192/512）
  - workbox precache 12 entries（test.mkb 同梱）+ navigateFallback
  - Google Fonts CSS / woff2 を CacheFirst で runtimeCaching
  - 仮アイコン icon-192.png / icon-512.png 生成（茶色円・将来差替）
- §8 本棚（仮実装）
  - useBookshelf.js（**安定IF**: saveBook/getBook/getAllBooks/deleteBook/updateLastOpened/findByTitle）
    - IndexedDB（DB: mkb-reader, store: books, key: id, index: lastOpenedAt + title）
    - fileToBookEntry / bookEntryToFile ヘルパ
  - Bookshelf.jsx（仮UI・装飾なし）
    - 上部「＋ 開く」ボタン + 一覧（lastOpenedAt 降順）
    - タップで開く / 左スワイプで削除確認
  - App.jsx 改修: アプリ起動時は本棚画面 → タップ/ピッカーでビューア
  - ビューアヘッダーに「本棚に保存（☆/★）」と「本棚に戻る（⌂）」を追加
  - 同タイトルの上書き確認

## 動作確認（ローカル npm run dev）
- 本棚 → 「同梱のテスト用 mkb を開く」 → ビューア遷移 OK
- chapter-three の画像が 64x64 で表示（src=blob:..., naturalW/H=64）OK
- 「★」タップで IndexedDB に保存 → リロード後も本棚一覧に表示 OK
- npm run build 成功（PWA: 12 entries precache, sw.js 生成）

## 未完了事項
- Pixel 10 実機での動作検証（PWA インストール / オフライン起動 / IndexedDB 永続化）
- Phase 2 後半（Step 4〜7）
  - §5 フォント選択（Noto Serif JP / Shippori Mincho / Zen Old Mincho）
  - §6 テーマ切替（light / dark / sepia）
  - §7 表示カスタマイズ（フォントサイズ / 行間 / 余白 / スワイプ方向 / `---` 4方式 / プリセット）
  - useSettings.js による設定一元管理
  - SettingsPanel.jsx ボトムシート

## 次のアクション
- 誰が: ショウゴ
- 何を:
  1. main へ push 後の GitHub Actions デプロイ完了を確認
  2. Pixel 10 Chrome で `https://misfortunemate-png.github.io/mkb-reader/` にアクセス
  3. 検証ポイント:
     - mkb 内の画像（chapter-three）が表示される（§4修正の確認）
     - PWA としてホーム画面に追加できる
     - 機内モードでアプリが起動し test.mkb を開ける
     - 「本棚に保存」→ アプリ再起動後も一覧に残る
     - 左スワイプ → 削除確認 → 削除
  4. 不具合があれば PM に報告。問題なければ Phase 2 後半（§5〜§7）の実装許可

## 備考
- Step 4〜7（フォント／テーマ／カスタマイズ）は実機検証後に着手予定（仕様書通り分割）
- vite-plugin-pwa@1.2.0 は Vite 8 と peer 不一致のため `--legacy-peer-deps` で導入。
  実 API は Vite plugin インターフェースで安定しているためビルド・SW 生成は正常動作確認済み。
- 仮アイコンは茶色塗りの円。将来「特別感のあるアイコン」に差替予定。
- Bookshelf.jsx は **仮実装**。useBookshelf.js のIFのみ安定、UI は将来全面差替する。
