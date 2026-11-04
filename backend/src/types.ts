export interface Env {
  R2_BUCKET: R2Bucket;
  APP_NAME?: string;
  APP_ENV?: string;
  APP_BASE_URL?: string;
  ALLOWED_ORIGIN?: string;
  AUTH_SECRET?: string; // used for HMAC token signing
}

export interface PageFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  uploaded_at: number;
  expires_at: number;
  r2_key: string;
}

export interface PageManifest {
  id: string;
  name: string;
  created_at: number;
  expires_at: number;
  updated_at: number;
  version: number;
  has_password: boolean;
  password_hash?: string | null;
  password_salt?: string | null;
  files: PageFile[];
}

export interface PageContent {
  text: string;
  updated_at: number;
  version: number;
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

