import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

/**
 * Durable object storage for BlinkPad uploads.
 * File bytes live in Firebase Cloud Storage; page metadata stays in Firestore.
 */
function getBucket() {
  const app = getApps()[0];
  if (!app) throw new Error('Firebase Admin is not initialized before file storage access.');

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || app.options.storageBucket;
  if (!bucketName) {
    throw new Error('FIREBASE_STORAGE_BUCKET is missing. Set it to the exact bucket name shown in Firebase Console > Storage.');
  }
  return getStorage(app).bucket(bucketName);
}

export class FirebaseFileStorage {
  static async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const file = getBucket().file(key);
    await file.save(body, {
      resumable: false,
      metadata: {
        contentType: contentType || 'application/octet-stream',
        cacheControl: 'private, max-age=3600',
        metadata: metadata || {},
      },
      validation: 'crc32c',
    });
  }

  static async getFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const file = getBucket().file(key);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return {
      buffer,
      contentType: metadata.contentType || 'application/octet-stream',
    };
  }

  static async deleteObject(key: string): Promise<void> {
    await getBucket().file(key).delete({ ignoreNotFound: true });
  }
}
