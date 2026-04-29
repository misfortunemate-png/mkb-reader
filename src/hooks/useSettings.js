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

// §25 欧文フォント選択肢（仕様書 §25 — PAIRING を廃止し LATIN_FONTS に統一）
export const LATIN_FONTS = {
  'eb-garamond': {
    label: 'EB Garamond',
    family: "'EB Garamond'",
    href: 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap',
  },
  'libre-baskerville': {
    label: 'Libre Baskerville',
    family: "'Libre Baskerville'",
    href: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
  },
  'lora': {
    label: 'Lora',
    family: "'Lora'",
    href: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap',
  },
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
  // §14 読み替え箇所のハイライト表示（薄背景色）
  rewriteHighlight: true,
  // §24 タップゾーン（ページ送り領域の制限）
  tapZone: { preset: 'bottom-corners', height: 80, width: 30 },
  // §25 欧文フォント
  latinFont: 'eb-garamond',
  // §23 ヘッダー高さ（px）— アイコンサイズに連動
  headerHeight: 48,
};

// §11: 画像表示プリセットの閾値（仕様書 §11 表）
// 長辺 / viewportWidth がこの値以下: inline / 以上: fullpage
export const IMAGE_DISPLAY_THRESHOLDS = {
  'text-first': { inline: 0.08, fullpage: 0.90 },
  'balance':    { inline: 0.10, fullpage: 0.75 },
  'image-first':{ inline: 0.05, fullpage: 0.50 },
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
  // §25 欧文フォント — 欧文を先頭に置いて、和文を後置（欧文部分だけ別フォントを当てる）
  const lf = LATIN_FONTS[s.latinFont] || LATIN_FONTS[DEFAULTS.latinFont];
  const stack = `${lf.family}, ${f.family}, 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
  root.style.setProperty('--font-body', stack);
  // §7 カスタマイズ
  root.style.setProperty('--font-size', `${s.fontSize}px`);
  root.style.setProperty('--line-height', String(s.lineHeight));
  root.style.setProperty('--content-padding', `${s.contentPadding}rem`);
  // §23 ヘッダー高さ
  root.style.setProperty('--header-h', `${s.headerHeight ?? 48}px`);
}

// ───── フック本体 ─────

// 何を: useSettings は次の二層を扱う
// - global: localStorage 永続化のグローバルデフォルト
// - local : 開いているファイル（bookId）の上書き設定。useBookshelf 経由で IndexedDB に保存
// なぜ: 仕様書 Phase 3a §4.6 — 原本を変更せず、ファイル単位の設定上書きを許す非破壊モデル
//
// scope = 'global' | 'local' によって update / applyPreset / reset の対象を切替える。
// 表示に使う「実効設定」は getEffectiveSettings(local?) で global と local をマージした結果。
// 実効設定の DOM 反映（CSS 変数、テーマ、フォント link）は同じく useEffect で行う。

export function useSettings({ activeBookId, getLocalSettings, saveLocalSettings } = {}) {
  // global は localStorage、local は引数経由（IndexedDB ベース）
  const [global, setGlobal] = useState(loadFromStorage);
  const [local, setLocal] = useState(null);
  const [scope, setScope] = useState('global'); // 設定パネルが「すべての本」/「この本」のどちらを編集中か
  const initialMounted = useRef(false);

  // book 切替時に local を読み直す
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeBookId || !getLocalSettings) {
        setLocal(null);
        return;
      }
      try {
        const ls = await getLocalSettings(activeBookId);
        if (!cancelled) setLocal(ls || null);
      } catch (e) {
        console.error('getLocalSettings failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [activeBookId, getLocalSettings]);

  // 何を: 実効設定（local.display ∪ global）
  // なぜ: 仕様書 §4.6 の解決順序「local.display.X ?? global.X ?? デフォルト」
  const effective = useMemo(() => {
    const ld = local?.display || {};
    return { ...DEFAULTS, ...global, ...ld };
  }, [global, local]);

  // 実効設定の永続化（global のみ localStorage、local は呼び出し側で保存）
  useEffect(() => {
    saveToStorage(global);
  }, [global]);

  // 実効設定 → DOM 反映
  useEffect(() => {
    applyToDocument(effective);
  }, [effective]);

  // §25 フォント link の動的ロード/アンロード（日本語・欧文とも実効値で判定）
  useEffect(() => {
    if (!initialMounted.current) {
      removeStaticFontLinks();
      initialMounted.current = true;
    }
    const f = FONTS[effective.font] || FONTS[DEFAULTS.font];
    const lf = LATIN_FONTS[effective.latinFont] || LATIN_FONTS[DEFAULTS.latinFont];
    ensureFontLink(f.href, effective.font);
    ensureFontLink(lf.href, `latin-${effective.latinFont}`);
    removeFontLinks([effective.font, `latin-${effective.latinFont}`]);
  }, [effective.font, effective.latinFont]);

  // ───── 公開 API ─────

  // scope に応じて global / local.display を更新
  const update = useCallback((patch) => {
    if (scope === 'local' && activeBookId && saveLocalSettings) {
      const next = { ...(local || {}) };
      next.display = { ...(next.display || {}), ...patch };
      setLocal(next);
      saveLocalSettings(activeBookId, next).catch((e) => console.error(e));
    } else {
      setGlobal((prev) => ({ ...prev, ...patch }));
    }
  }, [scope, activeBookId, local, saveLocalSettings]);

  const applyPreset = useCallback((presetKey) => {
    const p = PRESETS[presetKey];
    if (!p) return;
    update(p);
  }, [update]);

  const reset = useCallback(() => {
    if (scope === 'local' && activeBookId && saveLocalSettings) {
      // ローカル設定を全削除（グローバルに戻す）
      const next = { ...(local || {}) };
      delete next.display;
      setLocal(Object.keys(next).length ? next : null);
      saveLocalSettings(activeBookId, Object.keys(next).length ? next : null).catch((e) => console.error(e));
    } else {
      setGlobal({ ...DEFAULTS });
    }
  }, [scope, activeBookId, local, saveLocalSettings]);

  // 何を: グローバル設定を DEFAULTS に強制リセット（デバッグ・初期化用）
  // なぜ: 検証中に永続化された設定値が壊れて表示が乱れるケースを救う。
  //   通常の reset() は scope に応じて local/global を切り替えるが、
  //   こちらは scope に関係なく必ず global を初期化する
  const resetGlobal = useCallback(() => {
    setGlobal({ ...DEFAULTS });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // 個別キーをリセット（ローカルだけからその key を削除しグローバルへ戻す）
  const resetLocalKey = useCallback((key) => {
    if (!activeBookId || !saveLocalSettings) return;
    const next = { ...(local || {}) };
    if (next.display) {
      const d = { ...next.display };
      delete d[key];
      next.display = Object.keys(d).length ? d : undefined;
      if (!next.display && !next.patches && !next.insertedAssets) {
        setLocal(null);
        saveLocalSettings(activeBookId, null).catch((e) => console.error(e));
        return;
      }
    }
    setLocal(next);
    saveLocalSettings(activeBookId, next).catch((e) => console.error(e));
  }, [activeBookId, local, saveLocalSettings]);

  const activePreset = useMemo(() => {
    for (const [k, p] of Object.entries(PRESETS)) {
      if (
        Math.abs(effective.fontSize - p.fontSize) < 0.001 &&
        Math.abs(effective.lineHeight - p.lineHeight) < 0.001 &&
        Math.abs(effective.contentPadding - p.contentPadding) < 0.001
      ) return k;
    }
    return null;
  }, [effective.fontSize, effective.lineHeight, effective.contentPadding]);

  // ローカル設定がどのキーで上書きされているか（ドット表示用）
  const overriddenKeys = useMemo(() => {
    return new Set(Object.keys(local?.display || {}));
  }, [local]);

  // 後方互換: 既存コードは settings 名で参照しているので alias
  const settings = effective;

  return {
    settings,
    update, applyPreset, reset, resetLocalKey, resetGlobal,
    activePreset,
    scope, setScope,
    hasLocal: !!local,
    overriddenKeys,
  };
}
