import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { FirebaseStorage } from './storage/firebase';
import {
  generateSalt,
  generateUUID,
  hashPassword,
  verifyPassword,
  createAuthToken,
  verifyAuthToken
} from './services/cryptoService';
import {
  isValidPageName,
  sanitizeFilename,
  sanitizePageName,
  isAllowedFileType,
  MAX_FILE_SIZE_BYTES
} from './utils/validator';
import { PageFile, PageManifest, PublicPageManifest } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const AUTH_SECRET = process.env.AUTH_SECRET || (process.env.VERCEL ? '' : 'quickpad-local-development-secret-key-123456');
if (AUTH_SECRET.length < 32) {
  throw new Error('AUTH_SECRET must be configured with at least 32 characters before starting BlinkPad.');
}
const PAGE_LIFETIME_MS = 24 * 60 * 60 * 1000; // Strict 24 hours

/**
 * Formats a Unix millisecond timestamp into:
 * `D Month YYYY, hh:mm:ss AM/PM` (e.g. `4 November 2026, 11:53:47 PM`)
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer memory storage for uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
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
  return await verifyAuthToken(token, manifest.name, AUTH_SECRET);
}

// Health check
app.get(['/health', '/api/health'], async (_req: Request, res: Response) => {
  const now = Date.now();
  res.json({
    status: 'ok',
    app: process.env.APP_NAME || 'BlinkPad',
    database: 'Firebase Firestore',
    projectId: process.env.FIREBASE_PROJECT_ID || 'blinkpad-7db1e',
    backend_url: process.env.BACKEND_URL || `http://localhost:${PORT}`,
    time: now,
    time_formatted: formatBlinkpadDate(now),
    timezone: 'Asia/Kolkata (IST)',
  });
});

// Admin manual cleanup
app.post('/api/admin/cleanup', async (_req: Request, res: Response) => {
  const result = await FirebaseStorage.runScheduledCleanup();
  res.json({ success: true, ...result });
});

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
  const existing = await FirebaseStorage.getManifest(name);

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
    await FirebaseStorage.deletePageAllObjects(name);
  }

  const now = Date.now();
  const expiresAt = now + PAGE_LIFETIME_MS;
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

  await FirebaseStorage.saveManifest(name, manifest);
  await FirebaseStorage.saveContent(name, '', 1);

  let token: string | undefined = undefined;
  if (hasPassword) {
    token = await createAuthToken(name, expiresAt, AUTH_SECRET);
  }

  return res.status(201).json({
    success: true,
    page: toPublicManifest(manifest),
    token,
  });
});

// Get page
app.get('/api/pages/:name', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const manifest = await FirebaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found', code: 'NOT_FOUND' });
  }

  if (Date.now() >= manifest.expires_at) {
    FirebaseStorage.deletePageAllObjects(name).catch(() => {});
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.',
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

  const content = await FirebaseStorage.getContent(name);
  return res.json({
    page: toPublicManifest(manifest),
    content: content.text,
    server_time: Date.now(),
  });
});

// Get page status
app.get('/api/pages/:name/status', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const manifest = await FirebaseStorage.getManifest(name);

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
  const name = sanitizePageName(req.params.name);
  const manifest = await FirebaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found' });
  }

  if (manifest.has_password) {
    const authorized = await isAuthorized(req, manifest);
    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const count = await FirebaseStorage.deletePageAllObjects(name);
  return res.json({
    success: true,
    message: `Page "${name}" and all ${count} objects permanently deleted.`
  });
});

// Save content (text)
app.put('/api/pages/:name/content', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const manifest = await FirebaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found', code: 'NOT_FOUND' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.',
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
  const now = Date.now();

  const savedContent = await FirebaseStorage.saveContent(name, text, newVersion);

  manifest.version = newVersion;
  manifest.updated_at = now;
  await FirebaseStorage.saveManifest(name, manifest);

  return res.json({
    success: true,
    version: newVersion,
    updated_at: savedContent.updated_at,
  });
});

// Clear content
app.delete('/api/pages/:name/content', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const manifest = await FirebaseStorage.getManifest(name);

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
  await FirebaseStorage.saveContent(name, '', newVersion);

  manifest.version = newVersion;
  manifest.updated_at = Date.now();
  await FirebaseStorage.saveManifest(name, manifest);

  return res.json({ success: true, message: 'Page content cleared' });
});

// Upload files
app.post('/api/pages/:name/files', upload.any(), async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const manifest = await FirebaseStorage.getManifest(name);

  if (!manifest) {
    return res.status(404).json({ error: 'Page not found', code: 'NOT_FOUND' });
  }

  if (Date.now() >= manifest.expires_at) {
    return res.status(410).json({
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.',
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
    const storageKey = `pages/${name}/files/${fileId}_${originalName}`;
    const fileExpiresAt = Math.min(now + PAGE_LIFETIME_MS, manifest.expires_at);

    await FirebaseStorage.uploadFile(storageKey, file.buffer, file.mimetype, {
      file_id: fileId,
      original_name: originalName,
      uploaded_at: now.toString(),
      expires_at: fileExpiresAt.toString(),
    });

    const fileRecord: PageFile = {
      id: fileId,
      name: originalName,
      mime_type: file.mimetype || 'application/octet-stream',
      size: file.size,
      uploaded_at: now,
      expires_at: fileExpiresAt,
      r2_key: storageKey,
    };

    manifest.files.push(fileRecord);
    uploadedRecords.push(fileRecord);
  }

  manifest.updated_at = now;
  manifest.version += 1;
  await FirebaseStorage.saveManifest(name, manifest);

  return res.status(201).json({
    success: true,
    files: uploadedRecords,
  });
});

// Download / View file
app.get('/api/pages/:name/files/:fileId', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const fileId = req.params.fileId;
  const downloadMode = req.query.download === 'true';

  const manifest = await FirebaseStorage.getManifest(name);
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
      error: 'This BlinkPad page has expired and its data is scheduled for permanent deletion.'
    });
  }

  const fileData = await FirebaseStorage.getFile(fileRecord.r2_key);
  if (!fileData) {
    return res.status(404).json({ error: 'File data not found in storage.' });
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

// Delete single file
app.delete('/api/pages/:name/files/:fileId', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const fileId = req.params.fileId;

  const manifest = await FirebaseStorage.getManifest(name);
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

  const fileIndex = manifest.files.findIndex(f => f.id === fileId);
  if (fileIndex === -1) {
    return res.status(404).json({ error: 'File not found' });
  }

  const fileRecord = manifest.files[fileIndex];
  await FirebaseStorage.deleteObject(fileRecord.r2_key);

  manifest.files.splice(fileIndex, 1);
  manifest.updated_at = Date.now();
  manifest.version += 1;
  await FirebaseStorage.saveManifest(name, manifest);

  return res.json({
    success: true,
    message: 'File deleted successfully',
    fileId,
  });
});

// Verify password (Unlimited attempts, NO locks, NO rate limits, NO CAPTCHAs)
app.post('/api/pages/:name/verify-password', async (req: Request, res: Response) => {
  const name = sanitizePageName(req.params.name);
  const passwordAttempt = req.body?.password;

  const manifest = await FirebaseStorage.getManifest(name);
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

  const token = await createAuthToken(name, manifest.expires_at, AUTH_SECRET);
  return res.json({
    success: true,
    token,
    expires_at: manifest.expires_at,
  });
});

// Export the Express application for Vercel's serverless Express runtime.
export default app;

// Local development only: Vercel invokes the exported app and does not keep
// a long-running process or setInterval alive between requests.
if (!process.env.VERCEL) {
  setInterval(() => {
    FirebaseStorage.runScheduledCleanup().catch(() => {});
  }, 15 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`[BlinkPad Backend] API Server listening on http://localhost:${PORT}`);
    console.log(`[BlinkPad Backend] Connected to Firebase Firestore Database: ${process.env.FIREBASE_PROJECT_ID || 'blinkpad-7db1e'}`);
  });
}

