import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-5 bg-slate-50 dark:bg-slate-950">
      <div className="p-4 rounded-3xl bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
        <FileQuestion className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">404 - Not Found</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          The page or route you were looking for does not exist or has an invalid address.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to QuickPad Home</span>
      </Link>
    </div>
  );
};

