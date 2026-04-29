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
  lineEdits: [],
  replacements: [],
  hiddenRanges: [],
  insertedAssets: [],
};

const MAX_UNDO = 50;

export function useRewrite({ activeBookId, getLocalSettings, saveLocalSettings }) {
  const [rules, setRules] = useState(EMPTY_RULES);
  const localRef = useRef(null); // localSettings 全体（display なども含むので保持）
  // §21 undoスタック: セッション内のみ（永続化しない）
  // なぜ: undoは「読書セッション中の操作ミス取り消し」のため。ファイルを閉じたらリセットが自然
  const [undoStack, setUndoStack] = useState([]);

  // book 切替時にローカル設定を取り直し、rewrite を抽出・undoスタックをクリア
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeBookId || !getLocalSettings) {
        localRef.current = null;
        setRules(EMPTY_RULES);
        setUndoStack([]); // book切替でスタッククリア
        return;
      }
      try {
        const ls = await getLocalSettings(activeBookId);
        if (cancelled) return;
        localRef.current = ls || null;
        setRules({ ...EMPTY_RULES, ...(ls?.rewrite || {}) });
        setUndoStack([]); // book切替でスタッククリア
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

  // §21 undoスタックへの追加（最大 MAX_UNDO 件）
  const pushUndo = useCallback((entry) => {
    setUndoStack((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
  }, []);

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

  // §21 lineEdits CRUD
  const addLineEdit = useCallback((edit = {}) => {
    const id = edit.id || crypto.randomUUID();
    setRules((prev) => {
      const entry = {
        id,
        chapterId: edit.chapterId || 'all',
        lineNumber: Number(edit.lineNumber) || 1,
        original: edit.original || '',
        display: edit.display || '',
        enabled: edit.enabled !== false,
      };
      const next = { ...prev, lineEdits: [...(prev.lineEdits || []), entry] };
      persist(next);
      return next;
    });
    pushUndo({ type: 'lineEdit', targetId: id });
  }, [persist, pushUndo]);

  const updateLineEdit = useCallback((id, patch) => {
    setRules((prev) => {
      const next = {
        ...prev,
        lineEdits: (prev.lineEdits || []).map((e) => e.id === id ? { ...e, ...patch } : e),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const removeLineEdit = useCallback((id) => {
    setRules((prev) => {
      const next = { ...prev, lineEdits: (prev.lineEdits || []).filter((e) => e.id !== id) };
      persist(next);
      return next;
    });
  }, [persist]);

  const addHiddenRange = useCallback((range = {}) => {
    const id = range.id || crypto.randomUUID();
    setRules((prev) => {
      const next = {
        ...prev,
        hiddenRanges: [
          ...(prev.hiddenRanges || []),
          {
            id,
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
    pushUndo({ type: 'hiddenRange', targetId: id }); // §21 undo
  }, [persist, pushUndo]);

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

  // §15 §21 で使う: insertedAssets の追加・削除
  const addInsertedAsset = useCallback((asset) => {
    const id = asset.id || crypto.randomUUID();
    const entry = { ...asset, id };
    setRules((prev) => {
      const next = {
        ...prev,
        insertedAssets: [...(prev.insertedAssets || []), entry],
      };
      persist(next);
      return next;
    });
    pushUndo({ type: 'insertedAsset', targetId: id }); // §21 undo
  }, [persist, pushUndo]);

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

  // §21 undo: スタックからpopして対応ルールを削除
  // なぜ: セッション内のみ。ファイルを閉じたらスタックがクリアされるため永続化は不要
  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      // 対応ルールを削除
      setRules((r) => {
        let updated = { ...r };
        if (last.type === 'lineEdit') {
          updated.lineEdits = (r.lineEdits || []).filter((e) => e.id !== last.targetId);
        } else if (last.type === 'hiddenRange') {
          updated.hiddenRanges = (r.hiddenRanges || []).filter((e) => e.id !== last.targetId);
        } else if (last.type === 'insertedAsset') {
          updated.insertedAssets = (r.insertedAssets || []).filter((e) => e.id !== last.targetId);
        }
        persist(updated);
        return updated;
      });
      return next;
    });
  }, [persist]);

  return {
    rules,
    setSpeakerName,
    addLineEdit, updateLineEdit, removeLineEdit,
    addReplacement, updateReplacement, removeReplacement,
    addHiddenRange, updateHiddenRange, removeHiddenRange,
    addInsertedAsset, updateInsertedAsset, removeInsertedAsset,
    undo,
    canUndo: undoStack.length > 0,
  };
}
