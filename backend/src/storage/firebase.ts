import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { PageContent, PageFile, PageManifest } from '../types';

let dbInstance: Firestore | null = null;

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance;

  try {
    const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
    const resolvedPath = path.resolve(process.cwd(), credPath);

    let serviceAccount: any;
    // Vercel deployments should provide the complete service-account JSON as a secret env var.
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(resolvedPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } else {
      const altPath = path.resolve(process.cwd(), 'firebase-service-account.json');
      if (fs.existsSync(altPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(altPath, 'utf8'));
      }
    }

    if (serviceAccount?.private_key) {
      serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, '\n');
    }

    if (!serviceAccount) {
      throw new Error(`Firebase service account file not found at: ${resolvedPath}`);
    }

    const app = getApps().length === 0
      ? initializeApp({ credential: cert(serviceAccount) })
      : getApps()[0];

    dbInstance = getFirestore(app);
    return dbInstance;
  } catch (err: any) {
    console.error('Failed to initialize Firebase Firestore:', err.message);
    throw err;
  }
}

const COLLECTION_NAME = 'blinkpad_pages';

/** Human-readable companion value for Firebase Console. Numeric milliseconds stay authoritative. */
function formatIstTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(new Date(timestamp));
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  return `${values.day} ${values.month} ${values.year}, ${values.hour}:${values.minute}:${values.second} ${(values.dayPeriod || '').toUpperCase()}`.trim();
}

const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.VERCEL ? path.join('/tmp', 'blinkpad-uploads') : path.resolve(process.cwd(), 'uploads'));

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class FirebaseStorage {
  static async getManifest(pageName: string): Promise<PageManifest | null> {
    try {
      const db = getFirebaseDb();
      const docRef = db.collection(COLLECTION_NAME).doc(pageName.toLowerCase());
      const snap = await docRef.get();
      if (!snap.exists) return null;

      const data = snap.data();
      if (!data) return null;

      return {
        id: data.id || ('page_' + pageName.toLowerCase()),
        name: data.name || pageName.toLowerCase(),
        created_at: Number(data.created_at) || Date.now(),
        expires_at: Number(data.expires_at) || (Date.now() + 24 * 60 * 60 * 1000),
        updated_at: Number(data.updated_at) || Date.now(),
        version: Number(data.version) || 1,
        has_password: Boolean(data.has_password),
        password_hash: data.password_hash || null,
        password_salt: data.password_salt || null,
        files: Array.isArray(data.files) ? (data.files as PageFile[]) : [],
      };
    } catch (err: any) {
      console.error(`Firebase error getting manifest for ${pageName}:`, err.message);
      return null;
    }
  }

  static async saveManifest(pageName: string, manifest: PageManifest): Promise<void> {
    const db = getFirebaseDb();
    const docRef = db.collection(COLLECTION_NAME).doc(pageName.toLowerCase());
    await docRef.set(
      {
        id: manifest.id,
        name: manifest.name,
        created_at: manifest.created_at,
        expires_at: manifest.expires_at,
        updated_at: manifest.updated_at,
        created_at_ist: formatIstTimestamp(manifest.created_at),
        expires_at_ist: formatIstTimestamp(manifest.expires_at),
        updated_at_ist: formatIstTimestamp(manifest.updated_at),
        version: manifest.version,
        has_password: manifest.has_password,
        password_hash: manifest.password_hash,
        password_salt: manifest.password_salt,
        files: manifest.files.map((file) => ({
          ...file,
          uploaded_at_ist: formatIstTimestamp(file.uploaded_at),
          expires_at_ist: formatIstTimestamp(file.expires_at),
        })),
      },
      { merge: true }
    );
  }

  static async getContent(pageName: string): Promise<PageContent> {
    try {
      const db = getFirebaseDb();
      const docRef = db.collection(COLLECTION_NAME).doc(pageName.toLowerCase());
      const snap = await docRef.get();
      if (!snap.exists) {
        return { text: '', updated_at: Date.now(), version: 0 };
      }

      const data = snap.data();
      return {
        text: typeof data?.content === 'string' ? data.content : '',
        updated_at: Number(data?.content_updated_at || data?.updated_at) || Date.now(),
        version: Number(data?.version) || 1,
      };
    } catch (err: any) {
      console.error(`Firebase error getting content for ${pageName}:`, err.message);
      return { text: '', updated_at: Date.now(), version: 0 };
    }
  }

  static async saveContent(
    pageName: string,
    text: string,
    newVersion: number
  ): Promise<PageContent> {
    const db = getFirebaseDb();
    const docRef = db.collection(COLLECTION_NAME).doc(pageName.toLowerCase());
    const now = Date.now();

    await docRef.set(
      {
        content: text,
        content_updated_at: now,
        content_updated_at_ist: formatIstTimestamp(now),
        updated_at: now,
        updated_at_ist: formatIstTimestamp(now),
        version: newVersion,
      },
      { merge: true }
    );

    return {
      text,
      updated_at: now,
      version: newVersion,
    };
  }

  static async deletePageAllObjects(pageName: string): Promise<number> {
    const db = getFirebaseDb();
    const docRef = db.collection(COLLECTION_NAME).doc(pageName.toLowerCase());
    const snap = await docRef.get();

    let count = 0;
    if (snap.exists) {
      const data = snap.data();
      const files: PageFile[] = Array.isArray(data?.files) ? data.files : [];

      for (const file of files) {
        if (file.r2_key) {
          await this.deleteObject(file.r2_key);
          count++;
        }
      }

      await docRef.delete();
      count++;
    }

    return count;
  }

  static async uploadFile(
    key: string,
    body: Buffer | ArrayBuffer | ReadableStream,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const safeKey = key.replace(/[/\\]/g, '_');
    const filePath = path.join(UPLOADS_DIR, safeKey);
    const metaPath = filePath + '.meta.json';

    let buffer: Buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (body instanceof ArrayBuffer) {
      buffer = Buffer.from(body);
    } else {
      // ReadableStream to Buffer
      const chunks: any[] = [];
      const reader = (body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    }

    await fs.promises.writeFile(filePath, buffer);
    await fs.promises.writeFile(
      metaPath,
      JSON.stringify({ contentType: contentType || 'application/octet-stream', ...metadata }),
      'utf8'
    );
  }

  static async getFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const safeKey = key.replace(/[/\\]/g, '_');
    const filePath = path.join(UPLOADS_DIR, safeKey);
    const metaPath = filePath + '.meta.json';

    if (!fs.existsSync(filePath)) return null;

    const buffer = await fs.promises.readFile(filePath);
    let contentType = 'application/octet-stream';
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        if (meta.contentType) contentType = meta.contentType;
      } catch {}
    }

    return { buffer, contentType };
  }

  static async deleteObject(key: string): Promise<void> {
    const safeKey = key.replace(/[/\\]/g, '_');
    const filePath = path.join(UPLOADS_DIR, safeKey);
    const metaPath = filePath + '.meta.json';

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    if (fs.existsSync(metaPath)) {
      await fs.promises.unlink(metaPath).catch(() => {});
    }
  }

  static async runScheduledCleanup(): Promise<{ pagesDeleted: number; filesDeleted: number }> {
    try {
      const db = getFirebaseDb();
      const now = Date.now();
      const snapshot = await db.collection(COLLECTION_NAME).where('expires_at', '<=', now).get();

      let pagesDeleted = 0;
      let filesDeleted = 0;

      for (const doc of snapshot.docs) {
        const pageName = doc.id;
        const count = await this.deletePageAllObjects(pageName);
        pagesDeleted++;
        filesDeleted += Math.max(0, count - 1);
      }

      return { pagesDeleted, filesDeleted };
    } catch (err: any) {
      console.error('Firebase cleanup error:', err.message);
      return { pagesDeleted: 0, filesDeleted: 0 };
    }
  }
}

