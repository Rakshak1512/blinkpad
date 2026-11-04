const PAGE_NAME_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

export function isValidPageName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    return false;
  }
  return PAGE_NAME_REGEX.test(trimmed);
}

export function sanitizePageName(name: string): string {
  return name.trim().toLowerCase();
}

export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed_file';
  // Strip paths
  const base = name.replace(/^.*[\\/]/, '');
  // Replace unsafe chars
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized.slice(0, 150) || 'unnamed_file';
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file

export const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'pdf', 'zip', 'rar', '7z', 'tar', 'gz',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'json', 'md', 'xml', 'log',
  'mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a'
]);

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.toLowerCase() || '';
}

export function isAllowedFileType(filename: string): boolean {
  const ext = getFileExtension(filename);
  if (!ext) return true; // allow files without extension as text/binary
  return ALLOWED_EXTENSIONS.has(ext);
}

