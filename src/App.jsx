// 何を: アプリのルートコンポーネント
// なぜ: 仕様書 §1〜§4 を統合。状態管理（mkb / 現在チャプター / 表示モード / ドロワー）

import { useEffect, useMemo, useState } from 'react';
import FileLoader from './components/FileLoader.jsx';
import ChapterNav from './components/ChapterNav.jsx';
import Paginator from './components/Paginator.jsx';
import { useMkbLoader } from './hooks/useMkbLoader.js';

const MODE_KEY = 'mkb-reader.mode'; // 'page' | 'scroll'（仕様書 §4 localStorage 保存）
const SAMPLE_URL = `${import.meta.env.BASE_URL}test.mkb`;

export default function App() {
  const { mkb, error, loading, loadFile, loadFromUrl } = useMkbLoader();
  const [currentId, setCurrentId] = useState(null);
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) || 'page';
    } catch {
      return 'page';
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 表示モードを localStorage に保存（仕様書 §4）
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  // mkb 読込時、最初のチャプターを選択
  useEffect(() => {
    if (mkb && mkb.chapters.length) {
      setCurrentId(mkb.chapters[0].id);
    } else {
      setCurrentId(null);
    }
  }, [mkb]);

  const currentChapter = useMemo(() => {
    if (!mkb) return null;
    return mkb.chapters.find((c) => c.id === currentId) || mkb.chapters[0];
  }, [mkb, currentId]);

  // wikilinks: チャプター名 / id でマッチさせて切替
  function handleWikiLinkClick(name) {
    if (!mkb) return;
    const lower = name.toLowerCase();
    const found = mkb.chapters.find(
      (c) => c.id.toLowerCase() === lower || (c.title || '').toLowerCase() === lower,
    );
    if (found) setCurrentId(found.id);
  }

  // 単一チャプター時はナビ非表示（仕様書 §3）
  const showNav = mkb && mkb.chapters.length > 1;

  if (!mkb) {
    return (
      <FileLoader
        onSelect={loadFile}
        error={error}
        loading={loading}
        onLoadSample={() => loadFromUrl(SAMPLE_URL, 'test.mkb')}
      />
    );
  }

  return (
    <div className={showNav ? 'with-sidebar' : ''}>
      {showNav && (
        <ChapterNav
          metadata={mkb.metadata}
          chapters={mkb.chapters}
          currentId={currentId}
          onSelect={setCurrentId}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
      <header className="app-header">
        {showNav && (
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="チャプター"
          >
            ≡
          </button>
        )}
        <div className="title">
          {mkb.metadata?.title}
          {currentChapter && currentChapter.id !== 'index' && (
            <span className="text-[var(--color-text-secondary)] font-normal">
              {' '}/ {currentChapter.title}
            </span>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setMode((m) => (m === 'page' ? 'scroll' : 'page'))}
          aria-label="ページ／スクロール切替"
          title={mode === 'page' ? 'スクロールに切替' : 'ページ送りに切替'}
        >
          ⇄
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            if (confirm('別のファイルを開きますか？')) {
              location.reload();
            }
          }}
          aria-label="別のファイルを開く"
          title="別のファイルを開く"
        >
          ⌂
        </button>
      </header>
      <Paginator
        chapter={currentChapter}
        chapters={mkb.chapters}
        onWikiLinkClick={handleWikiLinkClick}
        mode={mode}
      />
    </div>
  );
}
