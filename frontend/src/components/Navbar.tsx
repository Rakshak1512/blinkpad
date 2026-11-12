import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  Check,
  Clock,
  Lock,
  Unlock,
  Sun,
  Moon,
  Trash2,
  Share2,
  WifiOff,
  RotateCw,
  DownloadCloud
} from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { syncManager, type SyncState } from '../services/syncManager';
import { useToast } from './Toast';
import { ShareModal } from './ShareModal';

interface NavbarProps {
  pageName?: string;
  expiresAt?: number;
  hasPassword?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onDeletePageClick?: () => void;
  onPasswordClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  pageName,
  expiresAt,
  hasPassword = false,
  theme,
  onToggleTheme,
  onDeletePageClick,
  onPasswordClick,
}) => {
  const { showToast } = useToast();
  const { isInstallable, install } = usePwaInstall();
  const [copied, setCopied] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(navigator.onLine ? 'idle' : 'offline');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showShareModal, setShowShareModal] = useState(false);

  const countdown = useCountdown(expiresAt);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    showToast('Page link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSync = async () => {
    showToast('Syncing with Supabase cloud...', 'info');
    const res = await syncManager.syncAll();
    if (res.success) {
      showToast('All changes synced successfully!', 'success');
    } else {
      showToast('Sync completed with warnings.', 'warning');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/90 dark:border-white/[0.08] bg-white/80 dark:bg-[#0B091B]/80 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand & Pad Indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="flex items-center gap-2.5 font-black text-lg text-slate-900 dark:text-white group"
            >
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-brand-500 rounded-xl blur-sm opacity-50 group-hover:opacity-100 transition-opacity" />
                <img
                  src="/pwa-192x192.png"
                  alt="BlinkPad"
                  className="relative w-8 h-8 rounded-xl shadow-md object-cover"
                />
              </div>
              <span className="tracking-tight text-xl font-extrabold hidden sm:inline">
                Blink<span className="bg-gradient-to-r from-purple-500 to-brand-400 bg-clip-text text-transparent">Pad</span>
              </span>
            </Link>

            {pageName && (
              <div className="flex items-center gap-1 sm:gap-1.5 pl-2 sm:pl-3 border-l border-slate-200 dark:border-white/10">
                <div
                  onClick={handleCopyLink}
                  title="Click to copy pad URL"
                  className="group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs sm:text-sm font-mono font-semibold cursor-pointer transition-all active:scale-95"
                >
                  <span>/{pageName}</span>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {pageName && (
              <>
                {/* 12h Expiration Countdown Badge */}
                {expiresAt && (
                  <div
                    title={`Strict 12-hour expiration: ${countdown.formatted} remaining`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                      countdown.isWarning
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <Clock className={`w-3.5 h-3.5 ${countdown.isWarning ? 'text-rose-500' : 'text-purple-500'}`} />
                    <span className="font-mono">{countdown.formatted}</span>
                  </div>
                )}

                {/* Password status badge / trigger */}
                {onPasswordClick && (
                  <button
                    onClick={onPasswordClick}
                    title={hasPassword ? 'Pad is password protected (Click to change)' : 'Pad is public (Click to protect)'}
                    className={`p-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                      hasPassword
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:text-purple-500 hover:border-purple-500/30'
                    }`}
                  >
                    {hasPassword ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                )}

                {/* Share Button */}
                <button
                  onClick={() => setShowShareModal(true)}
                  title="Share pad link & QR code"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md shadow-purple-600/20 active:scale-95 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              </>
            )}

            {/* Offline / Online Sync Indicator */}
            {isOnline ? (
              syncState === 'syncing' ? (
                <div
                  title="Syncing changes with Supabase..."
                  className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"
                >
                  <RotateCw className="w-4 h-4 animate-spin" />
                </div>
              ) : null
            ) : (
              <button
                onClick={handleManualSync}
                title="You are offline. Click to retry sync when network recovers."
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold animate-pulse"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Offline</span>
              </button>
            )}

            {/* PWA Install Button */}
            {isInstallable && (
              <button
                onClick={install}
                title="Install BlinkPad application"
                className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 transition-all active:scale-95"
              >
                <DownloadCloud className="w-4 h-4" />
              </button>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-all active:scale-95"
            >
              {theme === 'light' ? <Moon className="w-4 h-4 text-purple-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            {/* Delete Pad Button */}
            {pageName && onDeletePageClick && (
              <button
                onClick={onDeletePageClick}
                title="Delete this entire pad and its files"
                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Share Modal */}
      {pageName && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          pageName={pageName}
          hasPassword={hasPassword}
          expiresAt={expiresAt}
        />
      )}
    </>
  );
};
