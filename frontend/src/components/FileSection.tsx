import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  File,
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  Film,
  Music,
  Download,
  Trash2,
  Eye,
  Loader2,
  Clock,
  Plus,
  X
} from 'lucide-react';
import type { PageFile } from '../types';
import { formatBytes, formatTimeRemaining, formatDate } from '../utils/formatters';
import { api } from '../services/api';
import { useToast } from './Toast';
import { ImageModal } from './ImageModal';
import { ConfirmModal } from './ConfirmModal';

interface FileSectionProps {
  pageName: string;
  files: PageFile[];
  isExpired: boolean;
  onFilesUpdated: () => void;
}

export const FileSection: React.FC<FileSectionProps> = ({
  pageName,
  files,
  isExpired,
  onFilesUpdated,
}) => {
  const { showToast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Modals state
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<PageFile | null>(null);
  const [showRemoveAllConfirm, setShowRemoveAllConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (filesToUpload: File[]) => {
    if (isExpired || filesToUpload.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      await api.uploadFiles(pageName, filesToUpload, (percent) => {
        setUploadProgress(percent);
      });
      showToast(`${filesToUpload.length} file(s) uploaded successfully!`, 'success');
      onFilesUpdated();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to upload file(s).', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isExpired, pageName, onFilesUpdated, showToast]);

  // Global clipboard paste listener for images and files
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isExpired) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesFromClipboard: File[] = [];
      const seenClipboardFiles = new Set<string>();

      const addClipboardFile = (file: File | null) => {
        if (!file) return;
        const identity = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
        if (seenClipboardFiles.has(identity)) return;
        seenClipboardFiles.add(identity);

        let fileName = file.name;
        if (fileName === 'image.png' || !fileName) {
          const now = new Date();
          const timeStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
          fileName = `screenshot_${timeStr}.${extension}`;
        }
        filesFromClipboard.push(new File([file], fileName, { type: file.type }));
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') addClipboardFile(item.getAsFile());
      }

      // Safari and some mobile browsers expose pasted files here instead of
      // consistently populating ClipboardItem.getAsFile().
      Array.from(e.clipboardData?.files || []).forEach(addClipboardFile);

      if (filesFromClipboard.length > 0) {
        showToast(`Detected ${filesFromClipboard.length} file/screenshot from clipboard. Uploading...`, 'info');
        handleUpload(filesFromClipboard);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isExpired, handleUpload, showToast]);

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isExpired) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isExpired) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      handleUpload(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      handleUpload(selectedFiles);
    }
  };

  const handleDownload = (file: PageFile) => {
    showToast(`Downloading ${file.name}...`, 'info');
    api.downloadFile(pageName, file.id, file.name);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    try {
      await api.deleteFile(pageName, fileToDelete.id);
      showToast(`Removed "${fileToDelete.name}"`, 'success');
      setFileToDelete(null);
      onFilesUpdated();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to remove file', 'error');
    }
  };

  const handleRemoveAllConfirm = async () => {
    try {
      for (const file of files) {
        await api.deleteFile(pageName, file.id);
      }
      showToast('All files removed successfully.', 'success');
      setShowRemoveAllConfirm(false);
      onFilesUpdated();
    } catch {
      showToast('Failed to remove all files.', 'error');
    }
  };

  const getFileIcon = (file: PageFile) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mime = file.mime_type.toLowerCase();

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <ImageIcon className="w-5 h-5 text-indigo-500" />;
    }
    if (mime.includes('pdf') || ext === 'pdf') {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive className="w-5 h-5 text-amber-500" />;
    }
    if (mime.startsWith('video/') || ['mp4', 'webm'].includes(ext || '')) {
      return <Film className="w-5 h-5 text-purple-500" />;
    }
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext || '')) {
      return <Music className="w-5 h-5 text-emerald-500" />;
    }
    if (['html', 'js', 'ts', 'json', 'py', 'css', 'sql'].includes(ext || '')) {
      return <FileCode className="w-5 h-5 text-blue-500" />;
    }
    return <File className="w-5 h-5 text-slate-500" />;
  };

  const isImageFile = (file: PageFile) => {
    const mime = file.mime_type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase();
    return (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) && !mime.includes('svg');
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-3xl p-6 sm:p-8 transition-all flex flex-col items-center justify-center text-center ${
          isDragging
            ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/20'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/60 dark:bg-slate-900/40 shadow-xs'
        } ${isExpired ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !isExpired && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          disabled={isExpired}
          className="hidden"
        />

        <div className="p-3.5 rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Upload Files or Paste Screenshots
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          Drag & drop files here, browse from device, or press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700">Ctrl + V</kbd> to paste screenshots.
        </p>

        {uploading && (
          <div className="w-full max-w-xs mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-brand-600 dark:text-brand-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Uploading...
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* File List / Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Uploaded Files
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs bg-brand-500/10 text-brand-700 dark:text-brand-300 font-mono font-semibold">
              {files.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {files.length > 0 && !isExpired && (
              <button
                type="button"
                onClick={() => setShowRemoveAllConfirm(true)}
                className="text-xs font-semibold text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1 cursor-pointer"
                title="Remove all uploaded files"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove All</span>
              </button>
            )}

            {!isExpired && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add more</span>
              </button>
            )}
          </div>
        </div>

        {files.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/30 text-slate-400 text-xs">
            No files attached to this pad yet. Paste screenshots (Ctrl+V) or drop files above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {files.map((file) => {
              const countdown = formatTimeRemaining(file.expires_at - Date.now());
              const isImage = isImageFile(file);
              const previewUrl = api.getFileViewUrl(pageName, file.id);
              const downloadUrl = api.getFileDownloadUrl(pageName, file.id);

              return (
                <div
                  key={file.id}
                  className="group relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-brand-500/50 dark:hover:border-brand-500/50 rounded-2xl p-4 shadow-sm transition-all flex flex-col justify-between gap-3 overflow-hidden"
                >
                  {/* Top file header */}
                  <div className="flex items-start gap-3">
                    {/* Thumbnail or icon */}
                    {isImage ? (
                      <div
                        onClick={() => setPreviewImage({ url: previewUrl, name: file.name })}
                        className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 cursor-pointer border border-slate-200 dark:border-slate-700 group-hover:opacity-90 transition-opacity"
                        title="Click to view image"
                      >
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center flex-shrink-0 border border-slate-200 dark:border-slate-700">
                        {getFileIcon(file)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 pr-6">
                      <h4
                        className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
                        title={file.name}
                      >
                        {file.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatBytes(file.size)}
                      </p>
                      <div
                        className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-1"
                        title={`Expires: ${formatDate(file.expires_at)} (IST)`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Expires in {countdown.formatted}</span>
                      </div>
                    </div>

                    {/* Quick remove cross on top right */}
                    {!isExpired && (
                      <button
                        type="button"
                        onClick={() => setFileToDelete(file)}
                        className="absolute top-3 right-3 p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Actions: Prominent Download and Remove buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/70 text-xs gap-2">
                    <div className="flex items-center gap-2">
                      {isImage && (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ url: previewUrl, name: file.name })}
                          className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Preview full size"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-medium hidden sm:inline">View</span>
                        </button>
                      )}

                      {/* Direct native browser download link */}
                      <a
                        href={downloadUrl}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => showToast(`Downloading ${file.name}...`, 'info')}
                        className="px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 border border-brand-200/60 dark:border-brand-800/60"
                        title="Download original file directly to device"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </div>

                    {!isExpired && (
                      <button
                        type="button"
                        onClick={() => setFileToDelete(file)}
                        className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 border border-red-200/60 dark:border-red-900/60"
                        title="Remove this file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      <ImageModal
        isOpen={!!previewImage}
        imageUrl={previewImage?.url || null}
        filename={previewImage?.name || ''}
        onClose={() => setPreviewImage(null)}
        onDownload={() => {
          if (previewImage) {
            const found = files.find(f => f.name === previewImage.name);
            if (found) handleDownload(found);
          }
        }}
      />

      {/* Remove Single File Confirmation Modal */}
      <ConfirmModal
        isOpen={!!fileToDelete}
        title="Remove File"
        message={`Are you sure you want to remove "${fileToDelete?.name}"? It will be permanently deleted from storage.`}
        confirmLabel="Remove File"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setFileToDelete(null)}
      />

      {/* Remove All Files Confirmation Modal */}
      <ConfirmModal
        isOpen={showRemoveAllConfirm}
        title="Remove All Files"
        message={`Are you sure you want to remove all ${files.length} uploaded files? This action cannot be undone.`}
        confirmLabel="Remove All"
        onConfirm={handleRemoveAllConfirm}
        onCancel={() => setShowRemoveAllConfirm(false)}
      />
    </div>
  );
};
