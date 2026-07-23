// 何を: 書庫サーバ（§35）との接続・索引取得・ファイル操作を管理するフック
// なぜ: §36.1 — 起動時に /healthz を照会し、応答があれば書庫モードを有効化
import { useCallback, useEffect, useState } from 'react';

export function useRemoteLibrary() {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(null);
  const [items, setItems] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [connectedAt, setConnectedAt] = useState(null);

  async function checkHealthz() {
    try {
      const res = await fetch('/healthz', {
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.ok) return false;
      setVersion(data.version || null);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchIndex(rescan = false) {
    setFetching(true);
    try {
      const url = rescan ? '/api/library/index?rescan=1' : '/api/library/index';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`index: ${res.status}`);
      const data = await res.json();
      setItems(data.files || []);
      setConnectedAt(Date.now());
    } catch (e) {
      console.warn('useRemoteLibrary fetchIndex:', e);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    (async () => {
      const ok = await checkHealthz();
      setConnected(ok);
      if (ok) await fetchIndex();
    })();
  }, []);

  const rescan = useCallback(() => fetchIndex(true), []);

  // §36.3: ファイルを書庫へ PUT 保存
  async function putFile(relPath, body) {
    const url = `/api/library/file?path=${encodeURIComponent(relPath)}`;
    const res = await fetch(url, { method: 'PUT', body, cache: 'no-store' });
    if (!res.ok) {
      const msg = await res.json().then((d) => d.error).catch(() => res.statusText);
      throw new Error(msg || `PUT failed: ${res.status}`);
    }
    await fetchIndex(true);
  }

  // §36.2: ファイル実体を Blob で取得
  async function fetchFile(relPath) {
    const url = `/api/library/file?path=${encodeURIComponent(relPath)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`file fetch: ${res.status}`);
    return res.blob();
  }

  return {
    connected,
    version,
    items,
    fetching,
    connectedAt,
    rescan,
    putFile,
    fetchFile,
  };
}
