-- ============================================================================
-- MUSIFY COMPLETE ALL-IN-ONE PRODUCTION DATABASE & STORAGE SCHEMA
-- Run this ENTIRE script in your Supabase project's SQL Editor (SQL tab).
-- It sets up all tables, triggers, RPC functions, RLS policies, and storage.
-- ZERO MOCK DATA - 100% REAL LIVE USER DATA & METRICS
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. User Profiles Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 3. Songs Table (High-Fidelity Audio Tracks)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.songs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Unknown Artist',
    album TEXT DEFAULT 'Musify',
    duration INT DEFAULT 0, -- in seconds
    audio_url TEXT NOT NULL, -- Public CDN / streaming URL
    artwork_url TEXT, -- Public CDN URL to cover art
    source_url TEXT, -- YouTube link
    source_id TEXT, -- YouTube Video ID
    bitrate TEXT DEFAULT '320kbps',
    format TEXT DEFAULT 'mp3',
    play_count INT DEFAULT 0,
    likes_count INT DEFAULT 0,
    last_played_at TIMESTAMP WITH TIME ZONE,
    is_favorite BOOLEAN DEFAULT FALSE,
    file_size BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Ensure likes_count column exists if table was created previously
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 4. Song Likes Table (Multi-User Like Tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.song_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, song_id)
);

-- ----------------------------------------------------------------------------
-- 5. Playlists & Playlist Songs Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.playlist_songs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    position INT DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(playlist_id, song_id)
);

-- ----------------------------------------------------------------------------
-- 6. Listening History Analytics Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listening_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    listened_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    duration_played INT DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- 7. High-Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_songs_user_id ON public.songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_play_count ON public.songs(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_songs_likes_count ON public.songs(likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_song_likes_user_id ON public.song_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_song_likes_song_id ON public.song_likes(song_id);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON public.playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_listening_history_user ON public.listening_history(user_id);

-- ----------------------------------------------------------------------------
-- 8. Triggers & Automation
-- ----------------------------------------------------------------------------

-- A. Auto-create user profile on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (new.id, new.email, split_part(new.email, '@', 1))
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, split_part(EXCLUDED.email, '@', 1));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B. Auto-sync songs.likes_count when users like/unlike
CREATE OR REPLACE FUNCTION public.sync_song_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.songs
        SET likes_count = COALESCE(likes_count, 0) + 1
        WHERE id = NEW.song_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.songs
        SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
        WHERE id = OLD.song_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_song_likes_count ON public.song_likes;
CREATE TRIGGER trg_sync_song_likes_count
    AFTER INSERT OR DELETE ON public.song_likes
    FOR EACH ROW EXECUTE FUNCTION public.sync_song_likes_count();

-- ----------------------------------------------------------------------------
-- 9. Real-Time RPC Functions
-- ----------------------------------------------------------------------------

-- A. Atomic increment of play count
CREATE OR REPLACE FUNCTION public.increment_play_count(target_song_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.songs
    SET play_count = COALESCE(play_count, 0) + 1,
        last_played_at = TIMEZONE('utc'::text, NOW())
    WHERE id = target_song_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Atomic toggle of user song like
CREATE OR REPLACE FUNCTION public.toggle_song_like(target_song_id UUID)
RETURNS JSON AS $$
DECLARE
    current_user_id UUID;
    already_liked BOOLEAN;
    updated_likes INT;
    result JSON;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.song_likes 
        WHERE user_id = current_user_id AND song_id = target_song_id
    ) INTO already_liked;

    IF already_liked THEN
        DELETE FROM public.song_likes 
        WHERE user_id = current_user_id AND song_id = target_song_id;
    ELSE
        INSERT INTO public.song_likes (user_id, song_id)
        VALUES (current_user_id, target_song_id)
        ON CONFLICT (user_id, song_id) DO NOTHING;
    END IF;

    SELECT COALESCE(likes_count, 0) INTO updated_likes 
    FROM public.songs 
    WHERE id = target_song_id;

    result := json_build_object(
        'is_liked', NOT already_liked,
        'likes_count', COALESCE(updated_likes, 0)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Real Community Top Listeners Calculation (NO MOCK DATA)
CREATE OR REPLACE FUNCTION public.get_top_listeners(limit_count INT DEFAULT 10)
RETURNS TABLE (
    user_id UUID,
    name TEXT,
    avatar_url TEXT,
    total_plays BIGINT,
    total_seconds BIGINT,
    total_hours TEXT,
    rank BIGINT,
    badge TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH user_stream_stats AS (
        SELECT 
            s.user_id,
            COALESCE(SUM(s.play_count), 0)::BIGINT as total_plays,
            COALESCE(SUM(s.play_count * COALESCE(s.duration, 180)), 0)::BIGINT as total_seconds
        FROM public.songs s
        WHERE s.play_count > 0
        GROUP BY s.user_id
    ),
    ranked_users AS (
        SELECT 
            uss.user_id,
            COALESCE(p.display_name, split_part(p.email, '@', 1), 'Musify Listener') as name,
            p.avatar_url,
            uss.total_plays,
            uss.total_seconds,
            TO_CHAR(ROUND((uss.total_seconds::NUMERIC / 3600.0), 1), 'FM999990.0') as total_hours,
            ROW_NUMBER() OVER (ORDER BY uss.total_plays DESC, uss.total_seconds DESC) as rank
        FROM user_stream_stats uss
        LEFT JOIN public.profiles p ON p.id = uss.user_id
    )
    SELECT 
        ru.user_id,
        ru.name,
        ru.avatar_url,
        ru.total_plays,
        ru.total_seconds,
        ru.total_hours,
        ru.rank,
        CASE 
            WHEN ru.rank = 1 THEN '👑 Grandmaster'
            WHEN ru.rank = 2 THEN '💎 Diamond'
            WHEN ru.rank <= 4 THEN '🔥 Gold Master'
            ELSE '🎧 Audio Elite'
        END as badge
    FROM ranked_users ru
    ORDER BY ru.rank ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 10. Enable Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_history ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 11. Row Level Security Policies
-- ----------------------------------------------------------------------------

-- Profiles (Public view for leaderboard; edit own profile)
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles" ON public.profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Songs (Public view for streaming & Global Top 20; edit own tracks)
DROP POLICY IF EXISTS "Users can view own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can view songs" ON public.songs;
CREATE POLICY "Users can view songs" ON public.songs
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own songs" ON public.songs;
CREATE POLICY "Users can insert own songs" ON public.songs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own songs" ON public.songs;
CREATE POLICY "Users can update own songs" ON public.songs
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own songs" ON public.songs;
CREATE POLICY "Users can delete own songs" ON public.songs
    FOR DELETE USING (auth.uid() = user_id);

-- Song Likes (Public view for counts; insert/delete own likes)
DROP POLICY IF EXISTS "Public can view song likes" ON public.song_likes;
CREATE POLICY "Public can view song likes" ON public.song_likes
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own song likes" ON public.song_likes;
CREATE POLICY "Users can insert own song likes" ON public.song_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own song likes" ON public.song_likes;
CREATE POLICY "Users can delete own song likes" ON public.song_likes
    FOR DELETE USING (auth.uid() = user_id);

-- Playlists
DROP POLICY IF EXISTS "Users can view own playlists" ON public.playlists;
CREATE POLICY "Users can view own playlists" ON public.playlists
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own playlists" ON public.playlists;
CREATE POLICY "Users can create own playlists" ON public.playlists
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own playlists" ON public.playlists;
CREATE POLICY "Users can update own playlists" ON public.playlists
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own playlists" ON public.playlists;
CREATE POLICY "Users can delete own playlists" ON public.playlists
    FOR DELETE USING (auth.uid() = user_id);

-- Playlist Songs
DROP POLICY IF EXISTS "Users can view own playlist songs" ON public.playlist_songs;
CREATE POLICY "Users can view own playlist songs" ON public.playlist_songs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.playlists 
            WHERE playlists.id = playlist_songs.playlist_id 
            AND playlists.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert into own playlists" ON public.playlist_songs;
CREATE POLICY "Users can insert into own playlists" ON public.playlist_songs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playlists 
            WHERE playlists.id = playlist_songs.playlist_id 
            AND playlists.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete from own playlists" ON public.playlist_songs;
CREATE POLICY "Users can delete from own playlists" ON public.playlist_songs
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.playlists 
            WHERE playlists.id = playlist_songs.playlist_id 
            AND playlists.user_id = auth.uid()
        )
    );

-- Listening History
DROP POLICY IF EXISTS "Users can view own history" ON public.listening_history;
CREATE POLICY "Users can view own history" ON public.listening_history
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own history" ON public.listening_history;
CREATE POLICY "Users can insert own history" ON public.listening_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 12. Storage Buckets (tracks, artwork, songs)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tracks', 'tracks', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('artwork', 'artwork', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('songs', 'songs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Access Policies
DROP POLICY IF EXISTS "Public tracks access" ON storage.objects;
CREATE POLICY "Public tracks access" 
ON storage.objects FOR SELECT 
USING (bucket_id IN ('tracks', 'artwork', 'songs'));

DROP POLICY IF EXISTS "Allow uploads to tracks" ON storage.objects;
CREATE POLICY "Allow uploads to tracks" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id IN ('tracks', 'artwork', 'songs'));

DROP POLICY IF EXISTS "Allow updates to tracks" ON storage.objects;
CREATE POLICY "Allow updates to tracks" 
ON storage.objects FOR UPDATE 
USING (bucket_id IN ('tracks', 'artwork', 'songs'));

DROP POLICY IF EXISTS "Allow deletes to tracks" ON storage.objects;
CREATE POLICY "Allow deletes to tracks" 
ON storage.objects FOR DELETE 
USING (bucket_id IN ('tracks', 'artwork', 'songs'));

-- ----------------------------------------------------------------------------
-- 13. Grant Execute Permissions
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.increment_play_count(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.toggle_song_like(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_listeners(INT) TO authenticated, anon;
