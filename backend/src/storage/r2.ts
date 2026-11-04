import { PageContent, PageManifest } from '../types';

export class R2Storage {
  static getManifestKey(pageName: string): string {
    return `pages/${pageName}/manifest.json`;
  }

  static getContentKey(pageName: string): string {
    return `pages/${pageName}/content.json`;
  }

  static getFileKeyPrefix(pageName: string): string {
    return `pages/${pageName}/files/`;
  }

  static getPagePrefix(pageName: string): string {
    return `pages/${pageName}/`;
  }

  static async getManifest(bucket: R2Bucket, pageName: string): Promise<PageManifest | null> {
    const key = this.getManifestKey(pageName);
    const obj = await bucket.get(key);
    if (!obj) return null;
    const text = await obj.text();
    try {
      return JSON.parse(text) as PageManifest;
    } catch {
      return null;
    }
  }

  static async saveManifest(bucket: R2Bucket, pageName: string, manifest: PageManifest): Promise<void> {
    const key = this.getManifestKey(pageName);
    await bucket.put(key, JSON.stringify(manifest), {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        expires_at: manifest.expires_at.toString(),
        created_at: manifest.created_at.toString(),
      }
    });
  }

  static async getContent(bucket: R2Bucket, pageName: string): Promise<PageContent> {
    const key = this.getContentKey(pageName);
    const obj = await bucket.get(key);
    if (!obj) {
      return { text: '', updated_at: Date.now(), version: 0 };
    }
    const text = await obj.text();
    try {
      return JSON.parse(text) as PageContent;
    } catch {
      return { text: text, updated_at: Date.now(), version: 0 };
    }
  }

  static async saveContent(
    bucket: R2Bucket,
    pageName: string,
    text: string,
    newVersion: number
  ): Promise<PageContent> {
    const key = this.getContentKey(pageName);
    const contentObj: PageContent = {
      text,
      updated_at: Date.now(),
      version: newVersion,
    };
    await bucket.put(key, JSON.stringify(contentObj), {
      httpMetadata: {
        contentType: 'application/json',
      },
    });
    return contentObj;
  }

  static async uploadFile(
    bucket: R2Bucket,
    key: string,
    body: ReadableStream | ArrayBuffer | ArrayBufferView,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    await bucket.put(key, body, {
      httpMetadata: {
        contentType: contentType || 'application/octet-stream',
      },
      customMetadata: metadata,
    });
  }

  static async getFile(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
    return await bucket.get(key);
  }

  static async deleteObject(bucket: R2Bucket, key: string): Promise<void> {
    await bucket.delete(key);
  }

  static async deletePageAllObjects(bucket: R2Bucket, pageName: string): Promise<number> {
    const prefix = this.getPagePrefix(pageName);
    let deletedCount = 0;
    let cursor: string | undefined = undefined;

    do {
      const listed = await bucket.list({
        prefix,
        cursor,
        limit: 500,
      });

      if (listed.objects.length > 0) {
        const keysToDelete = listed.objects.map(obj => obj.key);
        await bucket.delete(keysToDelete);
        deletedCount += keysToDelete.length;
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return deletedCount;
  }
}

