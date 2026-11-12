import { PageManifest } from '../types.ts';
import { SupabaseStorage } from '../storage/supabase.ts';

export const PAGE_LIFETIME_MS = 12 * 60 * 60 * 1000; // Strict 12 hours

export function calculatePageExpiresAt(createdAt: number): number {
  return createdAt + PAGE_LIFETIME_MS;
}

export function calculateFileExpiresAt(uploadedAt: number, pageExpiresAt: number): number {
  return Math.min(uploadedAt + PAGE_LIFETIME_MS, pageExpiresAt);
}

export function isPageExpired(manifest: { expires_at: number } | null, now: number = Date.now()): boolean {
  if (!manifest) return true;
  return now >= manifest.expires_at;
}

export async function runScheduledCleanup() {
  return await SupabaseStorage.runScheduledCleanup();
}
