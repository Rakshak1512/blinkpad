import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import * as dotenv from 'dotenv';
import { SupabaseStorage } from './storage/supabase.ts';
import {
  generateSalt,
  generateUUID,
  hashPassword,
  verifyPassword,
  createAuthToken,
  verifyAuthToken
} from './services/cryptoService.ts';
import {
  isValidPageName,
  sanitizeFilename,
  sanitizePageName,
  isAllowedFileType,
  MAX_FILE_SIZE_BYTES
} from './utils/validator.ts';
import { PageFile, PageManifest, PublicPageManifest } from './types.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

// Strict 12-hour expiration window as required
export const PAGE_LIFETIME_MS = 12 * 60 * 60 * 1000;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || (process.env.VERCEL ? '' : 'blinkpad-local-development-secret-key-123456');
  if (secret.length < 32) {
    throw new Error('AUTH_SECRET must be configured with at least 32 characters for password-protected pages.');
  }
  return secret;
}

function getSingleRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * Formats a Unix millisecond timestamp into:
 * `D Month YYYY, hh:mm:ss AM/PM` (e.g. `12 November 2026, 07:30:00 PM`)
 * Always using the `Asia/Kolkata` (IST) timezone.
 */
export function formatBlinkpadDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const p: Record<string, string> = {};
  for (const item of parts) {
    p[item.type] = item.value;
  }

  const period = p.dayPeriod ? p.dayPeriod.toUpperCase() : '';
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} ${period}`.trim();
}

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer memory storage for uploads (no artificial file size limits in code; bounded by memory limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB per file upload stream
});

function toPublicManifest(manifest: PageManifest): PublicPageManifest {
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

async function isAuthorized(req: Request, manifest: PageManifest): Promise<boolean> {
  if (!manifest.has_password) return true;

  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token && typeof req.query.auth === 'string') {
    token = req.query.auth;
  }

  if (!token) return false;
  return await verifyAuthToken(token, manifest.name, getAuthSecret());
}

// Backend landing route
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    app: 'BlinkPad Backend',
    message: 'BlinkPad API is running with Supabase PostgreSQL & Supabase Storage.',
    database: 'Supabase PostgreSQL',
    storage: 'Supabase Storage',
    expiry: '12 Hours Auto-Expiry',
    health: '/health',
    api_health: '/api/health',
    documentation: 'Use the /api/* endpoints for BlinkPad operations.',
  });
});

// Health check endpoint
app.get(['/health', '/api/health'], async (_req: Request, res: Response) => {
  const now = Date.now();
  res.json({
    status: 'ok',
    app: process.env.APP_NAME || 'BlinkPad',
    database: 'Supabase PostgreSQL',
    storage: 'Supabase Storage',
    backend_url: process.env.BACKEND_URL || `http://localhost:${PORT}`,
    expiry_policy: 'Strict 12-Hour Expiration',
    time: now,
    time_formatted: formatBlinkpadDate(now),
    timezone: 'Asia/Kolkata (IST)',
  });
});

// Scheduled cleanup handler (invoked by Vercel Cron or manual admin)
async function handleScheduledCleanup(req: Request, res: Response) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  if (cronSecret && authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized cleanup request.' });
  }

  try {
    const result = await SupabaseStorage.runScheduledCleanup();
    return res.json({ ...result });
  } catch (err: any) {
    console.error('[Cleanup Error]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

app.get('/api/admin/cleanup', handleScheduledCleanup);
app.post('/api/admin/cleanup', handleScheduledCleanup);

// Create page
app.post('/api/pages', async (req: Request, res: Response) => {
  const rawName = req.body?.name;
  const password = req.body?.password;

  if (!rawName || !isValidPageName(rawName)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid page name. Use 2-64 alphanumeric characters, dashes or underscores.',
      code: 'INVALID_NAME'
    });
  }

  const name = sanitizePageName(rawName);
  const existing = await SupabaseStorage.getManifest(name);

  if (existing) {
    if (Date.now() < existing.expires_at) {
      return res.status(409).json({
        success: false,
        error: `Page "${name}" already exists.`,
        code: 'PAGE_EXISTS',
        page: toPublicManifest(existing),
      });
    }
    // Expired - clean up before reusing
    await SupabaseStorage.deletePageAllObjects(name);
  }

  const now = Date.now();
  const expiresAt = now + PAGE_LIFETIME_MS; // Exactly 12 hours
  let hasPassword = false;
  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;

  if (password && typeof password === 'string' && password.trim().length > 0) {
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

  await SupabaseStorage.saveManifest(name, manifest);
  await SupabaseStorage.saveContent(name, '', 1);

  let token: string | undefined = undefined;
  if (hasPassword) {
    token = await createAuthToken(name, expiresAt, getAuthSecret());
  }

  return res.status(201).json({
    success: true,
    page: toPublicManifest(manifest),
    token,
  });
});

// Get page
app.get('/api/pages/:name', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found', code: 'NOT_FOUND' });
  }

  if (Date.now() >= manifest.expires_at) {
    SupabaseStorage.deletePageAllObjects(name).catch(() => {});
    return res.status(410).json({
      error: 'This BlinkPad page has expired after 12 hours and is scheduled for permanent deletion.',
      code: 'PAGE_EXPIRED'
    });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({
        error: 'Password required to access this page.',
        code: 'AUTH_REQUIRED',
        requiresPassword: true,
        page: {
          name: manifest.name,
          created_at: manifest.created_at,
          expires_at: manifest.expires_at,
          has_password: true,
        }
      });
    }
  }

  const content = await SupabaseStorage.getContent(name);
  return res.json({
    page: toPublicManifest(manifest),
    content: content.text,
    server_time: Date.now(),
  });
});

// Get page status
app.get('/api/pages/:name/status', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ exists: false, error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      exists: false,
      expired: true,
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  return res.json({
    exists: true,
    name: manifest.name,
    created_at: manifest.created_at,
    expires_at: manifest.expires_at,
    created_at_formatted: formatBlinkpadDate(manifest.created_at),
    expires_at_formatted: formatBlinkpadDate(manifest.expires_at),
    timezone: 'Asia/Kolkata (IST)',
    has_password: manifest.has_password,
    version: manifest.version,
    file_count: manifest.files.length,
    server_time: Date.now(),
    server_time_formatted: formatBlinkpadDate(Date.now()),
  });
});

// Delete page
app.delete('/api/pages/:name', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const count = await SupabaseStorage.deletePageAllObjects(name);
  return res.json({
    success: true,
    message: `Page "${name}" and all associated files permanently deleted.`
  });
});

// Save content (text)
app.put('/api/pages/:name/content', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found', code: 'NOT_FOUND' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired after 12 hours and its data is scheduled for permanent deletion.',
      code: 'PAGE_EXPIRED'
    });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    }
  }

  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const expectedVersion = typeof req.body?.version === 'number' ? req.body.version : undefined;

  if (typeof expectedVersion === 'number' && manifest.version > expectedVersion + 1) {
    return res.status(409).json({
      error: 'Conflict: Content was modified by another session.',
      code: 'CONCURRENCY_CONFLICT',
      serverVersion: manifest.version,
    });
  }

  const newVersion = manifest.version + 1;
  const savedContent = await SupabaseStorage.saveContent(name, text, newVersion);

  manifest.version = newVersion;
  manifest.updated_at = savedContent.updated_at;
  await SupabaseStorage.saveManifest(name, manifest);

  return res.json({
    success: true,
    version: newVersion,
    updated_at: savedContent.updated_at,
  });
});

// Clear content
app.delete('/api/pages/:name/content', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const newVersion = manifest.version + 1;
  await SupabaseStorage.saveContent(name, '', newVersion);

  manifest.version = newVersion;
  manifest.updated_at = Date.now();
  await SupabaseStorage.saveManifest(name, manifest);

  return res.json({ success: true, message: 'Page content cleared' });
});

// Upload files to Supabase Storage
app.post('/api/pages/:name/files', upload.any(), async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found', code: 'NOT_FOUND' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired after 12 hours.',
      code: 'PAGE_EXPIRED'
    });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    }
  }

  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'No files provided for upload.' });
  }

  const uploadedRecords: PageFile[] = [];
  const now = Date.now();

  for (const file of files) {
    const originalName = sanitizeFilename(file.originalname);
    if (!isAllowedFileType(originalName)) {
      continue;
    }

    const fileId = generateUUID();
    const fileExpiresAt = Math.min(now + PAGE_LIFETIME_MS, manifest.expires_at);

    const record = await SupabaseStorage.uploadFile(
      name,
      fileId,
      originalName,
      file.buffer,
      file.mimetype,
      file.size,
      fileExpiresAt
    );

    uploadedRecords.push(record);
  }

  manifest.updated_at = now;
  manifest.version += 1;
  await SupabaseStorage.saveManifest(name, manifest);

  return res.status(201).json({
    success: true,
    files: uploadedRecords,
  });
});

// Download / View file from Supabase Storage
app.get('/api/pages/:name/files/:fileId', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const fileId = getSingleRouteParam(req.params.fileId);
  const downloadMode = req.query.download === 'true';

  const manifest = await SupabaseStorage.getManifest(name);
  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const fileRecord = manifest.files.find(f => f.id === fileId);
  if (!fileRecord) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (Date.now() >= fileRecord.expires_at) {
    return res.status(410).json({
      error: 'This file has expired and is scheduled for permanent deletion.'
    });
  }

  const fileData = await SupabaseStorage.getFile(fileRecord.r2_key);
  if (!fileData) {
    return res.status(404).json({ error: 'File data not found in Supabase storage.' });
  }

  let mimeType = fileRecord.mime_type || fileData.contentType || 'application/octet-stream';
  if (mimeType.includes('html') || fileRecord.name.toLowerCase().endsWith('.html')) {
    mimeType = 'text/plain';
  }

  const encodedFilename = encodeURIComponent(fileRecord.name);
  const disposition = downloadMode
    ? `attachment; filename="${fileRecord.name}"; filename*=UTF-8''${encodedFilename}`
    : `inline; filename="${fileRecord.name}"; filename*=UTF-8''${encodedFilename}`;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');

  return res.send(fileData.buffer);
});

// Delete single file from Supabase
app.delete('/api/pages/:name/files/:fileId', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const fileId = getSingleRouteParam(req.params.fileId);

  const manifest = await SupabaseStorage.getManifest(name);
  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  await SupabaseStorage.deleteFile(name, fileId);

  manifest.files = manifest.files.filter(f => f.id !== fileId);
  manifest.updated_at = Date.now();
  manifest.version += 1;
  await SupabaseStorage.saveManifest(name, manifest);

  return res.json({
    success: true,
    message: 'File deleted successfully from Supabase',
    fileId,
  });
});

// Verify password
app.post('/api/pages/:name/verify-password', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const passwordAttempt = req.body?.password;

  const manifest = await SupabaseStorage.getManifest(name);
  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  if (!manifest.has_password || !manifest.password_hash || !manifest.password_salt) {
    return res.json({ success: true, message: 'Page does not require a password' });
  }

  if (!passwordAttempt) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const isValid = await verifyPassword(passwordAttempt, manifest.password_salt, manifest.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Incorrect password', code: 'INVALID_PASSWORD' });
  }

  const token = await createAuthToken(name, manifest.expires_at, getAuthSecret());
  return res.json({
    success: true,
    token,
    expires_at: manifest.expires_at,
  });
});

// Set / Change / Remove password
app.post('/api/pages/:name/password', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;

  const manifest = await SupabaseStorage.getManifest(name);
  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  if (manifest.has_password) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change password' });
    }
    const isValid = await verifyPassword(currentPassword, manifest.password_salt!, manifest.password_hash!);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }
  }

  if (newPassword && typeof newPassword === 'string' && newPassword.trim().length > 0) {
    manifest.has_password = true;
    manifest.password_salt = generateSalt();
    manifest.password_hash = await hashPassword(newPassword.trim(), manifest.password_salt);
  } else {
    manifest.has_password = false;
    manifest.password_hash = null;
    manifest.password_salt = null;
  }

  manifest.updated_at = Date.now();
  await SupabaseStorage.saveManifest(name, manifest);

  let token: string | undefined = undefined;
  if (manifest.has_password) {
    token = await createAuthToken(name, manifest.expires_at, getAuthSecret());
  }

  return res.json({
    success: true,
    has_password: manifest.has_password,
    token,
  });
});

// Create unique share link
app.post('/api/pages/:name/share', async (req: Request, res: Response) => {
  const name = sanitizePageName(getSingleRouteParam(req.params.name));
  const manifest = await SupabaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({ error: 'Page has expired' });
  }

  const shareId = generateUUID().replace(/-/g, '').slice(0, 10);
  const now = Date.now();

  try {
    const supabase = (await import('./storage/supabase.ts')).getSupabaseAdmin();
    await supabase.from('blinkpad_shares').insert({
      share_id: shareId,
      page_name: name,
      created_at: now,
      expires_at: manifest.expires_at,
    });
  } catch (err) {
    // If table not yet migrated, fall back gracefully
  }

  return res.json({
    success: true,
    share_id: shareId,
    page_name: name,
    expires_at: manifest.expires_at,
  });
});

// Controlled 404 handler for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
  });
});

// Centralized error handling middleware
app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('[BlinkPad API Error]', err?.message || err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// Export the Express application for Vercel's serverless Express runtime.
export default app;

// Local development server & recurring background cleanup
if (!process.env.VERCEL) {
  setInterval(() => {
    SupabaseStorage.runScheduledCleanup().catch(() => {});
  }, 10 * 60 * 1000); // Check every 10 minutes

  app.listen(PORT, () => {
    console.log(`[BlinkPad Backend] API Server listening on http://localhost:${PORT}`);
    console.log(`[BlinkPad Backend] Using Supabase PostgreSQL & Supabase Storage (12h auto-expiry)`);
  });
}
