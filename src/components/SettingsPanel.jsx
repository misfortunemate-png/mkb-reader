// 何を: 設定ボトムシート（仕様書 Phase 3a §4.5 — プリセット主導のセクション分割）
// なぜ: 数値入力を主 UI から退避させ、まず「ゆったり/標準/コンパクト」など
//       2〜4 択のボタンで読書体験を選ぶ。スライダーは「詳細設定」として折りたたむ。
//
// 仕様書 §4.6 の二層構造に対応:
//   - ヘッダーに「すべての本 / この本」のスコープ切替
//   - ローカル設定で上書きされた項目はドット表示
//   - 各項目に「リセット」アイコン（ローカル時のみ表示）

import { useEffect, useState } from 'react';
import { FONTS, THEMES, PRESETS } from '../hooks/useSettings.js';

const HR_STYLES = [
  { key: 'page-break', label: '改ページ' },
  { key: 'line', label: '区切り線' },
  { key: 'space', label: '余白' },
  { key: 'ornament', label: '装飾' },
];
const IMG_MODES = [
  { key: 'text-first', label: '文章優先' },
  { key: 'balance', label: 'バランス' },
  { key: 'image-first', label: '画像優先' },
];

function Section({ title, children, defaultOpen = true, overridden = false, onReset }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`settings-section ${overridden ? 'overridden' : ''}`}>
      <header className="section-header">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="section-caret">{open ? '▾' : '▸'}</span>
          <h3>{title}</h3>
          {overridden && <span className="dot" title="この本の設定で上書き中" />}
        </button>
        {onReset && overridden && (
          <button type="button" className="reset-btn" onClick={onReset} title="グローバルに戻す">
            リセット
          </button>
        )}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export default function SettingsPanel({
  open,
  onClose,
  settings,
  update,
  applyPreset,
  activePreset,
  // 二層構造（仕様書 §4.6）
  scope,
  setScope,
  hasLocal,
  overriddenKeys,
  resetLocalKey,
  canEditLocal,        // bookId が無い時は「この本」タブを無効化
  // 本棚全削除（検証用）
  bookCount = 0,
  onDeleteAllBooks,
  // 設定を初期値に戻す（検証用）
  onResetGlobalSettings,
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const isOverridden = (k) => overriddenKeys && overriddenKeys.has(k);
  const onResetKey = (k) => () => resetLocalKey?.(k);
  // 「文字」セクションは複数キーをまとめて扱う
  const charsOverridden = ['fontSize', 'lineHeight', 'contentPadding'].some(isOverridden);

  // 「文字」の詳細スライダー折りたたみ
  const [charsDetailOpen, setCharsDetailOpen] = useState(false);

  return (
    <>
      <div
        className={`settings-overlay ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`settings-sheet ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="設定"
      >
        <div className="settings-handle" onClick={onClose} />

        {/* スコープ切替 */}
        <div className="scope-toggle">
          <button
            type="button"
            className={scope === 'global' ? 'active' : ''}
            onClick={() => setScope?.('global')}
          >すべての本</button>
          <button
            type="button"
            className={scope === 'local' ? 'active' : ''}
            onClick={() => canEditLocal && setScope?.('local')}
            disabled={!canEditLocal}
            title={canEditLocal ? '' : '本棚に保存されている本のみ個別設定が可能'}
          >この本{hasLocal ? ' ●' : ''}</button>
        </div>

        {/* §7-プリセット → 「文字」セクションへ統合 */}
        <Section
          title="文字"
          overridden={charsOverridden}
          onReset={() => {
            ['fontSize','lineHeight','contentPadding'].forEach((k) => isOverridden(k) && resetLocalKey?.(k));
          }}
        >
          <div className="settings-row">
            {Object.keys(PRESETS).map((k) => (
              <button
                key={k}
                type="button"
                className={`settings-btn ${activePreset === k ? 'active' : ''}`}
                onClick={() => applyPreset(k)}
              >
                {k === 'loose' ? 'ゆったり' : k === 'standard' ? '標準' : 'コンパクト'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="details-toggle"
            onClick={() => setCharsDetailOpen((v) => !v)}
          >
            {charsDetailOpen ? '▾ 詳細を閉じる' : '▸ 詳細'}
          </button>
          {charsDetailOpen && (
            <>
              <div className="slider-row">
                <span className="slider-value">14px</span>
                <input
                  type="range" min="14" max="28" step="1"
                  value={settings.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                />
                <span className="slider-value">{settings.fontSize}px</span>
              </div>
              <div className="slider-row">
                <span className="slider-value">1.4</span>
                <input
                  type="range" min="1.4" max="2.4" step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => update({ lineHeight: Number(e.target.value) })}
                />
                <span className="slider-value">{settings.lineHeight.toFixed(1)}</span>
              </div>
              <div className="slider-row">
                <span className="slider-value">0.5</span>
                <input
                  type="range" min="0.5" max="3.0" step="0.25"
                  value={settings.contentPadding}
                  onChange={(e) => update({ contentPadding: Number(e.target.value) })}
                />
                <span className="slider-value">{settings.contentPadding.toFixed(2)}rem</span>
              </div>
            </>
          )}
        </Section>

        <Section title="フォント" overridden={isOverridden('font')} onReset={onResetKey('font')}>
          <div className="radio-group">
            {Object.entries(FONTS).map(([k, f]) => (
              <label key={k} className={settings.font === k ? 'active' : ''}>
                <input
                  type="radio" name="font"
                  checked={settings.font === k}
                  onChange={() => update({ font: k })}
                />
                {f.label}
              </label>
            ))}
          </div>
          <div
            className="font-preview"
            style={{ fontFamily: FONTS[settings.font]?.family || 'inherit' }}
          >
            あいうえお ABCabc 0123 — 美しく読む
          </div>
        </Section>

        <Section title="テーマ" overridden={isOverridden('theme')} onReset={onResetKey('theme')}>
          <div className="settings-row">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={t}
                title={t}
                className={`theme-swatch ${settings.theme === t ? 'active' : ''}`}
                data-theme={t}
                onClick={() => update({ theme: t })}
              />
            ))}
          </div>
        </Section>

        <Section title="操作" overridden={isOverridden('swipeDirection')} onReset={onResetKey('swipeDirection')}>
          <div className="toggle">
            <button
              type="button"
              className={settings.swipeDirection === 'horizontal' ? 'active' : ''}
              onClick={() => update({ swipeDirection: 'horizontal' })}
            >左右スワイプ</button>
            <button
              type="button"
              className={settings.swipeDirection === 'vertical' ? 'active' : ''}
              onClick={() => update({ swipeDirection: 'vertical' })}
            >上下スワイプ</button>
          </div>
        </Section>

        <Section title="区切り線" overridden={isOverridden('hrStyle')} onReset={onResetKey('hrStyle')}>
          <div className="radio-group">
            {HR_STYLES.map((s) => (
              <label key={s.key} className={settings.hrStyle === s.key ? 'active' : ''}>
                <input
                  type="radio" name="hrStyle"
                  checked={settings.hrStyle === s.key}
                  onChange={() => update({ hrStyle: s.key })}
                />
                {s.label}
              </label>
            ))}
          </div>
        </Section>

        <Section title="画像表示" overridden={isOverridden('imageDisplayMode')} onReset={onResetKey('imageDisplayMode')}>
          <div className="settings-row">
            {IMG_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`settings-btn ${settings.imageDisplayMode === m.key ? 'active' : ''}`}
                onClick={() => update({ imageDisplayMode: m.key })}
              >{m.label}</button>
            ))}
          </div>
        </Section>

        <Section title="読み替えハイライト" overridden={isOverridden('rewriteHighlight')} onReset={onResetKey('rewriteHighlight')}>
          <div className="toggle">
            <button
              type="button"
              className={settings.rewriteHighlight ? 'active' : ''}
              onClick={() => update({ rewriteHighlight: true })}
            >表示</button>
            <button
              type="button"
              className={!settings.rewriteHighlight ? 'active' : ''}
              onClick={() => update({ rewriteHighlight: false })}
            >非表示</button>
          </div>
        </Section>

        <Section title="表示モード" overridden={isOverridden('mode')} onReset={onResetKey('mode')}>
          <div className="toggle">
            <button
              type="button"
              className={settings.mode === 'page' ? 'active' : ''}
              onClick={() => update({ mode: 'page' })}
            >ページ送り</button>
            <button
              type="button"
              className={settings.mode === 'scroll' ? 'active' : ''}
              onClick={() => update({ mode: 'scroll' })}
            >スクロール</button>
          </div>
        </Section>

        {/* データ管理 — 検証用。設計思想に反する操作（破壊的）なので最下部に配置 */}
        {(onDeleteAllBooks || onResetGlobalSettings) && (
          <Section title="データ管理（検証用）" defaultOpen={false}>
            {onDeleteAllBooks && (
              <>
                <div className="settings-row">
                  <span className="rw-hint" style={{ flex: 1 }}>
                    本棚: {bookCount} 件
                  </span>
                  <button
                    type="button"
                    className="settings-btn danger"
                    onClick={onDeleteAllBooks}
                    disabled={bookCount === 0}
                  >本棚を全削除</button>
                </div>
                <p className="rw-hint" style={{ marginTop: '0.4rem', marginBottom: '0.8rem' }}>
                  IndexedDB の books ストアを空にします。元に戻せません。
                </p>
              </>
            )}
            {onResetGlobalSettings && (
              <>
                <div className="settings-row">
                  <span className="rw-hint" style={{ flex: 1 }}>
                    グローバル設定（フォント・テーマ・サイズ等）
                  </span>
                  <button
                    type="button"
                    className="settings-btn danger"
                    onClick={onResetGlobalSettings}
                  >設定を初期値に戻す</button>
                </div>
                <p className="rw-hint" style={{ marginTop: '0.4rem' }}>
                  localStorage の設定値を消去し、すべてデフォルトに戻します。
                  本棚データは消えません。本ごとのローカル設定（この本）も消えません。
                </p>
              </>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
