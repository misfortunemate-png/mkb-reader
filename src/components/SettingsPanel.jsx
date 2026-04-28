// 何を: 設定ボトムシート（§5 フォント / §6 テーマ / §7 カスタマイズ）
// なぜ: 仕様書 Phase 2 §7 — 「設定変更がリアルタイム反映」「背景としてビューア本文が見える」
//       useSettings フックの settings/update/applyPreset/activePreset を受け取って描画する純UI

import { useEffect } from 'react';
import { FONTS, THEMES, PRESETS } from '../hooks/useSettings.js';

const HR_STYLES = [
  { key: 'page-break', label: '改ページ' },
  { key: 'line', label: '区切り線' },
  { key: 'space', label: '余白' },
  { key: 'ornament', label: '装飾' },
];

export default function SettingsPanel({
  open,
  onClose,
  settings,
  update,
  applyPreset,
  activePreset,
}) {
  // モバイルでシートが開いている間は body スクロールロック
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

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

        {/* §7 プリセット */}
        <section className="settings-section">
          <h3>プリセット</h3>
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
        </section>

        {/* §5 フォント */}
        <section className="settings-section">
          <h3>フォント</h3>
          <div className="radio-group">
            {Object.entries(FONTS).map(([k, f]) => (
              <label key={k} className={settings.font === k ? 'active' : ''}>
                <input
                  type="radio"
                  name="font"
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
        </section>

        {/* §6 テーマ */}
        <section className="settings-section">
          <h3>テーマ</h3>
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
        </section>

        {/* §7 文字サイズ */}
        <section className="settings-section">
          <h3>文字サイズ</h3>
          <div className="slider-row">
            <span className="slider-value">14px</span>
            <input
              type="range"
              min="14"
              max="28"
              step="1"
              value={settings.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
            />
            <span className="slider-value">{settings.fontSize}px</span>
          </div>
        </section>

        {/* §7 行間 */}
        <section className="settings-section">
          <h3>行間</h3>
          <div className="slider-row">
            <span className="slider-value">1.4</span>
            <input
              type="range"
              min="1.4"
              max="2.4"
              step="0.1"
              value={settings.lineHeight}
              onChange={(e) => update({ lineHeight: Number(e.target.value) })}
            />
            <span className="slider-value">{settings.lineHeight.toFixed(1)}</span>
          </div>
        </section>

        {/* §7 左右余白 */}
        <section className="settings-section">
          <h3>左右余白</h3>
          <div className="slider-row">
            <span className="slider-value">0.5</span>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.25"
              value={settings.contentPadding}
              onChange={(e) => update({ contentPadding: Number(e.target.value) })}
            />
            <span className="slider-value">{settings.contentPadding.toFixed(2)}rem</span>
          </div>
        </section>

        {/* §7 スワイプ方向 */}
        <section className="settings-section">
          <h3>スワイプ方向</h3>
          <div className="toggle">
            <button
              type="button"
              className={settings.swipeDirection === 'horizontal' ? 'active' : ''}
              onClick={() => update({ swipeDirection: 'horizontal' })}
            >
              左右
            </button>
            <button
              type="button"
              className={settings.swipeDirection === 'vertical' ? 'active' : ''}
              onClick={() => update({ swipeDirection: 'vertical' })}
            >
              上下
            </button>
          </div>
        </section>

        {/* §7 ページ／スクロール */}
        <section className="settings-section">
          <h3>表示モード</h3>
          <div className="toggle">
            <button
              type="button"
              className={settings.mode === 'page' ? 'active' : ''}
              onClick={() => update({ mode: 'page' })}
            >
              ページ送り
            </button>
            <button
              type="button"
              className={settings.mode === 'scroll' ? 'active' : ''}
              onClick={() => update({ mode: 'scroll' })}
            >
              スクロール
            </button>
          </div>
        </section>

        {/* §7 ---の表示 */}
        <section className="settings-section">
          <h3>「---」の表示</h3>
          <div className="radio-group">
            {HR_STYLES.map((s) => (
              <label key={s.key} className={settings.hrStyle === s.key ? 'active' : ''}>
                <input
                  type="radio"
                  name="hrStyle"
                  checked={settings.hrStyle === s.key}
                  onChange={() => update({ hrStyle: s.key })}
                />
                {s.label}
              </label>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
