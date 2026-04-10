ALTER TABLE artists
ADD COLUMN IF NOT EXISTS discogs_source_id TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS real_name TEXT,
ADD COLUMN IF NOT EXISTS socials JSONB,
ADD COLUMN IF NOT EXISTS profile_raw_json JSONB,
ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_artists_discogs_source_id
ON artists (discogs_source_id)
WHERE discogs_source_id IS NOT NULL;
