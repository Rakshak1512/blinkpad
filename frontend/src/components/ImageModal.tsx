import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  filename: string;
  onClose: () => void;
  onDownload: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  imageUrl,
  filename,
  onClose,
  onDownload,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
        {/* Controls */}
        <div className="w-full flex items-center justify-between pb-3 text-white">
          <span className="text-sm font-medium truncate max-w-md">{filename}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Download image"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 flex items-center justify-center">
          <img
            src={imageUrl}
            alt={filename}
            className="max-h-[80vh] max-w-full object-contain select-none"
          />
        </div>
      </div>
    </div>
  );
};

