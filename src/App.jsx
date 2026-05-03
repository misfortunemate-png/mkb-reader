// 何を: アプリのルートコンポーネント
// なぜ: 仕様書 Phase 1 §1〜§4 + Phase 2 §5〜§9 を統合
//
// 画面: 本棚（Bookshelf） ↔ ビューア（Reader）
// ビューアでは右上のギア（⚙）から SettingsPanel をボトムシート表示

import { useEffect, useMemo, useRef, useState } from 'react';
import FileLoader from './components/FileLoader.jsx';
import ChapterNav from './components/ChapterNav.jsx';
import Paginator from './components/Paginator.jsx';
import Bookshelf from './components/Bookshelf.jsx';
import LibraryView from './components/LibraryView.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import HtmlRenderer from './components/HtmlRenderer.jsx';
import JsonRenderer from './components/JsonRenderer.jsx';
import ImageViewer from './components/ImageViewer.jsx';
import ChatImporter from './components/ChatImporter.jsx';
import RewritePanel from './components/RewritePanel.jsx';
import ImageInserter from './components/ImageInserter.jsx';
import ExportDialog from './components/ExportDialog.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import Toast from './components/Toast.jsx';
import { MenuIcon, ArrowLeftIcon, BookmarkIcon, PenIcon, DownloadIcon, SettingsIcon } from './components/Icons.jsx';
import { useRewrite } from './hooks/useRewrite.js';
import { useMkbLoader } from './hooks/useMkbLoader.js';
import { useBookshelf, fileToBookEntry, bookEntryToFile } from './hooks/useBookshelf.js';
import { useLibrary } from './hooks/useLibrary.js';
import { useSettings } from './hooks/useSettings.js';

// 何を: 同梱サンプル一覧
// なぜ: ウェルカム画面から各形式（mkb / html / json / cbz / chat-import）をワンタップで開く
//   kind:'chat-import' のものは ChatImporter に直接遷移して fetch を自動実行
const SAMPLES = [
  { label: '📚 サンプル mkb（複数チャプター）', url: `${import.meta.env.BASE_URL}test.mkb`, name: 'test.mkb' },
  { label: '🌐 サンプル HTML',                 url: `${import.meta.env.BASE_URL}test.html`, name: 'test.html' },
  { label: '🧾 サンプル JSON',                 url: `${import.meta.env.BASE_URL}test.json`, name: 'test.json' },
  { label: '🖼 サンプル CBZ（縦横/色味/サイズ違い 4枚）', url: `${import.meta.env.BASE_URL}test.cbz`, name: 'test.cbz' },
  { label: '💬 チャットログ取込（取込フロー：5会話）',     url: `${import.meta.env.BASE_URL}test-conversations.json`, name: 'test-conversations.json', kind: 'chat-import' },
];

export default function App() {
  // 画面 ('shelf' | 'reader' | 'chat-import')
  const [view, setView] = useState('shelf');
  const [activeEntry, setActiveEntry] = useState(null);
  const [lastFile, setLastFile] = useState(null);
  // §30: Bookshelf など FileLoader を通らない経路でも縦書き確認を出すための共通ダイアログ状態
  const [verticalPending, setVerticalPending] = useState(null); // null | { file }
  const [verticalPendingChecked, setVerticalPendingChecked] = useState(false);

  // §28 本棚/ライブラリ切り替えタブ（localStorageで永続化）
  const [shelfView, setShelfView] = useState(
    () => localStorage.getItem('shelf-view') || 'bookshelf'
  );
  function handleShelfViewChange(v) {
    setShelfView(v);
    localStorage.setItem('shelf-view', v);
  }

  // §28 ライブラリ経由で開いたときの層Bの編集コンテキスト
  // null = 通常の開き方。libraryEdits がある場合は rewrite.rules の上に重ねる
  const [libraryContext, setLibraryContext] = useState(null);

  const { content, mkb: rawMkb, error, loading, loadFile, loadFromUrl } = useMkbLoader();
  // §30: vertical content も mkbData を持つため、isMkb/isVertical 両方で mkb を解決
  const isVertical = content?.type === 'vertical';
  const isMkbType = content?.type === 'mkb';
  const mkb = isVertical ? content?.data : rawMkb;
  const {
    books,
    loading: shelfLoading,
    saveBook,
    deleteBook,
    deleteAllBooks,
    updateLastOpened,
    findByTitle,
    getLocalSettings,
    saveLocalSettings,
    saveLastPosition,
    resizeProgress,
    renameBook,
    addTag,
    removeTag,
  } = useBookshelf();

  // §28 ライブラリフック
  const {
    libraries,
    createLibrary,
    deleteLibrary,
    renameLibrary,
    addFolder,
    addItem,
    removeNode,
    moveNode,
    renameNode,
    findReferencingLibraries,
    removeNodesByBookId,
  } = useLibrary();

  // §5 §6 §7 + §4.6 二層: 開いている本の id を渡してローカル設定を有効化
  const {
    settings, update, applyPreset, activePreset,
    scope, setScope, hasLocal, overriddenKeys, resetLocalKey, resetGlobal,
  } = useSettings({
    activeBookId: activeEntry?.id,
    getLocalSettings,
    saveLocalSettings,
  });

  const [currentId, setCurrentId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [imageInserterOpen, setImageInserterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // §23 トースト通知
  const [toastMsg, setToastMsg] = useState(null);
  function showToast(msg) { setToastMsg(msg); }

  // §21 コンテキストメニュー
  const [contextMenuEvent, setContextMenuEvent] = useState(null);

  // 差し込み画像タップ → サイズ変更/削除アクションシート
  const [assetMenu, setAssetMenu] = useState(null); // null | { assetId }
  function handleAssetTap(assetId) { setAssetMenu({ assetId }); }
  function handleAssetResize(assetId, displaySize) { rewrite.updateInsertedAsset(assetId, { displaySize }); }
  function handleAssetDelete(assetId) { rewrite.removeInsertedAsset(assetId); }

  // §24 タップゾーンオーバーレイ（設定変更時の3秒間だけ表示）
  const [tapZonePreview, setTapZonePreview] = useState(false);
  const tapZonePreviewTimerRef = useRef(null);
  function handleTapZoneChange() {
    if (tapZonePreviewTimerRef.current) clearTimeout(tapZonePreviewTimerRef.current);
    setTapZonePreview(true);
    tapZonePreviewTimerRef.current = setTimeout(() => setTapZonePreview(false), 3000);
  }

  // §26 中断箇所の再開
  // なぜ: 本を開いた時の lastPosition を ref で保持（stateより先に参照できるため closure 問題を回避）
  const pendingLastPositionRef = useRef(null);
  const [initialPage, setInitialPage] = useState(null);
  const [initialScrollRatio, setInitialScrollRatio] = useState(null);

  // §14 読み替えルール
  const rewrite = useRewrite({
    activeBookId: activeEntry?.id,
    getLocalSettings,
    saveLocalSettings,
  });

  // §28 層A(rewrite.rules) + 層B(libraryContext.edits) を合成した実効ルール
  // なぜ: 層BのeditsはlocalSettings.rewriteの上に重ねる（仕様書 D-003）
  const effectiveRewriteRules = useMemo(() => {
    if (!libraryContext?.edits) return rewrite.rules;
    const edits = libraryContext.edits;
    return {
      ...rewrite.rules,
      hiddenRanges: [...(rewrite.rules.hiddenRanges || []), ...(edits.hiddenRanges || [])],
      insertedAssets: [
        ...(rewrite.rules.insertedAssets || []),
        ...(edits.insertedAssets || []),
        ...(edits.importedAssets || []),
      ],
      lineEdits: [...(rewrite.rules.lineEdits || []), ...(edits.lineEdits || [])],
    };
  }, [rewrite.rules, libraryContext]);

  // §15 InsertedAsset の Blob URL キャッシュ（id → blob URL）
  // 何を: ArrayBuffer のままだと <img src> で使えないので Blob URL を作る
  // なぜ: localSettings.rewrite.insertedAssets[].data は ArrayBuffer 永続。
  //       描画時だけ URL 化、book 切替時に解放してメモリリーク防止
  const assetUrlMapRef = useRef(new Map());
  const insertedAssetUrls = useMemo(() => {
    // §28: 層AのinsertedAssets + 層BのimportedAssetsを合わせてBlob URL化
    const list = [
      ...(rewrite.rules.insertedAssets || []),
      ...(libraryContext?.edits?.importedAssets || []),
      ...(libraryContext?.edits?.insertedAssets || []),
    ];
    const next = new Map();
    for (const a of list) {
      const cached = assetUrlMapRef.current.get(a.id);
      if (cached) { next.set(a.id, cached); continue; }
      try {
        const blob = new Blob([a.data], { type: a.mimeType || 'application/octet-stream' });
        next.set(a.id, URL.createObjectURL(blob));
      } catch { /* ignore */ }
    }
    // 古い URL を解放
    for (const [id, url] of assetUrlMapRef.current.entries()) {
      if (!next.has(id)) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
    }
    assetUrlMapRef.current = next;
    return next;
  }, [rewrite.rules.insertedAssets, libraryContext]);

  // book 切替時にすべての URL を破棄
  useEffect(() => {
    return () => {
      for (const url of assetUrlMapRef.current.values()) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
      assetUrlMapRef.current = new Map();
    };
  }, [activeEntry?.id]);

  // applyRewrite に渡す URL 解決関数
  const insertedAssetUrl = (asset) => insertedAssetUrls.get(asset?.id) || asset?.path || '';

  // §23 ファイル読み込みエラーをトーストで通知
  useEffect(() => {
    if (error) showToast(`読み込みエラー: ${error}`);
  }, [error]);

  // 何を: コンテンツが読み込まれたらビューア画面へ遷移
  // なぜ: ViewerContent 抽象化（Phase 3a §10〜§11）— mkb 以外も view='reader' で扱う
  // §26: pendingLastPositionRef を参照して中断チャプター・ページ/スクロール比率を復元
  useEffect(() => {
    if (!content) {
      setCurrentId(null);
      return;
    }
    // §30: vertical も mkbData を持つので同じパスで処理
    if ((content.type === 'mkb' || content.type === 'vertical') && content.data?.chapters?.length) {
      const chapters = content.data.chapters;
      const lp = pendingLastPositionRef.current;
      pendingLastPositionRef.current = null; // 使い捨て
      let targetId = chapters[0].id;
      let targetPage = null;
      let targetScrollRatio = null;
      if (lp?.chapterId) {
        const found = chapters.find((c) => c.id === lp.chapterId);
        if (found) {
          targetId = found.id;
          targetPage = lp.page ?? null;
          targetScrollRatio = lp.scrollRatio ?? null;
        }
        // 存在しないチャプターIDの場合はフォールバックで先頭
      }
      setCurrentId(targetId);
      setInitialPage(targetPage);
      setInitialScrollRatio(targetScrollRatio);
    } else {
      setCurrentId(null);
      setInitialPage(null);
      setInitialScrollRatio(null);
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
    if (found) {
      // §26: チャプター切替時にページ0で保存（新チャプターの先頭）
      if (activeEntry?.id) saveLastPosition(activeEntry.id, { chapterId: found.id, page: 0 });
      setCurrentId(found.id);
    }
  }

  // §26: ページ変更時に位置を保存（debounce は Paginator 側で済み）
  function handlePageChange(page) {
    if (!activeEntry?.id || !currentChapter) return;
    saveLastPosition(activeEntry.id, { chapterId: currentChapter.id, page });
  }

  // §26: スクロール比率変更時に位置を保存（debounce は Paginator 側で済み）
  function handleScrollRatioChange(scrollRatio) {
    if (!activeEntry?.id || !currentChapter) return;
    saveLastPosition(activeEntry.id, { chapterId: currentChapter.id, scrollRatio });
  }

  // §21 コンテキストメニューのコールバック群
  function handleHideLine(lineNumber) {
    if (!currentChapter) return;
    rewrite.addHiddenRange({ chapterId: currentChapter.id, startLine: lineNumber, endLine: lineNumber });
  }

  function handleEditLine(lineNumber, original, display) {
    if (!currentChapter) return;
    rewrite.addLineEdit({ chapterId: currentChapter.id, lineNumber, original, display });
  }

  async function handleInsertImageFromContext({ lineNumber, displaySize, file }) {
    if (!currentChapter) return;
    try {
      const buffer = await file.arrayBuffer();
      rewrite.addInsertedAsset({
        chapterId: currentChapter.id,
        path: '',
        data: buffer,
        mimeType: file.type || 'image/jpeg',
        altText: file.name || '',
        displaySize: displaySize || 'block',
        insertAfter: { chapterId: currentChapter.id, lineNumber: lineNumber || 0 },
        enabled: true,
      });
    } catch (e) {
      console.error('handleInsertImageFromContext:', e);
    }
  }

  // ───── 共通ローダ（lastFile を保持して save 経路に渡す） ─────
  // §30: opts を受け取り { file, opts } として保持することで vertical フラグを保存に引き継ぐ
  async function loadFileAndRemember(file, opts = {}) {
    setLastFile({ file, opts });
    return loadFile(file, opts);
  }

  // ───── §28 ライブラリ → ビューア ─────
  // なぜ: 仕様書 §28.4 — sourceBookIdでBookEntryを取得し、層Bのeditsをセット
  async function handleOpenLibraryItem(bookEntry, edits) {
    setLibraryContext(edits ? { edits } : null);
    setActiveEntry(bookEntry);
    setLastFile(null);
    const freshLs = await getLocalSettings(bookEntry.id);
    pendingLastPositionRef.current = freshLs?.lastPosition || null;
    await updateLastOpened(bookEntry.id);
    await loadFile(bookEntryToFile(bookEntry));
  }

  // ───── §28 削除時にライブラリ参照もカスケード削除 ─────
  async function handleDeleteBook(id) {
    await removeNodesByBookId(id);
    await deleteBook(id);
  }

  // ───── 本棚 → ビューア ─────
  async function handleOpenBook(entry) {
    setLibraryContext(null);
    setActiveEntry(entry);
    setLastFile(null);
    // §26: saveLastPosition は refresh() を呼ばないため books state の lastPosition が古い可能性がある
    //   → getLocalSettings で IDB から直接最新値を取得してから復元する
    const freshLs = await getLocalSettings(entry.id);
    pendingLastPositionRef.current = freshLs?.lastPosition || null;
    await updateLastOpened(entry.id);
    // §30: vertical fileType の本は opts.vertical=true で loadFile に渡す
    const opts = entry.fileType === 'vertical' ? { vertical: true } : {};
    await loadFile(bookEntryToFile(entry), opts);
  }
  // 何を: Bookshelf などから md/txt が来たとき、縦書き確認を挟む
  // なぜ: §30 D-005 — FileLoader 経由以外でも縦書き判定が必要
  const VERTICAL_EXT_RE = /\.(md|markdown|txt)$/i;
  async function handlePickFile(fileOrFiles, opts = {}) {
    // 単一の md/txt かつ vertical が未確定 → 確認ダイアログへ
    if (
      !Array.isArray(fileOrFiles) &&
      !('vertical' in opts) &&
      VERTICAL_EXT_RE.test(fileOrFiles?.name || '')
    ) {
      setVerticalPending({ file: fileOrFiles });
      setVerticalPendingChecked(false);
      return;
    }
    setActiveEntry(null);
    await loadFileAndRemember(fileOrFiles, opts);
  }
  // §18 取込フロー用: ChatImporter に渡す自動ロード URL
  const [chatImportUrl, setChatImportUrl] = useState(null);

  // 同梱サンプルを開く（URL 指定）
  // 何を: kind='chat-import' のサンプルは ChatImporter 画面に遷移し、
  //       自動 fetch して会話リストを表示する
  // なぜ: 取り込みフローを実機で確認できるように
  async function handleLoadSample(url, displayName, kind) {
    if (kind === 'chat-import') {
      setChatImportUrl(url);
      setView('chat-import');
      return;
    }
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
    // §30: lastFile は { file, opts } 形式。opts.vertical を fileToBookEntry に渡す
    const { file: lastFileObj, opts: lastFileOpts } = lastFile;
    const charCount = mkb.chapters.reduce((sum, c) => sum + (c.content?.length || 0), 0);
    const entry = await fileToBookEntry(lastFileObj, { ...mkb.metadata, charCount }, lastFileOpts);
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
      <>
        {shelfView === 'bookshelf' ? (
          <Bookshelf
            books={books}
            loading={shelfLoading || loading}
            error={error}
            onPickFile={handlePickFile}
            onOpenBook={handleOpenBook}
            onDeleteBook={handleDeleteBook}
            onLoadSample={handleLoadSample}
            samples={SAMPLES}
            onOpenChatImporter={() => setView('chat-import')}
            onRenameBook={renameBook}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onCheckLibraryRefs={findReferencingLibraries}
            shelfView={shelfView}
            onShelfViewChange={handleShelfViewChange}
          />
        ) : (
          <div className="bookshelf">
            {/* §28 ライブラリタブ時もヘッダーを表示 */}
            <header className="bookshelf-header">
              <div className="title">mkb-reader</div>
            </header>
            <div className="shelf-tabs">
              <button type="button"
                className={`shelf-tab ${shelfView === 'bookshelf' ? 'active' : ''}`}
                onClick={() => handleShelfViewChange('bookshelf')}>本棚</button>
              <button type="button"
                className={`shelf-tab ${shelfView === 'library' ? 'active' : ''}`}
                onClick={() => handleShelfViewChange('library')}>ライブラリ</button>
            </div>
            <LibraryView
              libraries={libraries}
              books={books}
              onOpenLibraryItem={handleOpenLibraryItem}
              onCreateLibrary={createLibrary}
              onDeleteLibrary={deleteLibrary}
              onRenameLibrary={renameLibrary}
              onAddFolder={addFolder}
              onAddItem={addItem}
              onRemoveNode={removeNode}
              onMoveNode={moveNode}
              onRenameNode={renameNode}
            />
          </div>
        )}
        <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />
        {/* §30: 縦書き確認ダイアログ（Bookshelf の＋開くからも表示される） */}
        {verticalPending && (
          <div className="vertical-pending-overlay" onClick={() => setVerticalPending(null)}>
            <div className="vertical-pending-dialog" onClick={(e) => e.stopPropagation()}>
              <p className="hint">{verticalPending.file.name}</p>
              <label className="vertical-check">
                <input
                  type="checkbox"
                  checked={verticalPendingChecked}
                  onChange={(e) => setVerticalPendingChecked(e.target.checked)}
                />
                縦書きとして読み込む
              </label>
              <div className="vertical-confirm-btns">
                <button
                  type="button"
                  className="file-btn"
                  onClick={async () => {
                    const { file } = verticalPending;
                    setVerticalPending(null);
                    setActiveEntry(null);
                    await loadFileAndRemember(file, { vertical: verticalPendingChecked });
                  }}
                >読み込む</button>
                <button type="button" className="file-btn" onClick={() => setVerticalPending(null)}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ───── チャットログ取り込み画面（§18） ─────
  if (view === 'chat-import') {
    return (
      <ChatImporter
        autoLoadUrl={chatImportUrl}
        onCancel={() => { setChatImportUrl(null); setView('shelf'); }}
        onOpenSingle={async (file) => {
          setActiveEntry(null);
          setChatImportUrl(null);
          await loadFileAndRemember(file);
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

  // §30: isMkbType/isVertical は useMkbLoader の後に宣言済み（ここでは aliases として使用）
  const isMkb = isMkbType;
  const showNav = (isMkb || isVertical) && mkb && mkb.chapters.length > 1;
  const isSaved = !!activeEntry;
  // タイトル: mkb/vertical なら metadata.title、その他はファイル名
  const headerTitle = (isMkb || isVertical)
    ? mkb?.metadata?.title
    : (content.name || (content.type === 'html' ? 'HTML' : content.type === 'json' ? 'JSON' : ''));

  return (
    <div className={showNav ? 'with-sidebar' : ''}>
      {showNav && (
        <ChapterNav
          metadata={mkb.metadata}
          chapters={mkb.chapters}
          currentId={currentId}
          onSelect={(id) => {
            // §26: チャプター切替時に先頭ページで位置を保存
            if (activeEntry?.id) saveLastPosition(activeEntry.id, { chapterId: id, page: 0 });
            setCurrentId(id);
          }}
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
            <MenuIcon />
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
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={handleSaveCurrent}
          aria-label={isSaved ? '本棚に保存済み' : '本棚に保存'}
          title={isSaved ? '本棚に保存済み' : '本棚に保存'}
          disabled={isSaved}
        >
          <BookmarkIcon filled={isSaved} />
        </button>
        {/* §14 読み替え（mkb/vertical）— §30: 縦書きにも rewrite を適用 */}
        {(isMkb || isVertical) && activeEntry && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setRewriteOpen(true)}
            aria-label="読み替え"
            title="読み替え"
          >
            <PenIcon />
          </button>
        )}
        {/* §16 エクスポート（mkb/vertical で activeEntry あり） */}
        {(isMkb || isVertical) && activeEntry && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setExportOpen(true)}
            aria-label="エクスポート"
            title="MKBエクスポート"
          >
            <DownloadIcon />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="設定"
          title="設定"
        >
          <SettingsIcon />
        </button>
      </header>

      {/* 何を: コンテンツ型に応じてレンダラーを切替
          なぜ: 仕様書 §10 — HTML/JSON はスクロール固定の専用ビュー */}
      {(isMkb || isVertical) && currentChapter && (
        <Paginator
          chapter={currentChapter}
          chapters={mkb.chapters}
          onWikiLinkClick={handleWikiLinkClick}
          mode={settings.mode}
          swipeDirection={settings.swipeDirection}
          hrStyle={settings.hrStyle}
          imageDisplayMode={settings.imageDisplayMode}
          rewriteRules={effectiveRewriteRules}
          rewriteHighlight={settings.rewriteHighlight}
          insertedAssetUrl={insertedAssetUrl}
          tapZone={settings.tapZone}
          showTapZoneOverlay={tapZonePreview}
          initialPage={initialPage}
          initialScrollRatio={initialScrollRatio}
          onPageChange={handlePageChange}
          onScrollRatioChange={handleScrollRatioChange}
          onContextMenu={activeEntry ? setContextMenuEvent : undefined}
          onInsertedAssetTap={activeEntry ? handleAssetTap : undefined}
          vertical={isVertical}
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
      {/* §14 読み替えパネル */}
      {(isMkb || isVertical) && (
        <RewritePanel
          open={rewriteOpen}
          onClose={() => setRewriteOpen(false)}
          rules={rewrite.rules}
          setSpeakerName={rewrite.setSpeakerName}
          addReplacement={rewrite.addReplacement}
          updateReplacement={rewrite.updateReplacement}
          removeReplacement={rewrite.removeReplacement}
          addHiddenRange={rewrite.addHiddenRange}
          updateHiddenRange={rewrite.updateHiddenRange}
          removeHiddenRange={rewrite.removeHiddenRange}
          currentChapter={currentChapter}
          onAddImage={() => setImageInserterOpen(true)}
          onToggleAsset={(id, enabled) => rewrite.updateInsertedAsset(id, { enabled })}
          onRemoveAsset={(id) => rewrite.removeInsertedAsset(id)}
        />
      )}
      {/* §15 画像差し込みダイアログ */}
      {(isMkb || isVertical) && (
        <ImageInserter
          open={imageInserterOpen}
          onClose={() => setImageInserterOpen(false)}
          currentChapter={currentChapter}
          onAdd={async (asset) => { rewrite.addInsertedAsset(asset); }}
        />
      )}
      {/* 差し込み画像アクションシート（サイズ変更・削除） */}
      {(isMkb || isVertical) && assetMenu && (() => {
        const asset = rewrite.rules.insertedAssets?.find((a) => a.id === assetMenu.assetId);
        return (
          <div className="asset-action-sheet" onClick={() => setAssetMenu(null)}>
            <div className="asset-action-body" onClick={(e) => e.stopPropagation()}>
              <p className="asset-action-label">表示サイズ</p>
              <div className="asset-action-sizes">
                {[
                  { key: 'inline', label: '行内（小）' },
                  { key: 'block',  label: 'ブロック（中）' },
                  { key: 'fullpage', label: '全面（大）' },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`ctx-btn ${(asset?.displaySize || 'block') === s.key ? '' : 'secondary'}`}
                    onClick={() => { handleAssetResize(assetMenu.assetId, s.key); setAssetMenu(null); }}
                  >{s.label}</button>
                ))}
              </div>
              <button
                type="button"
                className="asset-action-delete"
                onClick={() => { handleAssetDelete(assetMenu.assetId); setAssetMenu(null); }}
              >削除</button>
            </div>
          </div>
        );
      })()}
      {/* §21 コンテキストメニュー（mkb/vertical + 本棚保存済みの場合のみ） */}
      {(isMkb || isVertical) && activeEntry && (
        <ContextMenu
          event={contextMenuEvent}
          onClose={() => setContextMenuEvent(null)}
          chapterContent={currentChapter?.content}
          chapterId={currentChapter?.id}
          onHideLine={handleHideLine}
          onEditLine={handleEditLine}
          onInsertImage={handleInsertImageFromContext}
          onUndo={rewrite.undo}
          canUndo={rewrite.canUndo}
          onOpenRewrite={() => setRewriteOpen(true)}
        />
      )}
      {/* §16 エクスポート */}
      {(isMkb || isVertical) && activeEntry && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          bookEntry={activeEntry}
          defaultTitle={activeEntry.title || ''}
          defaultAuthor={activeEntry.author || ''}
          rewriteRules={rewrite.rules}
        />
      )}
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />
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
        onTapZoneChange={handleTapZoneChange}
        fileType={isVertical ? 'vertical' : (isMkb ? 'mkb' : content?.type)}
        bookCount={books?.length || 0}
        onDeleteAllBooks={async () => {
          if (!books?.length) return;
          if (confirm(`本棚の ${books.length} 件をすべて削除します。元に戻せません。よろしいですか？`)) {
            await deleteAllBooks();
            setActiveEntry(null);
            alert('本棚を空にしました');
          }
        }}
        onResetGlobalSettings={() => {
          if (confirm('グローバル設定（フォント・テーマ・文字サイズ・余白等）をすべて初期値に戻します。よろしいですか？')) {
            resetGlobal();
            alert('設定を初期値に戻しました');
          }
        }}
      />
    </div>
  );
}
