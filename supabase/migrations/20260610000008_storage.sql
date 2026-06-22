-- =============================================================================
-- Migration 0008: Storage Buckets & Policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create buckets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'course-assets',
    'course-assets',
    FALSE,
    52428800,  -- 50 MB per file
    ARRAY[
      'image/png','image/jpeg','image/webp','image/gif',
      'application/pdf',
      'video/mp4','video/webm',
      'text/markdown','text/plain',
      'application/json'
    ]
  ),
  (
    'thumbnails',
    'thumbnails',
    TRUE,   -- public read for course cards
    2097152, -- 2 MB
    ARRAY['image/png','image/jpeg','image/webp']
  ),
  (
    'workbooks',
    'workbooks',
    FALSE,
    10485760, -- 10 MB
    ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS on storage.objects
-- Naming convention: {courseId}/{assetType}/{filename}
-- ---------------------------------------------------------------------------

-- course-assets: owner access via course ownership
CREATE POLICY "course_assets_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'course-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM public.courses
      WHERE owner_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "course_assets_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'course-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM public.courses
      WHERE owner_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "course_assets_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'course-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM public.courses
      WHERE owner_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- thumbnails: public SELECT (bucket is public), owner INSERT/DELETE
CREATE POLICY "thumbnails_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "thumbnails_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM public.courses WHERE owner_id = auth.uid()
    )
  );

-- workbooks: same as course-assets
CREATE POLICY "workbooks_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workbooks'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM public.courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "workbooks_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workbooks'
    AND (storage.foldername(name))[1] IN (
      SELECT id::TEXT FROM public.courses WHERE owner_id = auth.uid()
    )
  );
