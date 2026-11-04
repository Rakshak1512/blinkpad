export interface PageFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  uploaded_at: number;
  expires_at: number;
  r2_key: string;
}

export interface PublicPageManifest {
  id: string;
  name: string;
  created_at: number;
  expires_at: number;
  updated_at: number;
  version: number;
  has_password: boolean;
  files: PageFile[];
}

export interface PageResponse {
  page: PublicPageManifest;
  content: string;
  server_time: number;
}

export type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'error' | 'offline';

export interface RecentPageItem {
  name: string;
  visited_at: number;
  expires_at: number;
}

