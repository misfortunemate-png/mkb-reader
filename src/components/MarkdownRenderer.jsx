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

// 何を: 縦中横（tate-chu-yoko）rehype プラグイン
// なぜ: §30 — 縦書きモード時、2〜3文字の半角英数字を text-combine-upright:all で正立表示。
//       4文字以上の英単語（"Claude" 等）は横倒しのまま残す（仕様書 §30）
function rehypeTateChuYoko() {
  // HAST テキストノードを再帰走査し、2-3文字の半角英数ランをラップする
  function processNode(node, parent, index) {
    if (node.type === 'text') {
      const text = node.value;
      // 高速パス: 2-3文字の半角英数字がなければスキップ
      if (!/[A-Za-z0-9]{2}/.test(text)) return 0;

      const parts = [];
      let lastIdx = 0;
      // 連続する半角英数字のランを抽出
      const re = /([A-Za-z0-9]+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) {
          parts.push({ type: 'text', value: text.slice(lastIdx, m.index) });
        }
        const run = m[1];
        if (run.length >= 2 && run.length <= 3) {
          // 2-3文字: text-combine-upright: all で縦中横
          parts.push({
            type: 'element',
            tagName: 'span',
            properties: { style: 'text-combine-upright: all' },
            children: [{ type: 'text', value: run }],
          });
        } else {
          // 1文字または4文字以上: 横倒しのまま
          parts.push({ type: 'text', value: run });
        }
        lastIdx = m.index + run.length;
      }
      if (lastIdx < text.length) parts.push({ type: 'text', value: text.slice(lastIdx) });

      if (parent && parts.some((p) => p.type === 'element')) {
        parent.children.splice(index, 1, ...parts);
        return parts.length - 1; // 追加されたノード数の差分を返す（呼び出し元がインデックスを調整）
      }
      return 0;
    }
    // 子ノードを持つ要素は再帰処理
    if (node.children) {
      let i = 0;
      while (i < node.children.length) {
        const extra = processNode(node.children[i], node, i);
        i += 1 + extra;
      }
    }
    return 0;
  }
  return (tree) => processNode(tree, null, 0);
}

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
// §21 §15 拡張: fixedClass が指定された場合は自動判定をスキップしてそのクラスを使用
// assetId がある（差し込み画像）場合は onAssetTap を呼ぶ（ズームしない）
function MdImage({ src, alt, imageDisplayMode = 'balance', onClick, onAssetTap, fixedClass, assetId }) {
  const [klass, setKlass] = useState(fixedClass || 'img-block');
  function onLoad(e) {
    if (fixedClass) return;
    const img = e.currentTarget;
    const vw = window.innerWidth || document.documentElement.clientWidth || 800;
    setKlass(classifyImage(img.naturalWidth, img.naturalHeight, vw, imageDisplayMode));
  }
  function handleClick(e) {
    e.stopPropagation();
    if (assetId) onAssetTap?.(assetId);
    else onClick?.({ src, alt });
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      className={klass}
      onLoad={onLoad}
      onClick={handleClick}
      data-asset-id={assetId || undefined}
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
  rewriteRules,
  rewriteHighlight = true,
  insertedAssetUrl,
  // 差し込み画像タップ（サイズ変更/削除）
  onInsertedAssetTap,
  // §30 縦書きモード
  vertical = false,
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

  // §30: 縦書き時のみ縦中横プラグインを追加
  const rehypePlugins = useMemo(
    () => vertical ? [rehypeRaw, rehypeTateChuYoko] : [rehypeRaw],
    [vertical],
  );

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
        rehypePlugins={rehypePlugins}
        urlTransform={(url) => {
          if (typeof url !== 'string') return url;
          if (url.startsWith('blob:') || url.startsWith('#') || url.startsWith('data:image/')) return url;
          return url;
        }}
        components={{
          // §21 data-source-line: 長押しメニューの行番号特定に使用（AST positionから取得）
          // なぜ: 行番号がないと「この行を非表示」「テキストを読み替える」が機能しない。
          //   positionがない場合は属性を付与しない（graceful degradation）
          p({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            // §22 話者名スタイリング: 段落が単一の strong 要素だけなら話者行として扱う
            if (node.children?.length === 1 && node.children[0]?.type === 'strong') {
              const text = (node.children[0].children || []).map((c) => c.value || '').join('');
              const sn = rewriteRules?.speakerNames || {};
              const tl = text.toLowerCase();
              const humanAlias = (sn.human || '').toLowerCase();
              const assistantAlias = (sn.assistant || '').toLowerCase();
              if (tl === 'human' || tl === 'user' || (humanAlias && tl === humanAlias)) {
                return <p className="speaker-human" data-source-line={line || undefined} {...rest}>{children}</p>;
              }
              if (tl === 'assistant' || (assistantAlias && tl === assistantAlias)) {
                return <p className="speaker-assistant" data-source-line={line || undefined} {...rest}>{children}</p>;
              }
            }
            return <p data-source-line={line || undefined} {...rest}>{children}</p>;
          },
          h1({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <h1 data-source-line={line || undefined} {...rest}>{children}</h1>;
          },
          h2({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <h2 data-source-line={line || undefined} {...rest}>{children}</h2>;
          },
          h3({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <h3 data-source-line={line || undefined} {...rest}>{children}</h3>;
          },
          h4({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <h4 data-source-line={line || undefined} {...rest}>{children}</h4>;
          },
          h5({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <h5 data-source-line={line || undefined} {...rest}>{children}</h5>;
          },
          h6({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <h6 data-source-line={line || undefined} {...rest}>{children}</h6>;
          },
          blockquote({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <blockquote data-source-line={line || undefined} {...rest}>{children}</blockquote>;
          },
          li({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <li data-source-line={line || undefined} {...rest}>{children}</li>;
          },
          pre({ node, children, ...rest }) {
            const line = node.position?.start?.line;
            return <pre data-source-line={line || undefined} {...rest}>{children}</pre>;
          },
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
          // §21 §15 拡張: className（displaySize 由来のクラス）があれば fixedClass として渡す
          img({ src, alt, className, ...rest }) {
            const assetId = rest['data-asset-id'];
            return (
              <MdImage
                src={src}
                alt={alt}
                imageDisplayMode={imageDisplayMode}
                onClick={setModal}
                onAssetTap={onInsertedAssetTap}
                fixedClass={className || undefined}
                assetId={assetId}
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
