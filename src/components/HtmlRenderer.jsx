// 何を: HTML を sandbox iframe + srcdoc で表示する
// なぜ: 仕様書 §10 — script 実行を許可せず、テーマカラーだけ流し込んで安全に表示
//
// sandbox 属性に allow-scripts を含めない（script 実行不可）。
// allow-same-origin だけ付け、内部 CSS で画像など同一ドキュメント内リソースが使えるようにする。

import { useMemo } from 'react';

export default function HtmlRenderer({ content, name }) {
  // テーマ色を iframe 内に注入（背景・文字色のみ）
  // 何を: 親ドキュメントの CSS 変数を <style> としてインライン化
  // なぜ: iframe は別ドキュメントなので親の CSS 変数は継承されない。
  //       外部リソース（CSS リンク等）は読み込まない前提なのでインラインで完結させる
  const srcdoc = useMemo(() => {
    const root = getComputedStyle(document.documentElement);
    const bg = root.getPropertyValue('--color-bg').trim() || '#faf8f5';
    const fg = root.getPropertyValue('--color-text').trim() || '#1a1a1a';
    const fam = root.getPropertyValue('--font-body').trim() || 'serif';
    const themeStyle = `<style>
      html, body { background: ${bg}; color: ${fg}; font-family: ${fam}; }
      body { margin: 1rem; line-height: 1.7; }
      a { color: inherit; }
      img { max-width: 100%; height: auto; }
      pre { white-space: pre-wrap; word-break: break-word; }
    </style>`;

    // <head> があればその直前に挿入、無ければ先頭に
    if (/<head[^>]*>/i.test(content)) {
      return content.replace(/<head[^>]*>/i, (m) => m + themeStyle);
    }
    if (/<html[^>]*>/i.test(content)) {
      return content.replace(/<html[^>]*>/i, (m) => `${m}<head>${themeStyle}</head>`);
    }
    return `<!doctype html><html><head>${themeStyle}</head><body>${content}</body></html>`;
  }, [content]);

  return (
    <div className="html-frame-wrap">
      <iframe
        title={name || 'HTML'}
        sandbox="allow-same-origin"
        srcDoc={srcdoc}
        className="html-frame"
      />
    </div>
  );
}
