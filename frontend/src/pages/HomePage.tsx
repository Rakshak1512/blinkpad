import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Lock,
  Clock,
  WifiOff,
  Sparkles,
  Shield,
  FileUp,
  Database
} from 'lucide-react';
import { RecentPages } from '../components/RecentPages';
import { api } from '../services/api';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
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

  const handleRandomName = () => {
    const adjectives = ['swift', 'hyper', 'crypto', 'silent', 'cosmic', 'zenith', 'stellar', 'quantum', 'pulse', 'spark'];
    const nouns = ['pad', 'memo', 'vault', 'note', 'drop', 'beacon', 'draft', 'sync', 'relay', 'nexus'];
    const num = Math.floor(100 + Math.random() * 900);
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    setPageName(`${adj}-${noun}-${num}`);
    setErrorMessage(null);
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
    <div className="relative min-w-full min-h-[calc(100vh-4rem)] flex flex-col items-center justify-between px-4 py-8 sm:py-16 overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] sm:w-[48rem] h-[24rem] bg-gradient-to-tr from-purple-600/15 via-brand-500/10 to-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse-glow" />

      <div className="w-full max-w-2xl mx-auto space-y-8 text-center z-10">
        {/* Offline indicator if browser is offline */}
        {!navigator.onLine && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-semibold">
            <WifiOff className="w-4 h-4" />
            <span>You're offline. You can still create and edit local pads — they will auto-sync to Supabase when online!</span>
          </div>
        )}

        {/* Hero Logo & Brand Title */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative group">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-purple-600 via-brand-500 to-indigo-600 rounded-3xl blur-md opacity-70 group-hover:opacity-100 transition-opacity"></div>
            <img
              src="/logo.png"
              alt="BlinkPad Logo"
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl shadow-2xl shadow-purple-950/60 object-cover"
            />
          </div>

          {/* 12-Hour Expiration Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            <span>Strict 12-Hour Auto-Expiration</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
            Fast ephemeral sharing in <span className="bg-gradient-to-r from-purple-500 via-brand-400 to-indigo-400 bg-clip-text text-transparent">seconds</span>.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
            Zero signups. Powered by <span className="font-semibold text-purple-600 dark:text-purple-400">Supabase PostgreSQL & Storage</span>. Paste screenshots (<kbd className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-white/10 rounded font-mono">Ctrl+V</kbd>), share files, collaborate, and auto-expire in exactly 12 hours.
          </p>
        </div>

        {/* Pad Creator Card */}
        <div className="w-full rounded-3xl glass-card p-6 sm:p-8 space-y-5 border border-white/20 dark:border-white/10 shadow-2xl">
          <form onSubmit={handleGo} className="space-y-4">
            <div className="space-y-1.5 text-left">
              <label htmlFor="pad-name" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Enter or Create Pad Name</span>
                <button
                  type="button"
                  onClick={handleRandomName}
                  className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-semibold text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Random Slug</span>
                </button>
              </label>

              <div className="relative flex items-center">
                <span className="absolute left-4 font-mono font-bold text-slate-400 dark:text-slate-500 select-none">
                  blinkpad/
                </span>
                <input
                  id="pad-name"
                  type="text"
                  value={pageName}
                  onChange={(e) => {
                    setPageName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="my-secret-pad"
                  className="w-full pl-28 pr-4 py-3.5 text-sm sm:text-base font-mono rounded-2xl glass-input"
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Optional Password Accordion */}
            <div className="text-left">
              <button
                type="button"
                onClick={() => setShowPasswordInput(!showPasswordInput)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{showPasswordInput ? 'Remove password protection' : 'Add password protection (optional)'}</span>
              </button>

              {showPasswordInput && (
                <div className="mt-3 p-4 rounded-2xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/15 space-y-3 animate-in fade-in duration-200">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Set Pad Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter at least 4 characters"
                      className="w-full px-3 py-2 mt-1 text-sm rounded-xl glass-input"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type password"
                      className="w-full px-3 py-2 mt-1 text-sm rounded-xl glass-input"
                    />
                  </div>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl text-left animate-in fade-in">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-brand-500 hover:from-purple-700 hover:to-brand-600 text-white font-bold text-sm sm:text-base shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 active:scale-[0.99] transition-all flex items-center justify-center gap-2 group"
            >
              <span>{isSubmitting ? 'Initializing...' : 'Open or Create Pad'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>

        {/* Recent Pads */}
        <div className="w-full">
          <RecentPages />
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left pt-4">
          <div className="p-4 rounded-2xl glass-card border border-white/10 space-y-2">
            <div className="p-2 w-fit rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">12-Hour Expiration</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All notes, files and metadata permanently self-destruct after 12 hours.
            </p>
          </div>

          <div className="p-4 rounded-2xl glass-card border border-white/10 space-y-2">
            <div className="p-2 w-fit rounded-xl bg-brand-500/10 text-brand-500">
              <Database className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Supabase Cloud</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              High-performance PostgreSQL and reliable Supabase file storage.
            </p>
          </div>

          <div className="p-4 rounded-2xl glass-card border border-white/10 space-y-2">
            <div className="p-2 w-fit rounded-xl bg-emerald-500/10 text-emerald-500">
              <FileUp className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Seamless Uploads</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Drag-and-drop, clipboard screenshot paste (<kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-[10px]">Ctrl+V</kbd>), and queue management.
            </p>
          </div>

          <div className="p-4 rounded-2xl glass-card border border-white/10 space-y-2">
            <div className="p-2 w-fit rounded-xl bg-amber-500/10 text-amber-500">
              <Shield className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Password Protected</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Optional PBKDF2 hashed password protection with in-memory session tokens.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-2xl mx-auto pt-10 text-center text-xs text-slate-400 dark:text-slate-600">
        <p>BlinkPad • Ephemeral Cloud Notepad & File Sharing • 12-Hour Auto-Expiry</p>
      </footer>
    </div>
  );
};
