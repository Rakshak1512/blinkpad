import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { History, X, Clock, ExternalLink } from 'lucide-react';
import type { RecentPageItem } from '../types';
import { formatDate } from '../utils/formatters';

const RECENT_KEY = 'quickpad_recent_pages';

export function addRecentPage(name: string, expiresAt: number) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    let list: RecentPageItem[] = raw ? JSON.parse(raw) : [];
    list = list.filter(item => item.name.toLowerCase() !== name.toLowerCase());
    list.unshift({
      name,
      visited_at: Date.now(),
      expires_at: expiresAt,
    });
    // keep at most 10 recent pages
    list = list.slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}

export const RecentPages: React.FC = () => {
  const [recent, setRecent] = useState<RecentPageItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const list: RecentPageItem[] = JSON.parse(raw);
        // Filter out expired items based on timestamp
        const now = Date.now();
        const valid = list.filter(item => item.expires_at > now);
        setRecent(valid);
        if (valid.length !== list.length) {
          localStorage.setItem(RECENT_KEY, JSON.stringify(valid));
        }
      }
    } catch {}
  }, []);

  const handleRemove = (name: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = recent.filter(r => r.name !== name);
    setRecent(updated);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  };

  const handleClearAll = () => {
    setRecent([]);
    localStorage.removeItem(RECENT_KEY);
  };

  if (recent.length === 0) return null;

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 pt-6 border-t border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5 font-medium">
          <History className="w-3.5 h-3.5" />
          Recent Pages on this Device
        </span>
        <button
          onClick={handleClearAll}
          className="hover:text-red-500 transition-colors"
        >
          Clear History
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {recent.map(item => (
          <Link
            key={item.name}
            to={`/${item.name}`}
            className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand-500/50 dark:hover:border-brand-500/50 shadow-sm transition-all group"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-brand-600 dark:group-hover:text-brand-400">
                <span>/{item.name}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                <Clock className="w-3 h-3" />
                <span>Visited {formatDate(item.visited_at)}</span>
              </div>
            </div>

            <button
              onClick={e => handleRemove(item.name, e)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Remove from history"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
};
