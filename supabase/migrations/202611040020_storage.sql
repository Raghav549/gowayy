-- Customer/partner-managed image uploads. The Edge gateway validates MIME type,
-- magic bytes and size before writing with the service role; browsers never need
-- a storage write policy or the service key. Public reads match the returned URL.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('gowayy-images', 'gowayy-images', true, 2500000, ARRAY['image/jpeg','image/png','image/webp'])
      ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2500000,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END $$;
