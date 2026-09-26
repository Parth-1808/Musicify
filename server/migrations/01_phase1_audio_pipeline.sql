-- Phase 1 Migration: Support audio pipeline metadata, deduplication, and platform delivery
-- Run this in your Supabase project's SQL Editor (optional but recommended for cloud sync).

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_codec TEXT,
  ADD COLUMN IF NOT EXISTS source_bitrate_kbps INT,
  ADD COLUMN IF NOT EXISTS sample_rate INT,
  ADD COLUMN IF NOT EXISTS channels INT,
  ADD COLUMN IF NOT EXISTS audio_url_opus TEXT,
  ADD COLUMN IF NOT EXISTS audio_url_aac TEXT,
  ADD COLUMN IF NOT EXISTS audio_version INT DEFAULT 2;

-- Index content_hash for fast O(1) deduplication queries
CREATE INDEX IF NOT EXISTS idx_songs_content_hash ON public.songs(content_hash);
