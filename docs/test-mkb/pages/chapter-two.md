# 第二章 技術文書

mkb-reader の Markdown 描画は GFM（GitHub Flavored Markdown）に準拠しています。本章ではコードブロック・テーブル・リスト等の描画を確認します。

## コードブロック

JavaScript:

```javascript
// CSS multi-column によるページ分割
const w = frame.clientWidth;
track.style.columnWidth = `${w}px`;
const totalPages = Math.ceil(track.scrollWidth / w);
```

Python:

```python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b
```

## テーブル

| フォーマット | 拡張子 | 第一級 |
|---|---|---|
| MarkBook | .mkb | ○ |
| Markdown | .md | ○ |
| プレーンテキスト | .txt | ○ |
| HTML | .html | × |
| PDF | .pdf | × |

## タスクリスト（GFM拡張）

- [x] §1 ファイル読み込み
- [x] §2 Markdown描画
- [x] §3 チャプターナビゲーション
- [x] §4 ページネーション
- [ ] §5 フォント選択（Phase 2）
- [ ] §6 テーマ切替（Phase 2）

## 引用ネスト

> 設計の本質は「何を作らないか」を決めることにある。
>
> > 引用の引用。括弧の入れ子のように、思考が折り重なる。

## 取り消し線（GFM拡張）

~~この機能はv0.2で追加予定~~ → ボツになりました。

## 段落と段落のあいだ

長い段落のあとには、十分な余白を確保したいものです。日本語の文章では、段落と段落のあいだの「間」が、読者の呼吸を整える役割を果たします。テクニカルな文書であっても、その原則は変わりません。むしろ、技術的な情報ほど、読者が立ち止まって考えるための余白が必要です。

そして次の段落へ。コードと文章が交互に現れる構成では、ページ境界の処理が特に重要になります。コードブロックがページの末尾で切れたり、見出しが前ページの最終行に取り残されたりしないように、CSS の `break-inside: avoid` と `break-after: avoid` を併用しています。

## まとめ

このページが綺麗にページ分割されていれば、§4 の検証は概ね合格です。
