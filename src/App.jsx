// 何を: アプリのルートコンポーネント
// なぜ: 仕様書 Phase 1 §1〜§4 + Phase 2 §5〜§9 を統合
//
// 画面: 本棚（Bookshelf） ↔ ビューア（Reader）
// ビューアでは右上のギア（⚙）から SettingsPanel をボトムシート表示

import { useEffect, useMemo, useState } from 'react';
import FileLoader from './components/FileLoader.jsx';
import ChapterNav from './components/ChapterNav.jsx';
import Paginator from './components/Paginator.jsx';
import Bookshelf from './components/Bookshelf.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import HtmlRenderer from './components/HtmlRenderer.jsx';
import JsonRenderer from './components/JsonRenderer.jsx';
import ImageViewer from './components/ImageViewer.jsx';
import ChatImporter from './components/ChatImporter.jsx';
import { useMkbLoader } from './hooks/useMkbLoader.js';
import { useBookshelf, fileToBookEntry, bookEntryToFile } from './hooks/useBookshelf.js';
import { useSettings } from './hooks/useSettings.js';

// 何を: 同梱サンプル一覧
// なぜ: ウェルカム画面から各形式（mkb / html / json / cbz）をワンタップで開けるように
const SAMPLES = [
  { label: '📚 サンプル mkb（複数チャプター）', url: `${import.meta.env.BASE_URL}test.mkb`, name: 'test.mkb' },
  { label: '🌐 サンプル HTML',                 url: `${import.meta.env.BASE_URL}test.html`, name: 'test.html' },
  { label: '🧾 サンプル JSON',                 url: `${import.meta.env.BASE_URL}test.json`, name: 'test.json' },
  { label: '🖼 サンプル CBZ（縦横/色味/サイズ違い 4枚）', url: `${import.meta.env.BASE_URL}test.cbz`, name: 'test.cbz' },
  { label: '💬 サンプル チャットログ JSON（3会話）',     url: `${import.meta.env.BASE_URL}test-conversations.json`, name: 'test-conversations.json' },
];

export default function App() {
  // 画面 ('shelf' | 'reader' | 'chat-import')
  const [view, setView] = useState('shelf');
  const [activeEntry, setActiveEntry] = useState(null);
  const [lastFile, setLastFile] = useState(null);

  const { content, mkb, error, loading, loadFile, loadFromUrl } = useMkbLoader();
  const {
    books,
    loading: shelfLoading,
    saveBook,
    deleteBook,
    updateLastOpened,
    findByTitle,
    getLocalSettings,
    saveLocalSettings,
    resizeProgress,
  } = useBookshelf();

  // §5 §6 §7 + §4.6 二層: 開いている本の id を渡してローカル設定を有効化
  const {
    settings, update, applyPreset, activePreset,
    scope, setScope, hasLocal, overriddenKeys, resetLocalKey,
  } = useSettings({
    activeBookId: activeEntry?.id,
    getLocalSettings,
    saveLocalSettings,
  });

  const [currentId, setCurrentId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 何を: コンテンツが読み込まれたらビューア画面へ遷移
  // なぜ: ViewerContent 抽象化（Phase 3a §10〜§11）— mkb 以外も view='reader' で扱う
  useEffect(() => {
    if (!content) {
      setCurrentId(null);
      return;
    }
    if (content.type === 'mkb' && content.data?.chapters?.length) {
      setCurrentId(content.data.chapters[0].id);
    } else {
      setCurrentId(null);
    }
    setView('reader');
  }, [content]);

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

  // ───── 共通ローダ（lastFile を保持して save 経路に渡す） ─────
  async function loadFileAndRemember(file) {
    setLastFile(file);
    return loadFile(file);
  }

  // ───── 本棚 → ビューア ─────
  async function handleOpenBook(entry) {
    setActiveEntry(entry);
    setLastFile(null); // 本棚由来は既保存
    await updateLastOpened(entry.id);
    await loadFile(bookEntryToFile(entry));
  }
  async function handlePickFile(file) {
    setActiveEntry(null);
    await loadFileAndRemember(file);
  }
  // 同梱サンプルを開く（URL 指定）
  async function handleLoadSample(url, displayName) {
    setActiveEntry(null);
    const u = url || SAMPLES[0].url;
    const n = displayName || SAMPLES[0].name;
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], n, { type: blob.type });
      await loadFileAndRemember(file);
    } catch (e) {
      console.error(e);
      loadFromUrl(u, n);
    }
  }

  // ───── ビューア → 本棚保存 ─────
  async function handleSaveCurrent() {
    if (!mkb) return;
    if (!lastFile) {
      alert('保存対象のファイルが見つかりません（本棚から開いた項目は既に保存済みです）');
      return;
    }
    const entry = await fileToBookEntry(lastFile, mkb.metadata);
    const dup = await findByTitle(entry.title);
    if (dup) {
      if (!confirm(`「${entry.title}」は既に本棚にあります。上書きしますか？`)) return;
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
        samples={SAMPLES}
        onOpenChatImporter={() => setView('chat-import')}
      />
    );
  }

  // ───── チャットログ取り込み画面（§18） ─────
  if (view === 'chat-import') {
    return (
      <ChatImporter
        onCancel={() => setView('shelf')}
        onOpenSingle={async (file) => {
          setActiveEntry(null);
          await loadFileAndRemember(file);
          // 変換結果を開く（useEffect が view='reader' に遷移）
        }}
        saveBook={saveBook}
      />
    );
  }

  // ───── ビューア画面 ─────
  if (!content) {
    return (
      <FileLoader
        onSelect={loadFileAndRemember}
        error={error}
        loading={loading}
        onLoadSample={handleLoadSample}
      />
    );
  }

  const isMkb = content.type === 'mkb';
  const showNav = isMkb && mkb && mkb.chapters.length > 1;
  const isSaved = !!activeEntry;
  // タイトル: mkb なら metadata.title、その他はファイル名
  const headerTitle = isMkb
    ? mkb?.metadata?.title
    : (content.name || (content.type === 'html' ? 'HTML' : content.type === 'json' ? 'JSON' : ''));

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
          {headerTitle}
          {isMkb && currentChapter && currentChapter.id !== 'index' && (
            <span className="text-[var(--color-text-secondary)] font-normal">
              {' '}/ {currentChapter.title}
            </span>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setView('shelf')}
          aria-label="本棚に戻る"
          title="本棚に戻る"
        >
          ⌂
        </button>
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
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="設定"
          title="設定"
        >
          ⚙
        </button>
      </header>

      {/* 何を: コンテンツ型に応じてレンダラーを切替
          なぜ: 仕様書 §10 — HTML/JSON はスクロール固定の専用ビュー */}
      {isMkb && currentChapter && (
        <Paginator
          chapter={currentChapter}
          chapters={mkb.chapters}
          onWikiLinkClick={handleWikiLinkClick}
          mode={settings.mode}
          swipeDirection={settings.swipeDirection}
          hrStyle={settings.hrStyle}
          imageDisplayMode={settings.imageDisplayMode}
        />
      )}
      {content.type === 'html' && (
        <HtmlRenderer content={content.content} name={content.name} />
      )}
      {content.type === 'json' && (
        <JsonRenderer content={content.content} name={content.name} />
      )}
      {content.type === 'images' && (
        <ImageViewer images={content.images} swipeDirection={settings.swipeDirection} />
      )}

      {/* §12 リサイズ進捗 */}
      {resizeProgress && (
        <div className="resize-progress" role="status" aria-live="polite">
          {resizeProgress.done} / {resizeProgress.total} 画像を処理中…
        </div>
      )}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={update}
        applyPreset={applyPreset}
        activePreset={activePreset}
        scope={scope}
        setScope={setScope}
        hasLocal={hasLocal}
        overriddenKeys={overriddenKeys}
        resetLocalKey={resetLocalKey}
        canEditLocal={!!activeEntry?.id}
      />
    </div>
  );
}
