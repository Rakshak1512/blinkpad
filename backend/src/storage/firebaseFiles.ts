import { getStorage } from 'firebase-admin/storage';
import { getFirebaseDb } from './firebase.ts';

/**
 * Durable object storage for BlinkPad uploads.
 * Files are stored in Firebase Cloud Storage; metadata remains in Firestore.
 */
function getBucket() {
  const db = getFirebaseDb();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET ||
    (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : undefined);
  return getStorage(db.app).bucket(bucketName);
}

function safeObjectName(key: string): string {
  return key.split('/').map(part => encodeURIComponent(part)).join('/');
}

export class FirebaseFileStorage {
  static async uploadFile(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = getBucket().file(safeObjectName(key));
    await file.save(body, {
      resumable: false,
      metadata: {
        contentType: contentType || 'application/octet-stream',
        cacheControl: 'private, max-age=3600',
      },
      validation: 'crc32c',
    });
  }

  static async getFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const file = getBucket().file(safeObjectName(key));
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return { buffer, contentType: metadata.contentType || 'application/octet-stream' };
  }

  static async deleteObject(key: string): Promise<void> {
    await getBucket().file(safeObjectName(key)).delete({ ignoreNotFound: true });
  }
}
