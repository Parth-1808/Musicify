-- ============================================================================
-- Phase 2 Migration: Loudness Analysis & Integrity Columns
-- EBU R128 Loudness Normalization metadata & unique content hash deduplication
-- ============================================================================

-- 1. Add loudness measurement and audio source metadata columns to songs table
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS integrated_lufs REAL,
  ADD COLUMN IF NOT EXISTS true_peak_dbtp REAL,
  ADD COLUMN IF NOT EXISTS loudness_range REAL,
  ADD COLUMN IF NOT EXISTS source_codec TEXT,
  ADD COLUMN IF NOT EXISTS source_bitrate_kbps INT,
  ADD COLUMN IF NOT EXISTS sample_rate INT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS audio_version INT DEFAULT 2;

-- 2. Add Unique Constraint on content_hash
-- Uses a DO block to prevent errors if the constraint already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'songs_content_hash_unique'
    ) THEN
        -- Only create UNIQUE constraint if no duplicate non-null content_hashes exist
        IF NOT EXISTS (
            SELECT content_hash 
            FROM public.songs 
            WHERE content_hash IS NOT NULL 
            GROUP BY content_hash 
            HAVING COUNT(*) > 1
        ) THEN
            ALTER TABLE public.songs ADD CONSTRAINT songs_content_hash_unique UNIQUE (content_hash);
        ELSE
            CREATE INDEX IF NOT EXISTS idx_songs_content_hash ON public.songs(content_hash);
        END IF;
    END IF;
END $$;

-- 3. Comment explaining columns for documentation
COMMENT ON COLUMN public.songs.integrated_lufs IS 'Integrated loudness in LUFS measured via EBU R128 (loudnorm)';
COMMENT ON COLUMN public.songs.true_peak_dbtp IS 'Maximum true peak level in dBTP (true peak decibels)';
COMMENT ON COLUMN public.songs.loudness_range IS 'Loudness Range (LRA) in LU';
COMMENT ON COLUMN public.songs.content_hash IS 'SHA-256 hash of the audio stream for bit-level deduplication';
COMMENT ON COLUMN public.songs.audio_version IS 'Audio pipeline version (v2 = zero-loss remux + loudness analysis)';
