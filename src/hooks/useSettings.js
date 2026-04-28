// 何を: 表示・読書体験に関わる全設定の一元管理（§5 フォント / §6 テーマ / §7 カスタマイズ）
// なぜ: 仕様書 Phase 2 §7「正解がないから設定で制御する」。
//       設定は localStorage に永続化、CSS 変数 / data-theme 属性 / フォント link tag に即時反映。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ───── 定数定義 ─────

// §5 フォント（Google Fonts URL パラメータ + ファミリー名）
export const FONTS = {
  'noto-serif-jp': {
    label: 'Noto Serif JP',
    family: "'Noto Serif JP'",
    href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap',
  },
  'shippori-mincho': {
    label: 'Shippori Mincho',
    family: "'Shippori Mincho'",
    href: 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;700&display=swap',
  },
  'zen-old-mincho': {
    label: 'Zen Old Mincho',
    family: "'Zen Old Mincho'",
    href: 'https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;700&display=swap',
  },
};

// 欧文ペアリング（仕様書 §5 — Cormorant Garamond を仮採用）
export const PAIRING = {
  family: "'Cormorant Garamond'",
  href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&display=swap',
};

export const THEMES = ['light', 'dark', 'sepia'];

// §7 表示カスタマイズの既定値・範囲
export const DEFAULTS = {
  font: 'noto-serif-jp',
  theme: 'light',
  fontSize: 18,        // px (14〜28, 1px刻み)
  lineHeight: 1.9,     // (1.4〜2.4, 0.1刻み)
  contentPadding: 1.5, // rem (0.5〜3.0, 0.25rem刻み)
  swipeDirection: 'horizontal', // 'horizontal' | 'vertical'
  hrStyle: 'page-break',        // 'page-break' | 'line' | 'space' | 'ornament'
  mode: 'page',        // 'page' | 'scroll' （Phase 1 で先行実装した key を統合）
  // §11 MD 内画像の表示モード判定プリセット
  imageDisplayMode: 'balance',  // 'text-first' | 'balance' | 'image-first'
};

// §11: 画像表示プリセットの閾値（仕様書 §11 表）
// 長辺 / viewportWidth がこの値以下: inline / 以上: fullpage
export const IMAGE_DISPLAY_THRESHOLDS = {
  'text-first': { inline: 0.15, fullpage: 0.90 },
  'balance':    { inline: 0.25, fullpage: 0.75 },
  'image-first':{ inline: 0.10, fullpage: 0.50 },
};

// プリセット（仕様書 §7）
export const PRESETS = {
  loose:    { fontSize: 20, lineHeight: 2.2, contentPadding: 2.5 },
  standard: { fontSize: 18, lineHeight: 1.9, contentPadding: 1.5 },
  compact:  { fontSize: 15, lineHeight: 1.6, contentPadding: 0.75 },
};

const STORAGE_KEY = 'mkb-reader.settings.v1';
// Phase 1 互換: 古い mode キーを取り込んで一回だけ移行
const LEGACY_MODE_KEY = 'mkb-reader.mode';

// ───── 内部ユーティリティ ─────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      return { ...DEFAULTS, ...obj };
    }
    // 旧キーから移行
    const legacyMode = localStorage.getItem(LEGACY_MODE_KEY);
    if (legacyMode === 'scroll' || legacyMode === 'page') {
      return { ...DEFAULTS, mode: legacyMode };
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function saveToStorage(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // 旧キーは新キーへ統合済みなので削除（次回以降の混乱回避）
    localStorage.removeItem(LEGACY_MODE_KEY);
  } catch { /* ignore */ }
}

// 何を: Google Fonts の <link> を head に追加し、不要な link を除去する
// なぜ: 仕様書 §5 — 選択フォントのみ遅延ロード、未選択フォントは削除
function ensureFontLink(href, key) {
  // 既存のフォント用 link を一旦全部 mark で識別
  const id = `mkb-font-${key}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
function removeFontLinks(keepKeys) {
  const keep = new Set(keepKeys.map((k) => `mkb-font-${k}`));
  document.querySelectorAll('link[id^="mkb-font-"]').forEach((l) => {
    if (!keep.has(l.id)) l.remove();
  });
}

// 何を: index.html に静的に書かれている古い Noto Serif JP の link を取り除く
// なぜ: useSettings が動的にロード管理するため、固定 link を残すと二重読み込み・
//       未選択時に削除しきれない不整合になる。初回マウント時に一度だけ実行
function removeStaticFontLinks() {
  document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]').forEach((l) => {
    if (!l.id || !l.id.startsWith('mkb-font-')) l.remove();
  });
}

// CSS 変数 / data-theme への反映
function applyToDocument(s) {
  const root = document.documentElement;
  // §6 テーマ
  root.setAttribute('data-theme', s.theme);
  // §5 フォント（本文ファミリー）
  const f = FONTS[s.font] || FONTS[DEFAULTS.font];
  // 仕様書 §5 — 欧文を先頭に置いて、和文を後置（欧文部分だけ別フォントを当てる）
  const stack = `${PAIRING.family}, ${f.family}, 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
  root.style.setProperty('--font-body', stack);
  // §7 カスタマイズ
  root.style.setProperty('--font-size', `${s.fontSize}px`);
  root.style.setProperty('--line-height', String(s.lineHeight));
  root.style.setProperty('--content-padding', `${s.contentPadding}rem`);
}

// ───── フック本体 ─────

export function useSettings() {
  const [settings, setSettings] = useState(loadFromStorage);
  const initialMounted = useRef(false);

  // 設定変更で localStorage と DOM 反映
  useEffect(() => {
    saveToStorage(settings);
    applyToDocument(settings);
  }, [settings]);

  // フォント link の動的ロード/アンロード
  useEffect(() => {
    if (!initialMounted.current) {
      removeStaticFontLinks();
      initialMounted.current = true;
    }
    const f = FONTS[settings.font] || FONTS[DEFAULTS.font];
    ensureFontLink(f.href, settings.font);
    ensureFontLink(PAIRING.href, 'pairing');
    // 選択フォント以外は削除（pairing は常に保持）
    removeFontLinks([settings.font, 'pairing']);
  }, [settings.font]);

  // ───── 公開 API ─────

  const update = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyPreset = useCallback((presetKey) => {
    const p = PRESETS[presetKey];
    if (!p) return;
    setSettings((prev) => ({ ...prev, ...p, _preset: presetKey }));
  }, []);

  const reset = useCallback(() => setSettings({ ...DEFAULTS }), []);

  // 現在の値がどのプリセットにマッチするか（プリセットボタンのアクティブ表示用）
  const activePreset = useMemo(() => {
    for (const [k, p] of Object.entries(PRESETS)) {
      if (
        Math.abs(settings.fontSize - p.fontSize) < 0.001 &&
        Math.abs(settings.lineHeight - p.lineHeight) < 0.001 &&
        Math.abs(settings.contentPadding - p.contentPadding) < 0.001
      ) return k;
    }
    return null;
  }, [settings.fontSize, settings.lineHeight, settings.contentPadding]);

  return { settings, update, applyPreset, reset, activePreset };
}
