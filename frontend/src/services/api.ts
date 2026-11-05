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
    const headers = {
      ...getAuthHeaders(name),
      'Content-Type': 'multipart/form-data',
    };

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const res = await axios.post(`${API_BASE_URL}/pages/${encodeURIComponent(name)}/files`, formData, {
      headers,
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    return res.data;
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
    return `${API_BASE_URL}/pages/${encodeURIComponent(name)}/files/${fileId}`;
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
