import React, { useState, useRef, useEffect } from 'react';
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
  X,
  HardDrive
} from 'lucide-react';
import type { PageFile } from '../types';
import { formatBytes, formatTimeRemaining } from '../utils/formatters';
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
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Modals state
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<PageFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get matching Lucide icon based on mime type or extension
  const getFileIcon = (fileName: string, mimeType: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-purple-400" />;
    }
    if (mimeType.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
      return <Film className="w-5 h-5 text-indigo-400" />;
    }
    if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
      return <Music className="w-5 h-5 text-pink-400" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'json', 'sql', 'cpp', 'rs', 'go'].includes(ext)) {
      return <FileCode className="w-5 h-5 text-cyan-400" />;
    }
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
      return <FileText className="w-5 h-5 text-emerald-400" />;
    }
    return <File className="w-5 h-5 text-slate-400" />;
  };

  const handleStageFiles = (newFiles: FileList | File[]) => {
    if (isExpired) return;
    const array = Array.from(newFiles);
    if (array.length === 0) return;

    setStagedFiles((prev) => [...prev, ...array]);
    showToast(`Added ${array.length} file(s) to upload queue`, 'info');
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartUpload = async () => {
    if (isExpired || stagedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      await api.uploadFiles(pageName, stagedFiles, (percent) => {
        setUploadProgress(percent);
      });
      showToast(`${stagedFiles.length} file(s) uploaded to Supabase Storage!`, 'success');
      setStagedFiles([]);
      onFilesUpdated();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to upload files to Supabase.', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Clipboard paste listener for images/files
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isExpired) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesFromClipboard: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            let fileName = file.name;
            if (fileName === 'image.png' || !fileName) {
              const now = new Date();
              const timeStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
              fileName = `screenshot_${timeStr}.png`;
            }
            const namedFile = new (window.File)([file], fileName, { type: file.type });
            filesFromClipboard.push(namedFile);
          }
        }
      }

      if (filesFromClipboard.length > 0) {
        showToast(`Detected ${filesFromClipboard.length} file from clipboard`, 'info');
        setStagedFiles((prev) => [...prev, ...filesFromClipboard]);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isExpired, showToast]);

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
      handleStageFiles(e.dataTransfer.files);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!fileToDelete) return;
    try {
      await api.deleteFile(pageName, fileToDelete.id);
      showToast(`Deleted "${fileToDelete.name}"`, 'success');
      onFilesUpdated();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to delete file', 'error');
    } finally {
      setFileToDelete(null);
    }
  };

  const handleDownload = (file: PageFile) => {
    try {
      api.downloadFile(pageName, file.id, file.name);
      showToast(`Downloading "${file.name}"...`, 'info');
    } catch {
      api.downloadFileBlob(pageName, file.id, file.name);
    }
  };

  const isImageFile = (fileName: string, mimeType: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
  };

  return (
    <div className="w-full space-y-5">
      {/* Upload Zone Card */}
      <div className="w-full rounded-3xl glass-card overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Supabase File Sharing</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                All common file types supported • Auto-deletes after 12 hours
              </p>
            </div>
          </div>
          <div className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            {files.length} {files.length === 1 ? 'file' : 'files'} online
          </div>
        </div>

        {/* Dropzone Area */}
        <div className="p-4 sm:p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer group ${
              isDragging
                ? 'border-purple-500 bg-purple-500/10 scale-[0.99]'
                : 'border-slate-300 dark:border-white/15 hover:border-purple-500/50 hover:bg-slate-50/80 dark:hover:bg-white/[0.02]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleStageFiles(e.target.files)}
              disabled={isExpired || uploading}
            />

            <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform mb-3">
              <UploadCloud className="w-7 h-7" />
            </div>

            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 text-center">
              Drag & drop files here, or <span className="text-purple-600 dark:text-purple-400 underline">browse</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">
              Paste screenshots directly with <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-white/10 font-mono text-[10px]">Ctrl+V</kbd> • Images, PDFs, Videos, Archives, Code
            </p>
          </div>

          {/* Staged Files Queue (Before Upload) */}
          {stagedFiles.length > 0 && (
            <div className="mt-4 p-4 rounded-2xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/20 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-bold text-purple-700 dark:text-purple-300">
                <span>Selected to Upload ({stagedFiles.length})</span>
                <button
                  onClick={() => setStagedFiles([])}
                  className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
                >
                  Clear Queue
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {stagedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      {getFileIcon(file.name, file.type)}
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">{file.name}</span>
                      <span className="text-slate-400 shrink-0 text-[11px]">({formatBytes(file.size)})</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStagedFile(idx);
                      }}
                      title="Remove from queue"
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Upload Progress Bar */}
              {uploading && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-semibold text-purple-600 dark:text-purple-400">
                    <span>Uploading to Supabase Storage...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-brand-400 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload Action Button */}
              <div className="pt-1 flex justify-end">
                <button
                  onClick={handleStartUpload}
                  disabled={uploading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-lg shadow-purple-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading {stagedFiles.length} file(s)...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Upload All to Cloud ({stagedFiles.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Uploaded Files Section */}
      <div className="w-full rounded-3xl glass-card overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-purple-500" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Active Files on Cloud</h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">12h strictly enforced</span>
        </div>

        <div className="p-4 sm:p-6">
          {files.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-purple-500/10 text-purple-500 mb-1">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No files uploaded yet</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Use the dropzone above or paste images from your clipboard to share files across devices instantly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {files.map((file) => {
                const remaining = formatTimeRemaining(file.expires_at - Date.now());
                const isImg = isImageFile(file.name, file.mime_type);
                const fileViewUrl = api.getFileViewUrl(pageName, file.id);

                return (
                  <div
                    key={file.id}
                    className="group relative flex flex-col justify-between p-3.5 rounded-2xl glass-card-interactive border border-slate-200 dark:border-white/10 hover:border-purple-500/40"
                  >
                    <div>
                      {/* File Icon & Name */}
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 shrink-0 group-hover:bg-purple-500/10 transition-colors">
                          {getFileIcon(file.name, file.mime_type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            title={file.name}
                            className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
                          >
                            {file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                            <span>{formatBytes(file.size)}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                              <Clock className="w-3 h-3" />
                              <span>{remaining.formatted}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Image Thumbnail Preview if image */}
                      {isImg && (
                        <div
                          onClick={() => setPreviewImage({ url: fileViewUrl, name: file.name })}
                          className="mt-3 relative h-28 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer group/img"
                        >
                          <img
                            src={fileViewUrl}
                            alt={file.name}
                            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1">
                            <Eye className="w-4 h-4" />
                            <span>Preview</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons (Download, Preview, Delete) */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-1">
                        {isImg && (
                          <button
                            onClick={() => setPreviewImage({ url: fileViewUrl, name: file.name })}
                            title="Preview image"
                            className="p-1.5 rounded-xl text-slate-500 hover:text-purple-600 hover:bg-purple-500/10 transition-colors text-xs font-medium flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDownload(file)}
                          title="Download file"
                          className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors text-xs font-semibold flex items-center gap-1 active:scale-95"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Download</span>
                        </button>
                      </div>

                      {/* Delete File Button */}
                      <button
                        onClick={() => setFileToDelete(file)}
                        title="Delete file permanently"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <ImageModal
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage.url}
          filename={previewImage.name}
          onDownload={() => {
            const a = document.createElement('a');
            a.href = previewImage.url;
            a.download = previewImage.name;
            a.click();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <ConfirmModal
          isOpen={!!fileToDelete}
          onCancel={() => setFileToDelete(null)}
          onConfirm={handleDeleteConfirmed}
          title="Delete File from Supabase Storage?"
          message={`Are you sure you want to permanently delete "${fileToDelete.name}"? This action cannot be undone.`}
          confirmLabel="Delete File"
          isDestructive={true}
        />
      )}
    </div>
  );
};
