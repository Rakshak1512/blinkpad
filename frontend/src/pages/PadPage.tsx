import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  AlertTriangle,
  RefreshCw,
  WifiOff
} from 'lucide-react';
import { api } from '../services/api';
import type { PublicPageManifest } from '../types';
import { Navbar } from '../components/Navbar';
import { TextEditor } from '../components/TextEditor';
import { FileSection } from '../components/FileSection';
import { PasswordModal } from '../components/PasswordModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { addRecentPage } from '../components/RecentPages';
import { useCountdown } from '../hooks/useCountdown';
import {
  saveOfflinePage,
  getOfflinePage,
  addSyncAction,
  type OfflinePage
} from '../services/offlineStorage';
import { syncManager } from '../services/syncManager';

interface PadPageProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const PadPage: React.FC<PadPageProps> = ({ theme, onToggleTheme }) => {
  const { pageName: rawPageName } = useParams<{ pageName: string }>();
  const pageName = (rawPageName || '').trim().toLowerCase();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<PublicPageManifest | null>(null);
  const [content, setContent] = useState<string>('');
  const [version, setVersion] = useState<number>(1);
  const [isExpired, setIsExpired] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hasOfflineDraft, setHasOfflineDraft] = useState(false);

  // Password Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Confirmation Modals
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeletePageConfirm, setShowDeletePageConfirm] = useState(false);

  const countdown = useCountdown(manifest?.expires_at);

  const loadPage = useCallback(async () => {
    if (!pageName) return;
    setLoading(true);
    setIsExpired(false);

    // 1. If offline, load from local IndexedDB mode
    if (!navigator.onLine) {
      const localDraft = await getOfflinePage(pageName);
      if (!localDraft) {
        const now = Date.now();
        const initialOffline: OfflinePage = {
          pageName,
          content: '',
          createdAt: now,
          updatedAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          version: 1,
          syncStatus: 'pending',
          isLocalOnly: true,
        };
        await saveOfflinePage(initialOffline);
        setManifest({
          id: 'local-' + pageName,
          name: pageName,
          created_at: now,
          expires_at: now + 24 * 60 * 60 * 1000,
          updated_at: now,
          version: 1,
          has_password: false,
          files: [],
        });
      } else {
        setContent(localDraft.content);
        setVersion(localDraft.version);
        if (localDraft.syncStatus === 'pending') {
          setHasOfflineDraft(true);
        }
        if (localDraft.expiresAt && Date.now() >= localDraft.expiresAt) {
          setIsExpired(true);
        }
        setManifest({
          id: 'local-' + pageName,
          name: pageName,
          created_at: localDraft.createdAt,
          expires_at: localDraft.expiresAt,
          updated_at: localDraft.updatedAt,
          version: localDraft.version,
          has_password: false,
          files: [],
        });
      }
      setLoading(false);
      return;
    }

    // 2. Online: Fetch authoritative state from cloud server first
    try {
      const localDraft = await getOfflinePage(pageName);
      const data = await api.getPage(pageName);
      setManifest(data.page);
      setIsLocked(false);
      setShowPasswordModal(false);
      setIsExpired(Date.now() >= data.page.expires_at);

      // If local draft had unsynced changes, preserve or sync them
      if (localDraft && localDraft.syncStatus === 'pending' && localDraft.content !== data.content) {
        setContent(localDraft.content);
        setHasOfflineDraft(true);
        showToast('Preserved local offline draft. Ready to sync.', 'info');
      } else {
        setContent(data.content);
        setVersion(data.page.version);
        setHasOfflineDraft(false);

        // Update IndexedDB cache
        await saveOfflinePage({
          pageName,
          content: data.content,
          createdAt: data.page.created_at,
          updatedAt: data.page.updated_at,
          expiresAt: data.page.expires_at,
          version: data.page.version,
          syncStatus: 'synced',
          serverTimestamp: data.server_time,
        });
      }

      addRecentPage(pageName, data.page.expires_at);
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 404) {
        // Automatic page creation (fluid Dontpad experience)
        try {
          const createRes = await api.createPage(pageName);
          if (createRes.success) {
            setManifest(createRes.page);
            setContent('');
            setVersion(createRes.page.version);
            setIsExpired(false);
            setIsLocked(false);
            addRecentPage(pageName, createRes.page.expires_at);

            await saveOfflinePage({
              pageName,
              content: '',
              createdAt: createRes.page.created_at,
              updatedAt: createRes.page.updated_at,
              expiresAt: createRes.page.expires_at,
              version: createRes.page.version,
              syncStatus: 'synced',
            });
          }
        } catch {
          showToast('Could not initialize page.', 'error');
        }
      } else if (status === 410) {
        setIsExpired(true);
      } else if (status === 401) {
        // Password required on reopen / initial visit
        setIsLocked(true);
        setShowPasswordModal(true);
        setContent('');
        const pageData = err?.response?.data?.page;
        if (pageData) {
          setManifest({
            id: 'locked-' + pageName,
            name: pageName,
            created_at: pageData.created_at || Date.now(),
            expires_at: pageData.expires_at || (Date.now() + 24 * 60 * 60 * 1000),
            updated_at: pageData.created_at || Date.now(),
            version: 1,
            has_password: true,
            files: [],
          });
        }
      } else {
        showToast(err?.response?.data?.error || 'Failed to connect to cloud.', 'warning');
      }
    } finally {
      setLoading(false);
    }
  }, [pageName, showToast]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // When countdown marks page expired
  useEffect(() => {
    if (countdown.isExpired && manifest && !isExpired) {
      setIsExpired(true);
      showToast('This BlinkPad page has expired and its data is scheduled for permanent deletion.', 'warning');
    }
  }, [countdown.isExpired, manifest, isExpired, showToast]);

  const handleSaveText = async (newText: string): Promise<boolean> => {
    if (isExpired) return false;
    setContent(newText);

    const now = Date.now();
    const expiresAt = manifest?.expires_at || (now + 24 * 60 * 60 * 1000);

    // Save to IndexedDB immediately so refresh/close preserves it 100%
    await saveOfflinePage({
      pageName,
      content: newText,
      createdAt: manifest?.created_at || now,
      updatedAt: now,
      expiresAt,
      version: version + 1,
      syncStatus: navigator.onLine ? 'synced' : 'pending',
    });

    if (!navigator.onLine) {
      // Queue sync action in IndexedDB
      await addSyncAction({
        id: crypto.randomUUID(),
        type: 'save_content',
        pageName,
        payload: { text: newText, version },
        createdAt: now,
        retryCount: 0,
      });
      setHasOfflineDraft(true);
      return true;
    }

    try {
      const res = await api.saveContent(pageName, newText, version);
      setVersion(res.version);
      setHasOfflineDraft(false);

      // Mark synced in IndexedDB
      await saveOfflinePage({
        pageName,
        content: newText,
        createdAt: manifest?.created_at || now,
        updatedAt: res.updated_at,
        expiresAt,
        version: res.version,
        syncStatus: 'synced',
      });
      return true;
    } catch (err: any) {
      if (err?.response?.status === 409) {
        showToast('Conflict detected! Another user updated this page. Reloading...', 'error');
        loadPage();
      } else if (err?.response?.status === 410) {
        setIsExpired(true);
        showToast('This BlinkPad page has expired and its data is scheduled for permanent deletion.', 'error');
      } else {
        // Queue for sync on reconnect
        await addSyncAction({
          id: crypto.randomUUID(),
          type: 'save_content',
          pageName,
          payload: { text: newText, version },
          createdAt: now,
          retryCount: 0,
        });
        setHasOfflineDraft(true);
        showToast('Saved to local storage. Will auto-sync when online.', 'info');
      }
      return false;
    }
  };

  const handleClearContent = async () => {
    try {
      if (navigator.onLine) {
        await api.clearContent(pageName);
      }
      setContent('');
      setVersion(prev => prev + 1);
      setShowClearConfirm(false);

      await saveOfflinePage({
        pageName,
        content: '',
        createdAt: manifest?.created_at || Date.now(),
        updatedAt: Date.now(),
        expiresAt: manifest?.expires_at || Date.now() + 24 * 60 * 60 * 1000,
        version: version + 1,
        syncStatus: navigator.onLine ? 'synced' : 'pending',
      });

      showToast('Content cleared successfully', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to clear content', 'error');
    }
  };

  const handleDeletePage = async () => {
    try {
      if (navigator.onLine) {
        await api.deletePage(pageName);
      }
      showToast(`Page "${pageName}" permanently deleted.`, 'success');
      navigate('/');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to delete page', 'error');
    }
  };

  const handleManualSyncNow = async () => {
    showToast('Syncing local draft to cloud...', 'info');
    const res = await syncManager.syncAll();
    if (res.success) {
      setHasOfflineDraft(false);
      showToast('Local draft successfully synced to cloud!', 'success');
      loadPage();
    } else {
      showToast('Sync failed. Please check connection.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0B091B]">
        <Navbar
          pageName={pageName}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 space-y-3">
          <img src="/pwa-192x192.png" alt="BlinkPad" className="w-16 h-16 rounded-2xl animate-pulse shadow-lg shadow-purple-900/50" />
          <p className="text-sm font-mono text-purple-300">Loading /{pageName}...</p>
        </div>
      </div>
    );
  }

  // 410: Page Expired (Rule 7: Strict 24-hour expiration)
  if (isExpired) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B091B]">
        <Navbar
          pageName={pageName}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-5">
          <div className="p-4 rounded-3xl bg-red-500/10 text-red-500">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              This BlinkPad page has expired and its data is scheduled for permanent deletion.
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Every cloud page on BlinkPad strictly auto-expires 24 hours after creation. All text and uploaded cloud files have been permanently wiped.
            </p>
          </div>
          <button
            onClick={() => loadPage()}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 text-white font-bold text-sm transition-all shadow-md shadow-brand-500/20 cursor-pointer"
          >
            Create Fresh Page with this Name
          </button>
        </div>
      </div>
    );
  }

  // 401: Password Locked - Prompt required on initial load and every reopen
  if (isLocked) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B091B]">
        <Navbar
          pageName={pageName}
          expiresAt={manifest?.expires_at}
          hasPassword={true}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <PasswordModal
            isOpen={true}
            pageName={pageName}
            onSuccess={() => {
              setIsLocked(false);
              setShowPasswordModal(false);
              loadPage();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B091B] transition-colors">
      <Navbar
        pageName={pageName}
        expiresAt={manifest?.expires_at}
        hasPassword={manifest?.has_password}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onDeletePageClick={() => setShowDeletePageConfirm(true)}
      />

      {/* Warning banner if < 1 hour remaining */}
      {countdown.isWarning && !isExpired && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Warning: Less than one hour remains before this BlinkPad permanently expires ({countdown.formatted}).</span>
        </div>
      )}

      {/* Offline Draft Banner with Sync Now option */}
      {hasOfflineDraft && (
        <div className="bg-purple-900/60 border-b border-purple-700/50 text-purple-200 px-4 py-2 text-xs font-medium flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Unsaved offline draft preserved in IndexedDB.</span>
          </div>
          {navigator.onLine && (
            <button
              onClick={handleManualSyncNow}
              className="px-2.5 py-1 rounded-lg bg-brand-500 text-white font-bold text-xs hover:bg-brand-600 transition-colors cursor-pointer"
            >
              Sync Now
            </button>
          )}
        </div>
      )}

      {/* ALL IN ONE WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 flex flex-col gap-6">
        {/* Section Header */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
            <FileText className="w-4 h-4 text-brand-500" />
            <span>BlinkPad Notes & Attached Files</span>
          </div>

          <button
            onClick={loadPage}
            className="p-1.5 sm:px-3 sm:py-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-800 rounded-xl transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
            title="Refresh pad"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* 1. TEXT EDITOR */}
        <section className="w-full">
          <TextEditor
            initialContent={content}
            isExpired={isExpired}
            version={version}
            onSave={handleSaveText}
            onClearContent={() => setShowClearConfirm(true)}
          />
        </section>

        {/* 2. FILES & SCREENSHOTS SECTION */}
        <section className="w-full pt-2">
          <FileSection
            pageName={pageName}
            files={manifest?.files || []}
            isExpired={isExpired}
            onFilesUpdated={loadPage}
          />
        </section>
      </main>

      {/* Password Modal (Unlock only) */}
      <PasswordModal
        isOpen={showPasswordModal}
        pageName={pageName}
        onSuccess={() => {
          setShowPasswordModal(false);
          loadPage();
        }}
      />

      {/* Clear Text Confirmation Dialog */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Text Content"
        message="Are you sure you want to erase all text in this pad? This will remove the text immediately."
        confirmLabel="Clear Text"
        onConfirm={handleClearContent}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Delete Page Confirmation Dialog */}
      <ConfirmModal
        isOpen={showDeletePageConfirm}
        title="Delete Entire Page"
        message={`Are you sure you want to permanently delete page "/${pageName}"? All text, files and cloud storage objects will be purged immediately.`}
        confirmLabel="Delete Page"
        onConfirm={handleDeletePage}
        onCancel={() => setShowDeletePageConfirm(false)}
      />
    </div>
  );
};
