import axios, { type AxiosProgressEvent } from 'axios';
import type { PageResponse, PublicPageManifest } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://blinkpad-qs77.vercel.app/api').replace(/\/$/, '');

// Strict In-Memory Token Store for the current view session ONLY.
// As commanded: NEVER persisted to sessionStorage, localStorage, cookies, or IndexedDB.
// A browser page refresh (F5), tab close/reopen, new tab, or new device automatically
// re-prompts for password verification on every protected page!
const inMemoryTokens = new Map<string, string>();

export function getPageToken(pageName: string): string | null {
  return inMemoryTokens.get(pageName.toLowerCase()) || null;
}

export function setPageToken(pageName: string, token: string | null): void {
  const key = pageName.toLowerCase();
  if (token) {
    inMemoryTokens.set(key, token);
  } else {
    inMemoryTokens.delete(key);
  }
}

function getAuthHeaders(pageName: string): Record<string, string> {
  const token = getPageToken(pageName);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async createPage(name: string, password?: string): Promise<{ success: boolean; page: PublicPageManifest; token?: string }> {
    const res = await axios.post(`${API_BASE_URL}/pages`, { name, password });
    if (res.data?.token) {
      setPageToken(name, res.data.token);
    }
    return res.data;
  },

  async getPage(name: string): Promise<PageResponse> {
    const headers = getAuthHeaders(name);
    const res = await axios.get(`${API_BASE_URL}/pages/${encodeURIComponent(name)}`, { headers });
    return res.data;
  },

  async getPageStatus(name: string): Promise<any> {
    const res = await axios.get(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/status`);
    return res.data;
  },

  async saveContent(name: string, text: string, version?: number): Promise<{ success: boolean; version: number; updated_at: number }> {
    const headers = getAuthHeaders(name);
    const res = await axios.put(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/content`, { text, version }, { headers });
    return res.data;
  },

  async clearContent(name: string): Promise<{ success: boolean }> {
    const headers = getAuthHeaders(name);
    const res = await axios.delete(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/content`, { headers });
    return res.data;
  },

  async uploadFiles(
    name: string,
    files: File[],
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; files: any[] }> {
    if (!files.length) return { success: true, files: [] };
    const headers = getAuthHeaders(name);
    const pagePath = `${API_BASE_URL}/pages/${encodeURIComponent(name)}/files`;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0) || 1;

    // Request short-lived, single-object signed URLs from our authenticated API.
    const prepare = await axios.post(`${pagePath}/upload-url`, {
      files: files.map(file => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      })),
    }, { headers });

    const uploads: any[] = prepare.data?.uploads || [];
    if (uploads.length !== files.length) {
      throw new Error('The backend did not prepare every selected file for upload.');
    }

    let completedBytes = 0;
    try {
      // Send bytes directly to Firebase Cloud Storage. This avoids Vercel's
      // serverless request-body limit and keeps files durable between instances.
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const upload = uploads[index];
        let lastFileBytes = 0;

        await axios.put(upload.upload_url, file, {
          headers: { 'Content-Type': upload.content_type || file.type || 'application/octet-stream' },
          onUploadProgress: (event: AxiosProgressEvent) => {
            const currentBytes = event.total
              ? Math.min(file.size, Math.round((event.loaded / event.total) * file.size))
              : event.loaded;
            const delta = Math.max(0, currentBytes - lastFileBytes);
            lastFileBytes = currentBytes;
            if (onProgress) {
              onProgress(Math.min(99, Math.round(((completedBytes + currentBytes) / totalBytes) * 100)));
            }
          },
        });
        completedBytes += file.size;
        if (onProgress) onProgress(Math.min(99, Math.round((completedBytes / totalBytes) * 100)));
      }

      const finalize = await axios.post(`${pagePath}/complete`, {
        files: uploads.map(upload => ({
          id: upload.id,
          name: upload.name,
          r2_key: upload.r2_key,
        })),
      }, { headers });

      if (onProgress) onProgress(100);
      return finalize.data;
    } catch (error) {
      // Best-effort cleanup for any upload that failed before it was committed.
      await axios.post(`${pagePath}/abort`, {
        r2_keys: uploads.map(upload => upload.r2_key),
      }, { headers }).catch(() => undefined);
      throw error;
    }
  },

  async deleteFile(name: string, fileId: string): Promise<{ success: boolean }> {
    const headers = getAuthHeaders(name);
    const res = await axios.delete(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/files/${fileId}`, { headers });
    return res.data;
  },

  async deletePage(name: string): Promise<{ success: boolean }> {
    const headers = getAuthHeaders(name);
    const res = await axios.delete(`${API_BASE_URL}/pages/${encodeURIComponent(name)}`, { headers });
    setPageToken(name, null);
    return res.data;
  },

  async setPassword(
    name: string,
    currentPassword?: string,
    newPassword?: string | null
  ): Promise<{ success: boolean; has_password: boolean; token?: string }> {
    const headers = getAuthHeaders(name);
    const res = await axios.post(
      `${API_BASE_URL}/pages/${encodeURIComponent(name)}/password`,
      { currentPassword, newPassword },
      { headers }
    );
    if (res.data.token) {
      setPageToken(name, res.data.token);
    } else if (!res.data.has_password) {
      setPageToken(name, null);
    }
    return res.data;
  },

  async verifyPassword(name: string, password: string): Promise<{ success: boolean; token: string }> {
    const res = await axios.post(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/verify-password`, { password });
    if (res.data.token) {
      setPageToken(name, res.data.token);
    }
    return res.data;
  },

  getFileDownloadUrl(name: string, fileId: string): string {
    const token = getPageToken(name);
    let url = `${API_BASE_URL}/pages/${encodeURIComponent(name)}/files/${fileId}?download=true`;
    if (token) {
      // In case browser triggers direct link
      url += `&auth=${encodeURIComponent(token)}`;
    }
    return url;
  },

  getFileViewUrl(name: string, fileId: string): string {
    const token = getPageToken(name);
    const url = `${API_BASE_URL}/pages/${encodeURIComponent(name)}/files/${fileId}`;
    return token ? `${url}?auth=${encodeURIComponent(token)}` : url;
  },

  downloadFile(name: string, fileId: string, filename: string): void {
    const url = this.getFileDownloadUrl(name, fileId);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
    }, 300);
  },

  async downloadFileBlob(name: string, fileId: string, filename: string): Promise<void> {
    try {
      this.downloadFile(name, fileId, filename);
    } catch {
      const headers = getAuthHeaders(name);
      const res = await axios.get(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/files/${fileId}?download=true`, {
        headers,
        responseType: 'blob',
      });
      const blob = new Blob([res.data]);
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(link.href);
    }
  }
};
