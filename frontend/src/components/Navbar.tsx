import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  Check,
  Clock,
  Lock,
  Sun,
  Moon,
  Trash2,
  Download,
  Wifi,
  WifiOff,
  RotateCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { syncManager, type SyncState } from '../services/syncManager';
import { formatDate } from '../utils/formatters';
import { useToast } from './Toast';

interface NavbarProps {
  pageName?: string;
  expiresAt?: number;
  hasPassword?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onDeletePageClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  pageName,
  expiresAt,
  hasPassword = false,
  theme,
  onToggleTheme,
  onDeletePageClick,
}) => {
  const { showToast } = useToast();
  const { isInstallable, install } = usePwaInstall();
  const [copied, setCopied] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(navigator.onLine ? 'idle' : 'offline');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
    showToast('Syncing with cloud...', 'info');
    const res = await syncManager.syncAll();
    if (res.success) {
      showToast('All changes synced successfully!', 'success');
    } else {
      showToast('Sync completed with errors.', 'warning');
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-purple-900/30 bg-white/85 dark:bg-[#0B091B]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-black text-lg text-slate-900 dark:text-white group"
          >
            <img
              src="/pwa-192x192.png"
              alt="BlinkPad Logo"
              className="w-8 h-8 rounded-xl shadow-md shadow-brand-500/20"
            />
            <span className="tracking-tight text-xl font-extrabold">
              Blink<span className="text-brand-500 dark:text-brand-400">Pad</span>
            </span>
          </Link>

          {pageName && (
            <div className="flex items-center gap-1.5 pl-2.5 border-l border-slate-200 dark:border-purple-900/40 text-sm">
              <span className="text-slate-400 font-mono">/</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono truncate max-w-[110px] sm:max-w-[180px]">
                {pageName}
              </span>
              <button
                onClick={handleCopyLink}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors ml-0.5 cursor-pointer"
                title="Copy page link"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-brand-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Connectivity / Sync Status Badge */}
          <div className="flex items-center">
            {!isOnline || syncState === 'offline' ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                title="Working offline. Drafts are preserved in IndexedDB."
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline</span>
              </div>
            ) : syncState === 'syncing' ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 animate-pulse"
                title="Syncing pending edits with server..."
              >
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Syncing...</span>
              </div>
            ) : syncState === 'synced' ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/30"
                title="All changes synced to cloud."
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-500" />
                <span className="hidden sm:inline">Synced</span>
              </div>
            ) : syncState === 'failed' ? (
              <button
                onClick={handleManualSync}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20 cursor-pointer"
                title="Click to retry sync"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sync Failed</span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-400 dark:text-slate-500"
                title="Connected to cloud"
              >
                <Wifi className="w-3.5 h-3.5 text-brand-500/70" />
              </div>
            )}
          </div>

          {/* PWA Install Button (surfaced when installable) */}
          {isInstallable && (
            <button
              onClick={install}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-brand-500/15 hover:bg-brand-500/25 text-brand-600 dark:text-brand-400 border border-brand-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Install BlinkPad to your device"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          {/* 24-Hour Expiration countdown */}
          {expiresAt && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                countdown.isExpired
                  ? 'bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400'
                  : countdown.isWarning
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400 animate-pulse'
                  : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
              }`}
              title={countdown.isExpired ? 'Page expired' : `Strict 24-hour cloud expiration: ${formatDate(expiresAt)} (IST)`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">24h Expiry:</span>
              <span className="font-mono">{countdown.formatted}</span>
            </div>
          )}

          {/* Password Protected Read-Only Badge (NO edit/change options inside pad) */}
          {hasPassword && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/25 select-none"
              title="This page is password protected"
            >
              <Lock className="w-3.5 h-3.5 text-brand-500" />
              <span className="hidden sm:inline">Protected</span>
            </div>
          )}

          {/* Delete Page */}
          {pageName && onDeletePageClick && (
            <button
              onClick={onDeletePageClick}
              className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              title="Delete this entire page"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Theme Switcher */}
          <button
            onClick={onToggleTheme}
            className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-xl border border-slate-200 dark:border-purple-900/40 transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>
    </header>
  );
};
