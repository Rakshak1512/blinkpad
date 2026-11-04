import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './Toast';

interface PasswordModalProps {
  isOpen: boolean;
  pageName: string;
  onSuccess: (token?: string) => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  pageName,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Unlimited attempts - zero rate limiting, zero lockouts, zero captchas
      const res = await api.verifyPassword(pageName, password.trim());
      showToast('Page unlocked successfully!', 'success');
      setPassword('');
      onSuccess(res.token);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-[#130F2E] border border-slate-200 dark:border-purple-900/50 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Password Protected
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Page: <span className="font-mono text-brand-600 dark:text-brand-400 font-semibold">/{pageName}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/50">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            This BlinkPad page is password protected. Enter the password to view and edit its content and files.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
              PASSWORD
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1C1642]/80 border border-slate-300 dark:border-purple-800/50 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>

            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 active:scale-95 transition-all shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'Verifying...' : 'Unlock Pad'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
