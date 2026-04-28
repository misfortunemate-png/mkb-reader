// 何を: 読み替えルール（localSettings.rewrite）の読み書きフック
// なぜ: 仕様書 Phase 3b §14 — RewritePanel から扱いやすいよう CRUD を集約。
//       永続化は useBookshelf 経由の IndexedDB（BookEntry.localSettings.rewrite）
//
// 設計原則:
//   - useSettings.localSettings は display と並列の rewrite フィールドを持つ
//   - rewrite は { speakerNames, replacements, hiddenRanges, insertedAssets }
//   - 書き込みは debounce ではなく即時（パネル外の入力欄では呼び出し側で debounce）

import { useCallback, useEffect, useRef, useState } from 'react';

const EMPTY_RULES = {
  speakerNames: {},
  replacements: [],
  hiddenRanges: [],
  insertedAssets: [],
};

export function useRewrite({ activeBookId, getLocalSettings, saveLocalSettings }) {
  const [rules, setRules] = useState(EMPTY_RULES);
  const localRef = useRef(null); // localSettings 全体（display なども含むので保持）

  // book 切替時にローカル設定を取り直し、rewrite を抽出
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeBookId || !getLocalSettings) {
        localRef.current = null;
        setRules(EMPTY_RULES);
        return;
      }
      try {
        const ls = await getLocalSettings(activeBookId);
        if (cancelled) return;
        localRef.current = ls || null;
        setRules({ ...EMPTY_RULES, ...(ls?.rewrite || {}) });
      } catch (e) {
        console.error('useRewrite: getLocalSettings failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [activeBookId, getLocalSettings]);

  // 保存（rules 全体を一括）
  const persist = useCallback(async (nextRules) => {
    if (!activeBookId || !saveLocalSettings) return;
    const ls = { ...(localRef.current || {}) };
    ls.rewrite = nextRules;
    localRef.current = ls;
    await saveLocalSettings(activeBookId, ls);
  }, [activeBookId, saveLocalSettings]);

  // ───── 公開 API ─────

  const setSpeakerName = useCallback((sender, name) => {
    setRules((prev) => {
      const sn = { ...(prev.speakerNames || {}) };
      if (name && name.trim()) sn[sender] = name.trim();
      else delete sn[sender];
      const next = { ...prev, speakerNames: sn };
      persist(next);
      return next;
    });
  }, [persist]);

  const addReplacement = useCallback((rep = {}) => {
    setRules((prev) => {
      const next = {
        ...prev,
        replacements: [
          ...(prev.replacements || []),
          {
            id: rep.id || crypto.randomUUID(),
            pattern: rep.pattern || '',
            display: rep.display || '',
            scope: rep.scope || 'all',
            enabled: rep.enabled !== false,
          },
        ],
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateReplacement = useCallback((id, patch) => {
    setRules((prev) => {
      const next = {
        ...prev,
        replacements: (prev.replacements || []).map((r) => r.id === id ? { ...r, ...patch } : r),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const removeReplacement = useCallback((id) => {
    setRules((prev) => {
      const next = {
        ...prev,
        replacements: (prev.replacements || []).filter((r) => r.id !== id),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const addHiddenRange = useCallback((range = {}) => {
    setRules((prev) => {
      const next = {
        ...prev,
        hiddenRanges: [
          ...(prev.hiddenRanges || []),
          {
            id: range.id || crypto.randomUUID(),
            chapterId: range.chapterId || 'all',
            startLine: Number(range.startLine) || 1,
            endLine: Number(range.endLine) || 1,
            enabled: range.enabled !== false,
          },
        ],
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateHiddenRange = useCallback((id, patch) => {
    setRules((prev) => {
      const next = {
        ...prev,
        hiddenRanges: (prev.hiddenRanges || []).map((r) => r.id === id ? { ...r, ...patch } : r),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const removeHiddenRange = useCallback((id) => {
    setRules((prev) => {
      const next = {
        ...prev,
        hiddenRanges: (prev.hiddenRanges || []).filter((r) => r.id !== id),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  // §15 で使う: insertedAssets の追加・削除
  const addInsertedAsset = useCallback((asset) => {
    setRules((prev) => {
      const next = {
        ...prev,
        insertedAssets: [...(prev.insertedAssets || []), asset],
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateInsertedAsset = useCallback((id, patch) => {
    setRules((prev) => {
      const next = {
        ...prev,
        insertedAssets: (prev.insertedAssets || []).map((a) => a.id === id ? { ...a, ...patch } : a),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const removeInsertedAsset = useCallback((id) => {
    setRules((prev) => {
      const next = {
        ...prev,
        insertedAssets: (prev.insertedAssets || []).filter((a) => a.id !== id),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  return {
    rules,
    setSpeakerName,
    addReplacement, updateReplacement, removeReplacement,
    addHiddenRange, updateHiddenRange, removeHiddenRange,
    addInsertedAsset, updateInsertedAsset, removeInsertedAsset,
  };
}
