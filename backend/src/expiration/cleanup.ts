import { R2Storage } from '../storage/r2';
import { PageManifest } from '../types';

export const PAGE_LIFETIME_MS = 24 * 60 * 60 * 1000; // Strict 24 hours

export function calculatePageExpiresAt(createdAt: number): number {
  return createdAt + PAGE_LIFETIME_MS;
}

export function calculateFileExpiresAt(uploadedAt: number, pageExpiresAt: number): number {
  return Math.min(uploadedAt + PAGE_LIFETIME_MS, pageExpiresAt);
}

export function isPageExpired(manifest: PageManifest | null, now: number = Date.now()): boolean {
  if (!manifest) return true;
  return now >= manifest.expires_at;
}

export async function runScheduledCleanup(bucket: R2Bucket): Promise<{
  expiredPagesProcessed: string[];
  totalObjectsDeleted: number;
}> {
  const now = Date.now();
  const expiredPages: string[] = [];
  let totalObjectsDeleted = 0;

  // Scan manifests in the pages/ directory
  // By convention, all manifests have prefix 'pages/' and key ending in '/manifest.json'
  let cursor: string | undefined = undefined;

  do {
    const listed = await bucket.list({
      prefix: 'pages/',
      cursor,
      limit: 500,
    });

    const manifestObjects = listed.objects.filter(obj => obj.key.endsWith('/manifest.json'));

    for (const obj of manifestObjects) {
      try {
        // Extract pageName from 'pages/{pageName}/manifest.json'
        const parts = obj.key.split('/');
        if (parts.length >= 3) {
          const pageName = parts[1];
          // Check customMetadata if available or read manifest
          let expiresAt: number | null = null;
          if (obj.customMetadata?.expires_at) {
            expiresAt = parseInt(obj.customMetadata.expires_at, 10);
          } else {
            const manifest = await R2Storage.getManifest(bucket, pageName);
            if (manifest) {
              expiresAt = manifest.expires_at;
            }
          }

          if (expiresAt && now >= expiresAt) {
            expiredPages.push(pageName);
            const deleted = await R2Storage.deletePageAllObjects(bucket, pageName);
            totalObjectsDeleted += deleted;
          }
        }
      } catch (err) {
        console.error(`Error processing cleanup for ${obj.key}:`, err);
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return {
    expiredPagesProcessed: expiredPages,
    totalObjectsDeleted,
  };
}

