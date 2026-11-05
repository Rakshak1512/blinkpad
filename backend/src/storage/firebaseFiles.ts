import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client: S3Client | null = null;

function getConfig() {
  const accountId = process.env.B2_KEY_ID ? undefined : undefined;
  const endpoint = process.env.B2_ENDPOINT;
  const bucket = process.env.B2_BUCKET_NAME;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Backblaze B2 is not configured. Set B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID and B2_APPLICATION_KEY in the backend environment.');
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function getClient(): S3Client {
  if (client) return client;
  const config = getConfig();
  client = new S3Client({
    region: process.env.B2_REGION || 'us-east-005',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

/**
 * Backblaze B2 S3-compatible object storage for BlinkPad attachments.
 * Firestore page content and metadata remain in Firebase.
 */
export class FirebaseFileStorage {
  static async createSignedUploadUrl(key: string, contentType: string): Promise<string> {
    const { bucket } = getConfig();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'private, max-age=3600',
    });
    return getSignedUrl(getClient(), command, { expiresIn: 15 * 60 });
  }

  static async getObjectMetadata(key: string): Promise<{ size: number; contentType: string } | null> {
    const { bucket } = getConfig();
    try {
      const result = await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        size: Number(result.ContentLength || 0),
        contentType: result.ContentType || 'application/octet-stream',
      };
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return null;
      throw error;
    }
  }

  static async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const { bucket } = getConfig();
    await getClient().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'private, max-age=3600',
      Metadata: metadata || {},
    }));
  }

  static async getFile(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const { bucket } = getConfig();
    try {
      const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: result.ContentType || 'application/octet-stream',
      };
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey' || error?.name === 'NotFound') return null;
      throw error;
    }
  }

  static async deleteObject(key: string): Promise<void> {
    const { bucket } = getConfig();
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
