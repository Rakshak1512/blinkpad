import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  Clock,
  Lock,
  QrCode,
  ExternalLink
} from 'lucide-react';
import { formatTimeRemaining } from '../utils/formatters';
import { useToast } from './Toast';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageName: string;
  hasPassword?: boolean;
  expiresAt?: number;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  pageName,
  hasPassword = false,
  expiresAt,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/${pageName}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    showToast('Share link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `BlinkPad - ${pageName}`,
          text: `Access my temporary BlinkPad "${pageName}" (expires in 12 hours):`,
          url: shareUrl,
        });
      } catch {
        // User canceled share
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-6 overflow-hidden rounded-3xl glass-card border border-white/20 dark:border-purple-500/20 shadow-2xl">
        {/* Ambient background glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-brand-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Share BlinkPad</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pad name: <span className="font-semibold text-purple-600 dark:text-purple-400">/{pageName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-4">
          {/* Share Link Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Shareable URL</label>
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full px-3 py-1.5 text-xs sm:text-sm font-mono bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none select-all"
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                  copied
                    ? 'bg-emerald-500 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white active:scale-95'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={() => setShowQr(!showQr)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-purple-500/10 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
            >
              <QrCode className="w-4 h-4" />
              <span>{showQr ? 'Hide QR Code' : 'Show QR Code'}</span>
            </button>

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
              <button
                onClick={handleNativeShare}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-purple-500/10 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Device Share</span>
              </button>
            ) : (
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-purple-500/10 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in Tab</span>
              </a>
            )}
          </div>

          {/* QR Code Display */}
          {showQr && (
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 space-y-2 animate-in zoom-in-95 duration-200">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`}
                alt="BlinkPad QR Code"
                className="w-40 h-40 rounded-xl"
                loading="lazy"
              />
              <p className="text-[11px] text-slate-400 text-center">Scan with mobile camera to view pad</p>
            </div>
          )}

          {/* Badges / Guarantees */}
          <div className="p-3 rounded-2xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/10 space-y-2 text-xs">
            <div className="flex items-center justify-between text-purple-700 dark:text-purple-300 font-medium">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-purple-500" />
                <span>Strict 12-Hour Automatic Deletion</span>
              </div>
              {expiresAt && (
                <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400">
                  {formatTimeRemaining(Math.max(0, expiresAt - Date.now())).formatted} left
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-6">
              All text, files, and sharing records automatically self-destruct 12 hours after creation.
            </p>

            {hasPassword && (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium pt-1 border-t border-purple-500/10">
                <Lock className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Password Protected (Recipients need password)</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-white font-semibold text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
