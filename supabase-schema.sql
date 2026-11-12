-- ==============================================================================
-- BLINKPAD SUPABASE POSTGRESQL SCHEMA & 12-HOUR AUTOMATIC EXPIRATION SETUP
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- 2. BlinkPad Pages Table
CREATE TABLE IF NOT EXISTS public.blinkpad_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    content TEXT DEFAULT '',
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    version INTEGER DEFAULT 1,
    has_password BOOLEAN DEFAULT false,
    password_hash TEXT,
    password_salt TEXT
);

-- Indexes for lightning-fast queries and auto-expiry lookup
CREATE INDEX IF NOT EXISTS idx_blinkpad_pages_name ON public.blinkpad_pages (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_blinkpad_pages_expires_at ON public.blinkpad_pages (expires_at);

-- 3. BlinkPad Files Table
CREATE TABLE IF NOT EXISTS public.blinkpad_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_name TEXT NOT NULL REFERENCES public.blinkpad_pages(name) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size BIGINT NOT NULL DEFAULT 0,
    uploaded_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
);

-- Indexes for file retrieval and file auto-expiry
CREATE INDEX IF NOT EXISTS idx_blinkpad_files_page_name ON public.blinkpad_files (LOWER(page_name));
CREATE INDEX IF NOT EXISTS idx_blinkpad_files_expires_at ON public.blinkpad_files (expires_at);
CREATE INDEX IF NOT EXISTS idx_blinkpad_files_storage_path ON public.blinkpad_files (storage_path);

-- 4. BlinkPad Shared Links Table
CREATE TABLE IF NOT EXISTS public.blinkpad_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id TEXT UNIQUE NOT NULL,
    page_name TEXT NOT NULL REFERENCES public.blinkpad_pages(name) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    views_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_blinkpad_shares_share_id ON public.blinkpad_shares (share_id);
CREATE INDEX IF NOT EXISTS idx_blinkpad_shares_expires_at ON public.blinkpad_shares (expires_at);

-- 5. Create Storage Bucket for BlinkPad Files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('blinkpad-files', 'blinkpad-files', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.blinkpad_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blinkpad_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blinkpad_shares ENABLE ROW LEVEL SECURITY;

-- Allow full access to service_role (used by BlinkPad backend API)
DROP POLICY IF EXISTS "Service Role full access on pages" ON public.blinkpad_pages;
CREATE POLICY "Service Role full access on pages" ON public.blinkpad_pages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service Role full access on files" ON public.blinkpad_files;
CREATE POLICY "Service Role full access on files" ON public.blinkpad_files
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service Role full access on shares" ON public.blinkpad_shares;
CREATE POLICY "Service Role full access on shares" ON public.blinkpad_shares
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage bucket RLS policies
DROP POLICY IF EXISTS "Service Role storage access" ON storage.objects;
CREATE POLICY "Service Role storage access" ON storage.objects
    FOR ALL TO service_role USING (bucket_id = 'blinkpad-files') WITH CHECK (bucket_id = 'blinkpad-files');

-- Public anon read access to non-expired, unpassworded pages if queried directly
DROP POLICY IF EXISTS "Anon read non-expired public pages" ON public.blinkpad_pages;
CREATE POLICY "Anon read non-expired public pages" ON public.blinkpad_pages
    FOR SELECT TO anon
    USING (has_password = false AND expires_at > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT);

-- 7. Automatic 12-Hour Cleanup Stored Function
CREATE OR REPLACE FUNCTION public.cleanup_expired_blinkpad_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    now_ms BIGINT;
    deleted_files_count INT := 0;
    deleted_pages_count INT := 0;
    expired_storage_paths TEXT[];
BEGIN
    now_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

    -- Collect storage paths of expired files to delete physical objects
    SELECT ARRAY_AGG(storage_path) INTO expired_storage_paths
    FROM public.blinkpad_files
    WHERE expires_at <= now_ms;

    -- Delete objects from Supabase storage
    IF expired_storage_paths IS NOT NULL AND array_length(expired_storage_paths, 1) > 0 THEN
        DELETE FROM storage.objects
        WHERE bucket_id = 'blinkpad-files'
          AND name = ANY(expired_storage_paths);
        deleted_files_count := array_length(expired_storage_paths, 1);
    END IF;

    -- Delete expired files metadata
    DELETE FROM public.blinkpad_files WHERE expires_at <= now_ms;

    -- Delete expired shares
    DELETE FROM public.blinkpad_shares WHERE expires_at <= now_ms;

    -- Delete expired pages (and cascaded data)
    WITH deleted_pages AS (
        DELETE FROM public.blinkpad_pages
        WHERE expires_at <= now_ms
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_pages_count FROM deleted_pages;

    RETURN jsonb_build_object(
        'success', true,
        'cleaned_at', now_ms,
        'deleted_files', deleted_files_count,
        'deleted_pages', deleted_pages_count
    );
END;
$$;

-- 8. Schedule pg_cron Job (Runs automatically every 10 minutes)
-- Unschedules previous job if exists to prevent duplicates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'blinkpad-auto-cleanup-12h') THEN
        PERFORM cron.unschedule('blinkpad-auto-cleanup-12h');
    END IF;
END $$;

SELECT cron.schedule(
    'blinkpad-auto-cleanup-12h',
    '*/10 * * * *',
    'SELECT public.cleanup_expired_blinkpad_data();'
);
