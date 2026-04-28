// 何を: アプリのルートコンポーネント
// なぜ: 仕様書 Phase 1 §1〜§4 + Phase 2 §8（本棚） + §9（PWA基本対応）の統合
//
// 画面遷移: 本棚（Bookshelf） ↔ ビューア（Reader）
// アプリ起動時はまず本棚画面。保存済みファイルがあればリスト、なければウェルカム。

import { useEffect, useMemo, useState } from 'react';
import FileLoader from './components/FileLoader.jsx';
import ChapterNav from './components/ChapterNav.jsx';
import Paginator from './components/Paginator.jsx';
import Bookshelf from './components/Bookshelf.jsx';
import { useMkbLoader } from './hooks/useMkbLoader.js';
import { useBookshelf, fileToBookEntry, bookEntryToFile } from './hooks/useBookshelf.js';

const MODE_KEY = 'mkb-reader.mode'; // 'page' | 'scroll'（仕様書 §4 localStorage 保存）
const SAMPLE_URL = `${import.meta.env.BASE_URL}test.mkb`;

export default function App() {
  // 画面 ('shelf' | 'reader') — 仕様書 §8 の遷移
  const [view, setView] = useState('shelf');

  // 現在ビューアで開いているエントリ（本棚由来 or ピッカー由来 / null=未保存）
  const [activeEntry, setActiveEntry] = useState(null);

  const { mkb, error, loading, loadFile, loadFromUrl } = useMkbLoader();
  const {
    books,
    loading: shelfLoading,
    saveBook,
    deleteBook,
    updateLastOpened,
    findByTitle,
  } = useBookshelf();

  const [currentId, setCurrentId] = useState(null);
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(MODE_KEY) || 'page'; } catch { return 'page'; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 表示モードを localStorage に保存（仕様書 §4）
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  // mkb 読込時、最初のチャプターを選択しビューア画面へ遷移
  useEffect(() => {
    if (mkb && mkb.chapters.length) {
      setCurrentId(mkb.chapters[0].id);
      setView('reader');
    } else {
      setCurrentId(null);
    }
  }, [mkb]);

  const currentChapter = useMemo(() => {
    if (!mkb) return null;
    return mkb.chapters.find((c) => c.id === currentId) || mkb.chapters[0];
  }, [mkb, currentId]);

  function handleWikiLinkClick(name) {
    if (!mkb) return;
    const lower = name.toLowerCase();
    const found = mkb.chapters.find(
      (c) => c.id.toLowerCase() === lower || (c.title || '').toLowerCase() === lower,
    );
    if (found) setCurrentId(found.id);
  }

  // ───── 本棚 → ビューア ─────

  // 本棚の項目を開く
  async function handleOpenBook(entry) {
    setActiveEntry(entry);
    await updateLastOpened(entry.id);
    await loadFile(bookEntryToFile(entry));
  }

  // 端末ピッカーからファイルを開く（本棚画面）
  async function handlePickFile(file) {
    setActiveEntry(null); // 未保存状態で開く
    await loadFileAndRemember(file);
  }

  // 同梱サンプルを開く（本棚画面）
  async function handleLoadSample() {
    setActiveEntry(null);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], 'test.mkb', { type: 'application/zip' });
      await loadFileAndRemember(file);
    } catch (e) {
      console.error(e);
      // useMkbLoader のフォールバックを使う
      loadFromUrl(SAMPLE_URL, 'test.mkb');
    }
  }

  // ───── ビューア → 本棚保存 ─────

  // 「本棚に保存」: 仕様書 §8 — 同名チェックで上書き確認
  // mkb の場合は元のファイルバイナリ、md/txt は loadFile に渡した File を保持していないため
  // ここでは「現在開いているコンテンツのバイナリ」を再生成する戦略をとる:
  // - .mkb 由来でない場合（直近に loadFile された File が手元に無い場合）は、
  //   メタデータ + index.md を MD として保存する fallback でも動く
  // ただし、最も素直なのは loadFile 直前の File を保持しておくこと。
  // → useMkbLoader を拡張して最後の File を返すよりも、loadFile 経由でラップする
  //   方法を採る。下の lastFileRef に保持。
  const [lastFile, setLastFile] = useState(null);
  async function loadFileAndRemember(file) {
    setLastFile(file);
    return loadFile(file);
  }

  async function handleSaveCurrent() {
    if (!mkb) return;
    if (!lastFile) {
      alert('保存対象のファイルが見つかりません（本棚から開いた項目は既に保存済みです）');
      return;
    }
    const entry = await fileToBookEntry(lastFile, mkb.metadata);
    // 同タイトルがあれば上書き確認（仕様書 §8）
    const dup = await findByTitle(entry.title);
    if (dup) {
      if (!confirm(`「${entry.title}」は既に本棚にあります。上書きしますか？`)) return;
      // 上書き: 既存 id を流用し addedAt を維持
      entry.id = dup.id;
      entry.addedAt = dup.addedAt;
    }
    await saveBook(entry);
    setActiveEntry(entry);
    alert('本棚に保存しました');
  }

  // ───── 本棚画面 ─────

  if (view === 'shelf') {
    return (
      <Bookshelf
        books={books}
        loading={shelfLoading || loading}
        error={error}
        onPickFile={handlePickFile}
        onOpenBook={handleOpenBook}
        onDeleteBook={deleteBook}
        onLoadSample={handleLoadSample}
      />
    );
  }

  // ───── ビューア画面 ─────

  if (!mkb) {
    // 読み込み失敗等のフォールバック
    return (
      <FileLoader
        onSelect={loadFileAndRemember}
        error={error}
        loading={loading}
        onLoadSample={handleLoadSample}
      />
    );
  }

  // 単一チャプター時はナビ非表示（仕様書 §3）
  const showNav = mkb.chapters.length > 1;
  const isSaved = !!activeEntry;

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
        {/* 本棚に戻る */}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setView('shelf')}
          aria-label="本棚に戻る"
          title="本棚に戻る"
        >
          ⌂
        </button>
        {/* 本棚に保存（仕様書 §8） */}
        <button
          type="button"
          className="icon-btn"
          onClick={handleSaveCurrent}
          aria-label={isSaved ? '本棚に保存済み' : '本棚に保存'}
          title={isSaved ? '本棚に保存済み' : '本棚に保存'}
          disabled={isSaved}
        >
          {isSaved ? '★' : '☆'}
        </button>
        {/* ページ／スクロール切替 */}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setMode((m) => (m === 'page' ? 'scroll' : 'page'))}
          aria-label="ページ／スクロール切替"
          title={mode === 'page' ? 'スクロールに切替' : 'ページ送りに切替'}
        >
          ⇄
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
