import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Lock,
  Clock,
  HardDrive,
  Copy,
  Download,
  WifiOff
} from 'lucide-react';
import { RecentPages } from '../components/RecentPages';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { api } from '../services/api';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isInstallable, install } = usePwaInstall();
  const [pageName, setPageName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cleanName = pageName.trim().toLowerCase();

  const validate = (): boolean => {
    if (!cleanName) {
      setErrorMessage('Please enter a page name.');
      return false;
    }
    if (!/^[a-zA-Z0-9_-]{2,64}$/.test(cleanName)) {
      setErrorMessage('Page name must be 2-64 characters (letters, numbers, dashes, underscores).');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleGo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (showPasswordInput && password.trim()) {
      if (password.trim().length < 4) {
        setErrorMessage('Password must be at least 4 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await api.createPage(cleanName, password.trim());
        if (res.success) {
          navigate(`/${cleanName}`);
          return;
        }
      } catch (err: any) {
        if (err?.response?.status === 409) {
          // Page already exists - verify the entered password
          try {
            await api.verifyPassword(cleanName, password.trim());
            navigate(`/${cleanName}`);
            return;
          } catch {
            setErrorMessage('This page already exists and the password entered is incorrect.');
            setIsSubmitting(false);
            return;
          }
        } else {
          setErrorMessage(err?.response?.data?.error || 'Failed to initialize page.');
          setIsSubmitting(false);
          return;
        }
      } finally {
        setIsSubmitting(false);
      }
    }

    navigate(`/${cleanName}`);
  };

  return (
    <div className="min-w-full min-h-[calc(100vh-4rem)] flex flex-col items-center justify-between px-4 py-8 sm:py-14">
      <div className="w-full max-w-2xl mx-auto space-y-7 text-center">
        {/* Offline indicator if browser is offline */}
        {!navigator.onLine && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-semibold">
            <WifiOff className="w-4 h-4" />
            <span>You're offline. You can still create and edit local pads — they will auto-sync when online!</span>
          </div>
        )}

        {/* Hero Logo & Brand Title */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-brand-500 rounded-3xl blur-md opacity-70"></div>
            <img
              src="/logo.png"
              alt="BlinkPad"
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl shadow-2xl shadow-purple-900/50 object-cover"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 mt-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Strict 24-Hour Auto-Expiration</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            Fast ephemeral sharing in <span className="bg-gradient-to-r from-purple-400 to-brand-400 bg-clip-text text-transparent">seconds</span>.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
            Zero signups, full offline IndexedDB support. Paste screenshots (<kbd className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-800 rounded font-mono">Ctrl+V</kbd>), share files, collaborate, and auto-expire in 24 hours.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white dark:bg-[#130F2E] border border-slate-200/90 dark:border-purple-900/40 rounded-3xl p-5 sm:p-7 shadow-xl shadow-purple-950/20 text-left space-y-4">
          <form onSubmit={handleGo} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                ENTER PAGE NAME
              </label>

              {/* Clean Single Input + GO Button */}
              <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                <div className="relative flex-1 flex items-center">
                  <span className="absolute left-4 font-mono text-purple-400 text-sm font-bold select-none">
                    /
                  </span>
                  <input
                    type="text"
                    value={pageName}
                    onChange={e => {
                      setPageName(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    className="w-full pl-8 pr-4 py-3.5 bg-slate-50 dark:bg-[#1C1642]/80 border border-slate-300 dark:border-purple-800/50 rounded-2xl text-slate-900 dark:text-white font-mono text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-3.5 px-8 rounded-2xl bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 active:scale-95 text-white font-extrabold text-sm transition-all shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>Go</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Optional Password Setup (Page Creation Only) */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordInput(!showPasswordInput);
                  setPassword('');
                  setConfirmPassword('');
                  setErrorMessage(null);
                }}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-500 dark:hover:text-brand-400 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{showPasswordInput ? 'Remove password' : 'Add password (optional)'}</span>
              </button>

              {showPasswordInput && (
                <div className="pt-2 space-y-3 animate-fade-in">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      PASSWORD
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1C1642]/80 border border-slate-300 dark:border-purple-800/50 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      CONFIRM PASSWORD
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => {
                        setConfirmPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1C1642]/80 border border-slate-300 dark:border-purple-800/50 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <p className="text-[11px] text-slate-400 dark:text-purple-300/70">
                    If set, visitors must enter this password to view or edit this pad on any device.
                  </p>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium">
                {errorMessage}
              </div>
            )}
          </form>

          {/* PWA Install Banner inside card if available */}
          {isInstallable && (
            <div className="pt-3 border-t border-slate-100 dark:border-purple-900/30 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Install BlinkPad on your desktop or mobile:</span>
              <button
                onClick={install}
                className="px-3 py-1.5 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 text-brand-600 dark:text-brand-400 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install PWA</span>
              </button>
            </div>
          )}
        </div>

        {/* Recent Pages Component */}
        <RecentPages />

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-[#130F2E]/70 border border-slate-200/80 dark:border-purple-900/30 space-y-2">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 w-fit">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Strict 24h Expiry</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Every page and file expires exactly 24 hours after server creation. Purged automatically.
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-[#130F2E]/70 border border-slate-200/80 dark:border-purple-900/30 space-y-2">
            <div className="p-2.5 rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 w-fit">
              <HardDrive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Full Offline PWA</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              IndexedDB local storage lets you write and create pads even without internet. Auto-syncs when online.
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-[#130F2E]/70 border border-slate-200/80 dark:border-purple-900/30 space-y-2">
            <div className="p-2.5 rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-400 w-fit">
              <Copy className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Screenshot Pasting</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Press Ctrl+V to paste screenshots directly into your pad. Instant uploads and zero clutter.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-xs text-slate-400 dark:text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-2">
        <div className="flex items-center gap-2">
          <img src="/pwa-192x192.png" alt="BlinkPad" className="w-4 h-4 rounded" />
          <span className="font-bold text-slate-600 dark:text-slate-300">BlinkPad</span>
        </div>
        <span>•</span>
        <span>Ephemeral 24h Text, Screenshot & File Sharing Platform</span>
        <span>•</span>
        <span>Installable Progressive Web App</span>
      </footer>
    </div>
  );
};
