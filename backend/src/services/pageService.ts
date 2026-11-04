import { Env, PageFile, PageManifest, PublicPageManifest } from '../types';
import { R2Storage } from '../storage/r2';
import { calculateFileExpiresAt, calculatePageExpiresAt, isPageExpired } from '../expiration/cleanup';
import {
  generateSalt,
  generateUUID,
  hashPassword,
  verifyPassword,
  createAuthToken
} from './cryptoService';
import { isAuthorizedForPage } from '../middleware/auth';
import {
  isValidPageName,
  sanitizeFilename,
  sanitizePageName,
  isAllowedFileType,
  MAX_FILE_SIZE_BYTES
} from '../utils/validator';

export class PageService {
  static toPublicManifest(manifest: PageManifest): PublicPageManifest {
    return {
      id: manifest.id,
      name: manifest.name,
      created_at: manifest.created_at,
      expires_at: manifest.expires_at,
      updated_at: manifest.updated_at,
      version: manifest.version,
      has_password: manifest.has_password,
      files: manifest.files.filter(f => f.expires_at > Date.now()),
    };
  }

  static async createPage(
    bucket: R2Bucket,
    rawName: string,
    password?: string,
    env?: Env
  ): Promise<{ success: boolean; page?: PublicPageManifest; token?: string; error?: string; code?: string }> {
    if (!isValidPageName(rawName)) {
      return { success: false, error: 'Invalid page name. Use 2-64 alphanumeric characters, dashes or underscores.', code: 'INVALID_NAME' };
    }

    const name = sanitizePageName(rawName);
    const existing = await R2Storage.getManifest(bucket, name);

    if (existing) {
      if (!isPageExpired(existing)) {
        return {
          success: false,
          error: `Page "${name}" already exists.`,
          code: 'PAGE_EXISTS',
          page: this.toPublicManifest(existing)
        };
      }
      // If expired, clean up old objects before reusing name
      await R2Storage.deletePageAllObjects(bucket, name);
    }

    const now = Date.now();
    const expiresAt = calculatePageExpiresAt(now);
    let hasPassword = false;
    let passwordHash: string | null = null;
    let passwordSalt: string | null = null;

    if (password && password.trim().length > 0) {
      hasPassword = true;
      passwordSalt = generateSalt();
      passwordHash = await hashPassword(password.trim(), passwordSalt);
    }

    const manifest: PageManifest = {
      id: generateUUID(),
      name,
      created_at: now,
      expires_at: expiresAt,
      updated_at: now,
      version: 1,
      has_password: hasPassword,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      files: [],
    };

    await R2Storage.saveManifest(bucket, name, manifest);
    await R2Storage.saveContent(bucket, name, '', 1);

    let token: string | undefined = undefined;
    if (hasPassword && env) {
      const secret = env.AUTH_SECRET || 'quickpad-default-session-secret-key-12345';
      token = await createAuthToken(name, expiresAt, secret);
    }

    return {
      success: true,
      page: this.toPublicManifest(manifest),
      token,
    };
  }

  static async getPage(
    bucket: R2Bucket,
    rawName: string,
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found', code: 'NOT_FOUND' } };
    }

    if (isPageExpired(manifest)) {
      // Lazy cleanup of expired page
      R2Storage.deletePageAllObjects(bucket, name).catch(() => {});
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.', code: 'PAGE_EXPIRED' } };
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return {
          status: 401,
          body: {
            error: 'Password required to access this page.',
            code: 'AUTH_REQUIRED',
            requiresPassword: true,
            page: {
              name: manifest.name,
              created_at: manifest.created_at,
              expires_at: manifest.expires_at,
              has_password: true,
            }
          }
        };
      }
    }

    const content = await R2Storage.getContent(bucket, name);

    return {
      status: 200,
      body: {
        page: this.toPublicManifest(manifest),
        content: content.text,
        server_time: Date.now(),
      }
    };
  }

  static async getPageStatus(
    bucket: R2Bucket,
    rawName: string
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { exists: false, error: 'Page not found' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { exists: false, expired: true, error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' } };
    }

    return {
      status: 200,
      body: {
        exists: true,
        name: manifest.name,
        created_at: manifest.created_at,
        expires_at: manifest.expires_at,
        has_password: manifest.has_password,
        version: manifest.version,
        file_count: manifest.files.length,
        server_time: Date.now(),
      }
    };
  }

  static async saveContent(
    bucket: R2Bucket,
    rawName: string,
    text: string,
    expectedVersion: number | undefined,
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found', code: 'NOT_FOUND' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.', code: 'PAGE_EXPIRED' } };
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return { status: 401, body: { error: 'Unauthorized', code: 'AUTH_REQUIRED' } };
      }
    }

    // Check for concurrency conflict if client provided an older version
    if (typeof expectedVersion === 'number' && manifest.version > expectedVersion + 1) {
      return {
        status: 409,
        body: {
          error: 'Conflict: Content was modified by another session.',
          code: 'CONCURRENCY_CONFLICT',
          serverVersion: manifest.version,
        }
      };
    }

    const newVersion = manifest.version + 1;
    const now = Date.now();

    // Update content in R2
    const savedContent = await R2Storage.saveContent(bucket, name, text, newVersion);

    // Update manifest metadata (CRITICAL: Never reset expires_at!)
    manifest.version = newVersion;
    manifest.updated_at = now;
    await R2Storage.saveManifest(bucket, name, manifest);

    return {
      status: 200,
      body: {
        success: true,
        version: newVersion,
        updated_at: savedContent.updated_at,
      }
    };
  }

  static async uploadFile(
    bucket: R2Bucket,
    rawName: string,
    fileData: { name: string; type: string; size: number; stream: ReadableStream | ArrayBuffer },
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found', code: 'NOT_FOUND' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.', code: 'PAGE_EXPIRED' } };
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return { status: 401, body: { error: 'Unauthorized', code: 'AUTH_REQUIRED' } };
      }
    }

    if (fileData.size > MAX_FILE_SIZE_BYTES) {
      return {
        status: 413,
        body: { error: `File exceeds maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`, code: 'FILE_TOO_LARGE' }
      };
    }

    const safeOriginalName = sanitizeFilename(fileData.name);
    if (!isAllowedFileType(safeOriginalName)) {
      return {
        status: 400,
        body: { error: 'File type is not permitted.', code: 'FILE_TYPE_NOT_ALLOWED' }
      };
    }

    const fileId = generateUUID();
    const r2Key = `pages/${name}/files/${fileId}_${safeOriginalName}`;
    const now = Date.now();
    const fileExpiresAt = calculateFileExpiresAt(now, manifest.expires_at);

    // Upload to R2
    await R2Storage.uploadFile(bucket, r2Key, fileData.stream, fileData.type, {
      file_id: fileId,
      original_name: safeOriginalName,
      uploaded_at: now.toString(),
      expires_at: fileExpiresAt.toString(),
    });

    const fileRecord: PageFile = {
      id: fileId,
      name: safeOriginalName,
      mime_type: fileData.type || 'application/octet-stream',
      size: fileData.size,
      uploaded_at: now,
      expires_at: fileExpiresAt,
      r2_key: r2Key,
    };

    manifest.files.push(fileRecord);
    manifest.updated_at = now;
    manifest.version += 1;
    await R2Storage.saveManifest(bucket, name, manifest);

    return {
      status: 201,
      body: {
        success: true,
        file: fileRecord,
      }
    };
  }

  static async getFile(
    bucket: R2Bucket,
    rawName: string,
    fileId: string,
    request: Request,
    env: Env,
    downloadMode: boolean
  ): Promise<Response> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return new Response(JSON.stringify({ error: 'Page not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (isPageExpired(manifest)) {
      return new Response(JSON.stringify({ error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const fileRecord = manifest.files.find(f => f.id === fileId);
    if (!fileRecord) {
      return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (Date.now() >= fileRecord.expires_at) {
      return new Response(JSON.stringify({ error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
    }

    const r2Object = await R2Storage.getFile(bucket, fileRecord.r2_key);
    if (!r2Object) {
      return new Response(JSON.stringify({ error: 'File object not found in storage' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set('etag', r2Object.httpEtag);

    // Safe MIME type handling
    let mimeType = fileRecord.mime_type || 'application/octet-stream';
    // If SVG or HTML, enforce safe headers or octet-stream to prevent stored XSS
    const isSvg = mimeType.includes('svg') || fileRecord.name.toLowerCase().endsWith('.svg');
    const isHtml = mimeType.includes('html') || fileRecord.name.toLowerCase().endsWith('.html') || fileRecord.name.toLowerCase().endsWith('.htm');

    if (isHtml) {
      mimeType = 'text/plain'; // Never serve user-uploaded HTML as executable HTML
    }

    headers.set('Content-Type', mimeType);

    // Clean filename for Content-Disposition header
    const encodedFilename = encodeURIComponent(fileRecord.name);
    const disposition = downloadMode || isHtml
      ? `attachment; filename="${fileRecord.name}"; filename*=UTF-8''${encodedFilename}`
      : `inline; filename="${fileRecord.name}"; filename*=UTF-8''${encodedFilename}`;

    headers.set('Content-Disposition', disposition);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(r2Object.body, {
      status: 200,
      headers,
    });
  }

  static async deleteFile(
    bucket: R2Bucket,
    rawName: string,
    fileId: string,
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' } };
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return { status: 401, body: { error: 'Unauthorized' } };
      }
    }

    const fileIndex = manifest.files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) {
      return { status: 404, body: { error: 'File not found' } };
    }

    const fileRecord = manifest.files[fileIndex];
    await R2Storage.deleteObject(bucket, fileRecord.r2_key);

    manifest.files.splice(fileIndex, 1);
    manifest.updated_at = Date.now();
    manifest.version += 1;
    await R2Storage.saveManifest(bucket, name, manifest);

    return {
      status: 200,
      body: { success: true, message: 'File deleted successfully', fileId }
    };
  }

  static async clearContent(
    bucket: R2Bucket,
    rawName: string,
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' } };
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return { status: 401, body: { error: 'Unauthorized' } };
      }
    }

    const newVersion = manifest.version + 1;
    await R2Storage.saveContent(bucket, name, '', newVersion);

    manifest.version = newVersion;
    manifest.updated_at = Date.now();
    await R2Storage.saveManifest(bucket, name, manifest);

    return {
      status: 200,
      body: { success: true, message: 'Page content cleared' }
    };
  }

  static async deletePage(
    bucket: R2Bucket,
    rawName: string,
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found' } };
    }

    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      if (!authorized) {
        return { status: 401, body: { error: 'Unauthorized' } };
      }
    }

    const count = await R2Storage.deletePageAllObjects(bucket, name);
    return {
      status: 200,
      body: { success: true, message: `Page "${name}" and all ${count} objects permanently deleted.` }
    };
  }

  static async setPassword(
    bucket: R2Bucket,
    rawName: string,
    currentPassword: string | undefined,
    newPassword: string | null | undefined,
    request: Request,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' } };
    }

    // If already has password, currentPassword must verify or user must have valid token
    if (manifest.has_password) {
      const authorized = await isAuthorizedForPage(request, env, manifest);
      let verifiedCurrent = false;

      if (currentPassword && manifest.password_salt && manifest.password_hash) {
        verifiedCurrent = await verifyPassword(currentPassword, manifest.password_salt, manifest.password_hash);
      }

      if (!authorized && !verifiedCurrent) {
        return { status: 401, body: { error: 'Invalid current password.', code: 'INVALID_PASSWORD' } };
      }
    }

    if (!newPassword || newPassword.trim().length === 0) {
      // Remove password
      manifest.has_password = false;
      manifest.password_hash = null;
      manifest.password_salt = null;
    } else {
      // Set new password
      const salt = generateSalt();
      const hash = await hashPassword(newPassword.trim(), salt);
      manifest.has_password = true;
      manifest.password_salt = salt;
      manifest.password_hash = hash;
    }

    manifest.updated_at = Date.now();
    await R2Storage.saveManifest(bucket, name, manifest);

    // Generate token if password is set
    let token: string | undefined = undefined;
    if (manifest.has_password) {
      const secret = env.AUTH_SECRET || 'quickpad-default-session-secret-key-12345';
      token = await createAuthToken(name, manifest.expires_at, secret);
    }

    return {
      status: 200,
      body: {
        success: true,
        has_password: manifest.has_password,
        token,
        message: manifest.has_password ? 'Password enabled successfully.' : 'Password removed successfully.'
      }
    };
  }

  static async verifyPassword(
    bucket: R2Bucket,
    rawName: string,
    passwordAttempt: string,
    env: Env
  ): Promise<{ status: number; body: any }> {
    const name = sanitizePageName(rawName);
    const manifest = await R2Storage.getManifest(bucket, name);

    if (!manifest) {
      return { status: 404, body: { error: 'Page not found' } };
    }

    if (isPageExpired(manifest)) {
      return { status: 410, body: { error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.' } };
    }

    if (!manifest.has_password || !manifest.password_hash || !manifest.password_salt) {
      return { status: 200, body: { success: true, message: 'Page does not require a password' } };
    }

    const isValid = await verifyPassword(passwordAttempt, manifest.password_salt, manifest.password_hash);
    if (!isValid) {
      return { status: 401, body: { error: 'Incorrect password', code: 'INVALID_PASSWORD' } };
    }

    const secret = env.AUTH_SECRET || 'quickpad-default-session-secret-key-12345';
    const token = await createAuthToken(name, manifest.expires_at, secret);

    return {
      status: 200,
      body: {
        success: true,
        token,
        expires_at: manifest.expires_at,
      }
    };
  }
}

