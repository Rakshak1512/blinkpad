import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  Copy,
  Download,
  FileText,
  Maximize2,
  Minimize2
} from 'lucide-react';
import type { SaveStatus } from '../types';
import { useToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';

interface TextEditorProps {
  initialContent: string;
  isExpired: boolean;
  version: number;
  onSave: (text: string) => Promise<boolean>;
  onClearContent: () => void;
}

export const TextEditor: React.FC<TextEditorProps> = ({
  initialContent,
  isExpired,
  onSave,
  onClearContent,
}) => {
  const { showToast } = useToast();
  const [text, setText] = useState<string>(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedTextRef = useRef<string>(initialContent);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    setText(initialContent);
    lastSavedTextRef.current = initialContent;
    setSaveStatus('saved');
  }, [initialContent]);

  // Online / offline tracking
  useEffect(() => {
    const handleOnline = () => {
      if (text !== lastSavedTextRef.current) {
        setSaveStatus('unsaved');
      }
    };
    const handleOffline = () => {
      setSaveStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [text]);

  const performSave = useCallback(async (textToSave: string): Promise<boolean> => {
    if (isExpired) return false;
    if (!navigator.onLine) {
      setSaveStatus('offline');
      return false;
    }

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      const success = await onSave(textToSave);
      if (success) {
        lastSavedTextRef.current = textToSave;
        setSaveStatus('saved');
        return true;
      } else {
        setSaveStatus('error');
        setErrorMessage('Failed to save changes');
        return false;
      }
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err?.response?.data?.error || 'Save failed. Draft saved locally.');
      return false;
    }
  }, [isExpired, onSave]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);

    if (newText === lastSavedTextRef.current) {
      setSaveStatus('saved');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    setSaveStatus('unsaved');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave(newText);
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S or Cmd+S to manual save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      performSave(text);
    }

    // Tab key support in text editor
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newText = text.substring(0, start) + '  ' + text.substring(end);
      setText(newText);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleCopy = () => {
    if (!text) {
      showToast('Text editor is empty', 'warning');
      return;
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Text copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!text) {
      showToast('Nothing to download', 'warning');
      return;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `blinkpad_note_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Downloaded text note as .txt', 'success');
  };

  // Stats calculation
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split('\n').length : 1;

  return (
    <div className={`relative flex flex-col transition-all duration-300 ${
      isFullscreen
        ? 'fixed inset-0 z-50 p-4 sm:p-6 bg-slate-900/95 backdrop-blur-2xl'
        : 'w-full rounded-3xl glass-card overflow-hidden'
    }`}>
      {/* Editor Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Live Notepad</span>

          {/* Save Status Chip */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Saved</span>
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="inline-flex items-center gap-1 text-amber-500">
                <Save className="w-3.5 h-3.5" />
                <span>Unsaved changes</span>
              </span>
            )}
            {saveStatus === 'offline' && (
              <span className="text-amber-500">Offline Draft</span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-1 text-rose-500" title={errorMessage || 'Save error'}>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Save failed</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Quick Copy */}
          <button
            onClick={handleCopy}
            title="Copy text to clipboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all active:scale-95"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Text'}</span>
          </button>

          {/* Download Text */}
          <button
            onClick={handleDownloadTxt}
            title="Download note as .txt file"
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export .txt</span>
          </button>

          {/* Clear Text */}
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={!text || isExpired}
            title="Clear all text"
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Fullscreen Expand */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Distraction-Free Mode'}
            className="p-1.5 rounded-xl text-slate-400 hover:text-purple-500 hover:bg-purple-500/10 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Textarea */}
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isExpired}
          placeholder="Start typing your notes, paste content, or drop files below... (Auto-saves in real-time, self-destructs in 12 hours)"
          className="w-full h-80 sm:h-96 p-4 sm:p-6 text-sm sm:text-base font-mono bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400/80 dark:placeholder-slate-500/80 focus:outline-none resize-y leading-relaxed transition-colors"
          style={{ minHeight: isFullscreen ? 'calc(100vh - 120px)' : '20rem' }}
        />
      </div>

      {/* Footer Info Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-t border-slate-200/80 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] text-[11px] text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-3">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{charCount} characters</span>
          <span>•</span>
          <span>{lineCount} lines</span>
        </div>
        <div className="hidden sm:block">
          <span>Auto-syncs • Press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-white/10 font-mono text-[10px]">Ctrl+S</kbd> to save</span>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={() => {
          onClearContent();
          setText('');
          lastSavedTextRef.current = '';
          setSaveStatus('saved');
          setShowClearConfirm(false);
          showToast('Pad text cleared', 'info');
        }}
        title="Clear Notepad Content?"
        message="Are you sure you want to clear all text in this pad? This action cannot be undone."
        confirmLabel="Clear Content"
        isDestructive={true}
      />
    </div>
  );
};
