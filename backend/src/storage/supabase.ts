import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PageContent, PageFile, PageManifest } from '../types.ts';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Lazy initialization of the Supabase Admin client with the Service Role key.
 * Never exposes the service-role key to frontend code.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required on the backend.');
  }

  supabaseInstance = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseInstance;
}

export const STORAGE_BUCKET = 'blinkpad-files';
export const PAGES_TABLE = 'blinkpad_pages';
export const FILES_TABLE = 'blinkpad_files';
export const SHARES_TABLE = 'blinkpad_shares';

export class SupabaseStorage {
  /**
   * Retrieves the page manifest from Supabase PostgreSQL.
   */
  static async getManifest(pageName: string): Promise<PageManifest | null> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();

    const { data: page, error } = await supabase
      .from(PAGES_TABLE)
      .select('*')
      .eq('name', cleanName)
      .maybeSingle();

    if (error) {
      console.error(`[Supabase] Error getting manifest for ${cleanName}:`, error.message);
      throw error;
    }

    if (!page) return null;

    // Fetch active non-expired files for this page
    const { data: filesData, error: filesError } = await supabase
      .from(FILES_TABLE)
      .select('*')
      .eq('page_name', cleanName)
      .gt('expires_at', Date.now());

    if (filesError) {
      console.error(`[Supabase] Error getting files for ${cleanName}:`, filesError.message);
    }

    const files: PageFile[] = (filesData || []).map((f) => ({
      id: f.id,
      name: f.name,
      mime_type: f.mime_type,
      size: Number(f.size),
      uploaded_at: Number(f.uploaded_at),
      expires_at: Number(f.expires_at),
      r2_key: f.storage_path, // Map to existing r2_key/storage_path field for compatibility
    }));

    return {
      id: page.id,
      name: page.name,
      created_at: Number(page.created_at),
      expires_at: Number(page.expires_at),
      updated_at: Number(page.updated_at),
      version: Number(page.version || 1),
      has_password: Boolean(page.has_password),
      password_hash: page.password_hash || null,
      password_salt: page.password_salt || null,
      files,
    };
  }

  /**
   * Saves or updates a page manifest in Supabase PostgreSQL.
   */
  static async saveManifest(pageName: string, manifest: PageManifest): Promise<void> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();

    const { error } = await supabase
      .from(PAGES_TABLE)
      .upsert(
        {
          name: cleanName,
          created_at: manifest.created_at,
          expires_at: manifest.expires_at,
          updated_at: manifest.updated_at,
          version: manifest.version,
          has_password: manifest.has_password,
          password_hash: manifest.password_hash,
          password_salt: manifest.password_salt,
        },
        { onConflict: 'name' }
      );

    if (error) {
      console.error(`[Supabase] Error saving manifest for ${cleanName}:`, error.message);
      throw error;
    }
  }

  /**
   * Retrieves text content for a page.
   */
  static async getContent(pageName: string): Promise<PageContent> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();

    const { data, error } = await supabase
      .from(PAGES_TABLE)
      .select('content, updated_at, version')
      .eq('name', cleanName)
      .maybeSingle();

    if (error) {
      console.error(`[Supabase] Error getting content for ${cleanName}:`, error.message);
      throw error;
    }

    if (!data) {
      return { text: '', updated_at: Date.now(), version: 1 };
    }

    return {
      text: data.content || '',
      updated_at: Number(data.updated_at || Date.now()),
      version: Number(data.version || 1),
    };
  }

  /**
   * Updates text content with concurrency tracking.
   */
  static async saveContent(pageName: string, text: string, version: number): Promise<PageContent> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();
    const now = Date.now();

    const { error } = await supabase
      .from(PAGES_TABLE)
      .update({
        content: text,
        version,
        updated_at: now,
      })
      .eq('name', cleanName);

    if (error) {
      console.error(`[Supabase] Error saving content for ${cleanName}:`, error.message);
      throw error;
    }

    return {
      text,
      updated_at: now,
      version,
    };
  }

  /**
   * Uploads a file to Supabase Storage and records metadata in PostgreSQL.
   */
  static async uploadFile(
    pageName: string,
    fileId: string,
    originalName: string,
    buffer: Buffer,
    mimeType: string,
    size: number,
    expiresAt: number
  ): Promise<PageFile> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();
    const storagePath = `${cleanName}/${fileId}_${originalName}`;
    const now = Date.now();

    // 1. Upload to Supabase Storage bucket
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[Supabase Storage] Error uploading ${storagePath}:`, uploadError.message);
      throw uploadError;
    }

    // 2. Insert metadata into blinkpad_files table
    const { error: dbError } = await supabase.from(FILES_TABLE).insert({
      id: fileId,
      page_name: cleanName,
      name: originalName,
      storage_path: storagePath,
      mime_type: mimeType || 'application/octet-stream',
      size,
      uploaded_at: now,
      expires_at: expiresAt,
    });

    if (dbError) {
      console.error(`[Supabase] Error inserting file record:`, dbError.message);
      // Clean up orphaned storage object
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw dbError;
    }

    return {
      id: fileId,
      name: originalName,
      mime_type: mimeType || 'application/octet-stream',
      size,
      uploaded_at: now,
      expires_at: expiresAt,
      r2_key: storagePath,
    };
  }

  /**
   * Downloads a file from Supabase Storage.
   */
  static async getFile(storagePath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);

    if (error || !data) {
      console.error(`[Supabase Storage] Download error for ${storagePath}:`, error?.message);
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: data.type || 'application/octet-stream',
    };
  }

  /**
   * Generates a signed download URL for direct browser access.
   */
  static async createSignedDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data?.signedUrl) {
      console.error(`[Supabase Storage] Failed to generate signed URL:`, error?.message);
      return null;
    }

    return data.signedUrl;
  }

  /**
   * Deletes a single file from Supabase Storage and PostgreSQL.
   */
  static async deleteFile(pageName: string, fileId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();

    // 1. Get file record to find storage_path
    const { data: fileRecord } = await supabase
      .from(FILES_TABLE)
      .select('storage_path')
      .eq('id', fileId)
      .eq('page_name', cleanName)
      .maybeSingle();

    if (fileRecord?.storage_path) {
      await supabase.storage.from(STORAGE_BUCKET).remove([fileRecord.storage_path]);
    }

    // 2. Delete database record
    const { error } = await supabase
      .from(FILES_TABLE)
      .delete()
      .eq('id', fileId)
      .eq('page_name', cleanName);

    return !error;
  }

  /**
   * Permanently deletes a page and all its uploaded files from storage & database.
   */
  static async deletePageAllObjects(pageName: string): Promise<number> {
    const supabase = getSupabaseAdmin();
    const cleanName = pageName.toLowerCase().trim();

    // 1. Retrieve all file storage paths for this page
    const { data: files } = await supabase
      .from(FILES_TABLE)
      .select('storage_path')
      .eq('page_name', cleanName);

    let deletedFilesCount = 0;
    if (files && files.length > 0) {
      const paths = files.map((f) => f.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      }
      deletedFilesCount = files.length;
    }

    // 2. Delete page row (Foreign key CASCADE automatically removes files & shares rows)
    await supabase.from(PAGES_TABLE).delete().eq('name', cleanName);

    return deletedFilesCount + 1;
  }

  /**
   * Automated 12-hour expiration cleanup:
   * Removes expired files from Supabase Storage and deletes expired records from database.
   */
  static async runScheduledCleanup(): Promise<{
    success: boolean;
    deletedFiles: number;
    deletedPages: number;
    cleanedAt: number;
  }> {
    const supabase = getSupabaseAdmin();
    const now = Date.now();

    // Try executing the database stored function if available
    try {
      const { data, error } = await supabase.rpc('cleanup_expired_blinkpad_data');
      if (!error && data) {
        return {
          success: true,
          deletedFiles: Number(data.deleted_files || 0),
          deletedPages: Number(data.deleted_pages || 0),
          cleanedAt: now,
        };
      }
    } catch {
      // Fallback to application-level cleanup if stored procedure is not yet created
    }

    // Application-level cleanup fallback:
    // 1. Find expired files
    const { data: expiredFiles } = await supabase
      .from(FILES_TABLE)
      .select('id, storage_path')
      .lte('expires_at', now);

    let deletedFiles = 0;
    if (expiredFiles && expiredFiles.length > 0) {
      const paths = expiredFiles.map((f) => f.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      }
      await supabase.from(FILES_TABLE).delete().lte('expires_at', now);
      deletedFiles = expiredFiles.length;
    }

    // 2. Find and delete expired pages
    const { data: expiredPages } = await supabase
      .from(PAGES_TABLE)
      .select('name')
      .lte('expires_at', now);

    let deletedPages = 0;
    if (expiredPages && expiredPages.length > 0) {
      const names = expiredPages.map((p) => p.name);
      await supabase.from(PAGES_TABLE).delete().in('name', names);
      deletedPages = expiredPages.length;
    }

    // 3. Delete expired share links
    await supabase.from(SHARES_TABLE).delete().lte('expires_at', now);

    return {
      success: true,
      deletedFiles,
      deletedPages,
      cleanedAt: now,
    };
  }
}
