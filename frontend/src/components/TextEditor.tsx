import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save,
  Check,
  AlertCircle,
  Loader2,
  WifiOff,
  Trash2,
  Copy,
  Sparkles
} from 'lucide-react';
import type { SaveStatus } from '../types';
import { useToast } from './Toast';

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedTextRef = useRef<string>(initialContent);
  const debounceTimerRef = useRef<any>(null);

  // Sync when initialContent arrives from server
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
      setErrorMessage(err?.response?.data?.error || 'Save failed. Your content is kept safe locally.');
      return false;
    }
  }, [isExpired, onSave]);

  // Handle typing with auto-save debounce
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);

    if (newText === lastSavedTextRef.current) {
      setSaveStatus('saved');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    setSaveStatus(navigator.onLine ? 'unsaved' : 'offline');

    // Debounced autosave (1.5 seconds)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (navigator.onLine && !isExpired) {
      debounceTimerRef.current = setTimeout(() => {
        performSave(newText);
      }, 1500);
    }
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (text !== lastSavedTextRef.current) {
          performSave(text);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, performSave]);

  const handleManualSave = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    performSave(text);
  };

  const handleCopyAll = async () => {
    if (!text) return;

    const fallbackCopy = (): boolean => {
      const temporary = document.createElement('textarea');
      temporary.value = text;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      temporary.style.pointerEvents = 'none';
      document.body.appendChild(temporary);
      temporary.select();
      temporary.setSelectionRange(0, temporary.value.length);
      const copied = document.execCommand('copy');
      temporary.remove();
      return copied;
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!fallbackCopy()) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }
      showToast('All text copied to clipboard!', 'success');
    } catch {
      try {
        if (fallbackCopy()) {
          showToast('All text copied to clipboard!', 'success');
        } else {
          showToast('Copy was blocked by the browser. Select the text and copy it manually.', 'error');
        }
      } catch {
        showToast('Copy was blocked by the browser. Select the text and copy it manually.', 'error');
      }
    }
  };

  // Stats
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;
  const lineCount = text ? text.split('\n').length : 1;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
      {/* Editor Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60">
        {/* Left: Actions */}
        <div className="flex items-center gap-2">
          {/* Manual Save Button */}
          <button
            type="button"
            onClick={handleManualSave}
            disabled={saveStatus === 'saving' || isExpired}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95 ${
              saveStatus === 'saved'
                ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                : saveStatus === 'unsaved'
                ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/20'
                : saveStatus === 'saving'
                ? 'bg-blue-600 text-white cursor-wait'
                : saveStatus === 'error'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-slate-400 text-white cursor-not-allowed'
            }`}
            title="Manual Save (Ctrl+S)"
          >
            {saveStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saveStatus === 'saved' && <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />}
            {saveStatus === 'unsaved' && <Save className="w-3.5 h-3.5" />}
            {saveStatus === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
            {saveStatus === 'offline' && <WifiOff className="w-3.5 h-3.5" />}
            <span>
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved'}
              {saveStatus === 'unsaved' && 'Save Changes'}
              {saveStatus === 'error' && 'Retry Save'}
              {saveStatus === 'offline' && 'Offline'}
            </span>
          </button>

          {/* Quick Toolbar Buttons */}
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={!text}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
            title="Copy all text"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Copy All</span>
          </button>

          <button
            type="button"
            onClick={onClearContent}
            disabled={!text || isExpired}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors text-xs flex items-center gap-1"
            title="Clear all text"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>

        {/* Right: Status Indicator & Stats */}
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {errorMessage && (
            <span className="text-red-600 dark:text-red-400 truncate max-w-xs text-xs font-medium">
              {errorMessage}
            </span>
          )}

          <div className="hidden sm:flex items-center gap-3 border-l border-slate-200 dark:border-slate-800 pl-3">
            <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
            <span>•</span>
            <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
            <span>•</span>
            <span>{charCount} chars</span>
          </div>
        </div>
      </div>

      {/* Main Textarea */}
      <div className="relative flex-1 flex flex-col min-h-[420px]">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          disabled={isExpired}
          placeholder={
            isExpired
              ? 'This page has expired. Editing is disabled.'
              : 'Write, paste text, or drop files here... (Auto-saves automatically)'
          }
          className="w-full flex-1 p-5 text-slate-800 dark:text-slate-100 bg-transparent resize-none focus:outline-none font-mono text-sm leading-relaxed tracking-wide selection:bg-brand-500/20"
          spellCheck={false}
        />

        {text.length === 0 && !isExpired && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400/60 dark:text-slate-600/60 p-6 text-center">
            <Sparkles className="w-10 h-10 mb-3 opacity-40 text-brand-500" />
            <p className="text-sm font-medium">Ready for your notes</p>
            <p className="text-xs mt-1 max-w-md">
              Start typing, paste from clipboard (Ctrl+V), or drag and drop files and screenshots here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
