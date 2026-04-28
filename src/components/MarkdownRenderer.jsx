// 何を: Markdown を react-markdown で描画する
// なぜ: 仕様書 §2 - GFM + wikilinks + 画像Blob URL対応
//       Phase 3a §11 - MD 内画像の表示モード自動判定（インライン/ブロック/フルページ）
//       + 画像タップでフルスクリーンモーダル

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkWikiLink from 'remark-wiki-link';
import rehypeRaw from 'rehype-raw';
import { useMemo, useState } from 'react';
import { IMAGE_DISPLAY_THRESHOLDS } from '../hooks/useSettings.js';
import { applyRewrite } from '../utils/rewriteEngine.js';

// 画像のサイズ比率からクラスを決める
// 何を: 長辺 / viewportWidth と imageDisplayMode に応じて 'img-inline'|'img-block'|'img-fullpage' を返す
// なぜ: 仕様書 §11 表 — 画像のサイズで表示扱いを変えて、テキストとの一体感を保つ
function classifyImage(naturalW, naturalH, viewportW, mode) {
  const t = IMAGE_DISPLAY_THRESHOLDS[mode] || IMAGE_DISPLAY_THRESHOLDS.balance;
  const longSide = Math.max(naturalW, naturalH);
  const ratio = longSide / Math.max(1, viewportW);
  if (ratio <= t.inline) return 'img-inline';
  if (ratio >= t.fullpage) return 'img-fullpage';
  return 'img-block';
}

// onLoad で画像クラスを差し替える component
function MdImage({ src, alt, imageDisplayMode = 'balance', onClick }) {
  const [klass, setKlass] = useState('img-block'); // 仮（読み込み前のレイアウトずれ抑制）
  function onLoad(e) {
    const img = e.currentTarget;
    const vw = window.innerWidth || document.documentElement.clientWidth || 800;
    setKlass(classifyImage(img.naturalWidth, img.naturalHeight, vw, imageDisplayMode));
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      className={klass}
      onLoad={onLoad}
      onClick={(e) => { e.stopPropagation(); onClick?.({ src, alt }); }}
    />
  );
}

// 全画面拡大モーダル（仕様書 §11 — 画像タップ拡大）
// 何を: 100vw × 100vh の暗背景に object-fit: contain で大きく表示
// なぜ: 挿絵を見たい時に元サイズで確認できる選択肢が必要。ピンチズームはブラウザ既定に任せる
function ImageModal({ image, onClose }) {
  if (!image) return null;
  return (
    <div className="image-modal" onClick={onClose} role="dialog" aria-modal="true">
      <img src={image.src} alt={image.alt || ''} />
    </div>
  );
}

export default function MarkdownRenderer({
  chapter, chapters, onWikiLinkClick, hrStyle = 'page-break', imageDisplayMode = 'balance',
  // §14 読み替え
  rewriteRules,
  rewriteHighlight = true,
  // §15 画像差し込みの URL 解決関数（インスタンス（Blob URL）or assets 相対パス）
  insertedAssetUrl,
}) {
  const [modal, setModal] = useState(null);

  // 何を: wikilinks プラグインに「既存リンク一覧」と「リンク先解決ルール」を渡す
  const { permalinks, pageResolver } = useMemo(() => {
    const list = (chapters || []).map((c) => c.id);
    const idMap = new Map();
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

  if (chapter?.plainText) {
    return (
      <div className="markdown">
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'normal' }}>
          {chapter.content}
        </pre>
      </div>
    );
  }

  // 何を: 描画前に読み替えルールを適用する
  // なぜ: 仕様書 §14 — 読み替えは描画直前。原本（chapter.content）は変更しない
  const renderedMd = useMemo(() => {
    if (!rewriteRules) return chapter?.content || '';
    return applyRewrite(chapter?.content || '', rewriteRules, chapter?.id || 'index', {
      highlight: rewriteHighlight,
      assetUrlOf: insertedAssetUrl,
    });
  }, [chapter?.content, chapter?.id, rewriteRules, rewriteHighlight, insertedAssetUrl]);

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkWikiLink, { permalinks, pageResolver, hrefTemplate, aliasDivider: '|' }],
        ]}
        // 何を: rehype-raw で <mark class="rewritten"> 等のインライン HTML を描画許可
        // なぜ: §14 の読み替えハイライトを <mark> タグで表現する。
        //       sandbox 対象外（同一 React ツリー内）なので XSS リスクは
        //       「ユーザーが自分で入力した display 文字列」に限定される
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => {
          if (typeof url !== 'string') return url;
          if (url.startsWith('blob:') || url.startsWith('#') || url.startsWith('data:image/')) return url;
          return url;
        }}
        components={{
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
          // §11 MD 内画像の表示モード自動判定 + タップで拡大
          img({ src, alt }) {
            return (
              <MdImage
                src={src}
                alt={alt}
                imageDisplayMode={imageDisplayMode}
                onClick={setModal}
              />
            );
          },
          hr() {
            return <hr data-style={hrStyle} />;
          },
        }}
      >
        {renderedMd}
      </ReactMarkdown>
      <ImageModal image={modal} onClose={() => setModal(null)} />
    </div>
  );
}
