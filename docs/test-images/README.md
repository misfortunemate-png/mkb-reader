# テスト用画像置き場

検証で使う画像を **`D:/AI/github/mkb-reader/docs/test-images/`** に配置してください。

## ショウゴさんから貰った画像（2026-04-29）

以下の4枚を扱う想定。ファイル名は実際の保存名に合わせて更新してください。

| 想定用途 | ファイル名（仮） | 説明 |
|---|---|---|
| 縦長・写実画 | `crane.png` | 鶴と花の絵（横位置） |
| 縦長・ピクセルアート | `pixel-rain.png` | 雨の街角ピクセルアート |
| 横長・写実画 | `pancakes.png` | パンケーキ |
| 横長・写実画（風景） | `island.png` | 上空から見た島 |

## 使い方

検証用 mkb（`docs/test-mkb/`）に組み込みたい場合:

1. `docs/test-mkb/assets/` 配下にファイルをコピー
2. 該当 `pages/*.md` から `![alt](assets/<filename>)` で参照
3. `npm run build:test-mkb` で `public/test.mkb` を再生成

単体テストで開きたい場合は、対応する .md ファイルを別途作って読み込むだけで OK。
