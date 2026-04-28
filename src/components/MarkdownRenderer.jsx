// 何を: Markdown を react-markdown で描画する
// なぜ: 仕様書 §2 - GFM + wikilinks + 画像Blob URL対応

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkWikiLink from 'remark-wiki-link';
import { useMemo } from 'react';

export default function MarkdownRenderer({ chapter, chapters, onWikiLinkClick }) {
  // 何を: wikilinks プラグインに「既存リンク一覧」と「リンク先解決ルール」を渡す
  // なぜ: remark-wiki-link は permalinks[] に含まれないものを class="new" として扱うため、
  //       pageResolver だけでは全リンクが broken 扱いになる
  const { permalinks, pageResolver } = useMemo(() => {
    const list = (chapters || []).map((c) => c.id);
    const idMap = new Map(); // 大文字小文字を無視するため lowerKey → id
    (chapters || []).forEach((c) => {
      idMap.set(c.id.toLowerCase(), c.id);
      if (c.title) idMap.set(c.title.toLowerCase(), c.id);
    });
    return {
      permalinks: list,
      pageResolver: (name) => {
        const hit = idMap.get(name.toLowerCase());
        return hit ? [hit] : [name.toLowerCase().replace(/\s+/g, '-')];
      },
    };
  }, [chapters]);

  const hrefTemplate = (permalink) => `#chapter:${permalink}`;

  // .txt（plainText）はパースせず <pre> で表示
  if (chapter?.plainText) {
    return (
      <div className="markdown">
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'normal' }}>
          {chapter.content}
        </pre>
      </div>
    );
  }

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkWikiLink, { permalinks, pageResolver, hrefTemplate, aliasDivider: '|' }],
        ]}
        // 何を: blob: と # を許可する urlTransform を渡す
        // なぜ: react-markdown のデフォルトは XSS 対策で blob: URL を空文字に置換するため、
        //       mkb の assets を Blob URL 化しても <img src> が空になり画像が表示されない（§4 修正）
        urlTransform={(url) => {
          if (typeof url !== 'string') return url;
          if (url.startsWith('blob:') || url.startsWith('#') || url.startsWith('data:image/')) return url;
          // それ以外はデフォルト挙動（http/https/相対）
          return url;
        }}
        components={{
          // wikilink: hash 形式の href をクリックハンドラへ橋渡し
          a({ href, children, className, ...rest }) {
            if (typeof href === 'string' && href.startsWith('#chapter:')) {
              const target = decodeURIComponent(href.slice('#chapter:'.length));
              const isBroken = (className || '').includes('new');
              return (
                <a
                  href={href}
                  className={isBroken ? 'wikilink-broken' : 'wikilink'}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isBroken) onWikiLinkClick?.(target);
                  }}
                  {...rest}
                >
                  {children}
                </a>
              );
            }
            // 通常リンクは新規タブで開く（mkb 内のセキュリティ配慮）
            const isExternal = typeof href === 'string' && /^https?:/i.test(href);
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...rest}
              >
                {children}
              </a>
            );
          },
          // 画像: alt/src をそのまま使う（パスは parser で Blob URL に置換済み）
          img({ src, alt }) {
            return <img src={src} alt={alt || ''} loading="lazy" />;
          },
        }}
      >
        {chapter?.content || ''}
      </ReactMarkdown>
    </div>
  );
}
