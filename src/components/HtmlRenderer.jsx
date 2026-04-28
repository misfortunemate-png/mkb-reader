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
    // 何を: <a> を全て新規タブで端末ブラウザに開く
    // なぜ: iframe sandbox（allow-scripts なし）内ではトップ navigate 不可、
    //       かつアプリ内で外部ページを表示するのは設計外。端末ブラウザで開かせる。
    //       <base target="_blank"> で全アンカーのデフォルト target を上書き
    const themeStyle = `<style>
      html, body { background: ${bg}; color: ${fg}; font-family: ${fam}; }
      body { margin: 1rem; line-height: 1.7; }
      a { color: inherit; }
      img { max-width: 100%; height: auto; }
      pre { white-space: pre-wrap; word-break: break-word; }
    </style>
    <base target="_blank">`;

    // <head> があればその直前に挿入、無ければ先頭に
    let html;
    if (/<head[^>]*>/i.test(content)) {
      html = content.replace(/<head[^>]*>/i, (m) => m + themeStyle);
    } else if (/<html[^>]*>/i.test(content)) {
      html = content.replace(/<html[^>]*>/i, (m) => `${m}<head>${themeStyle}</head>`);
    } else {
      html = `<!doctype html><html><head>${themeStyle}</head><body>${content}</body></html>`;
    }
    // 個別のアンカー rel を補強（noopener noreferrer を強制付与）
    html = html.replace(/<a\s+([^>]*?)>/gi, (m, attrs) => {
      // rel 属性を保持しつつ noopener noreferrer を必ず含める
      let next = attrs;
      if (/\srel\s*=/.test(' ' + next)) {
        next = next.replace(/(rel\s*=\s*["']?)([^"'>\s]*)/i, (mm, p1, p2) => {
          const set = new Set((p2 || '').split(/\s+/).filter(Boolean));
          set.add('noopener'); set.add('noreferrer');
          return `${p1}${[...set].join(' ')}`;
        });
      } else {
        next += ` rel="noopener noreferrer"`;
      }
      return `<a ${next}>`;
    });
    return html;
  }, [content]);

  return (
    <div className="html-frame-wrap">
      <iframe
        title={name || 'HTML'}
        // 何を: allow-popups を追加。allow-scripts は意図的に外したまま
        // なぜ: 外部リンクを端末ブラウザで開けるようにしつつ、XSS（script 実行）は防ぐ
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcdoc}
        className="html-frame"
      />
    </div>
  );
}
