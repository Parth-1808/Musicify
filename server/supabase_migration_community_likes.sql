-- ============================================================================
-- MUSIFY SUPABASE UPDATE: COMMUNITY LIKES, TOP 20 TRACKS & LEADERBOARD
-- Run this script in your Supabase project's SQL Editor (SQL tab).
-- ============================================================================

-- 1. Add likes_count column to public.songs
ALTER TABLE public.songs 
ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;

-- Create index for sorting and fast retrieval by likes and plays
CREATE INDEX IF NOT EXISTS idx_songs_likes_count ON public.songs(likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_songs_play_count ON public.songs(play_count DESC);

-- 2. Create song_likes table (tracks which user liked which song)
CREATE TABLE IF NOT EXISTS public.song_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_likes_user_id ON public.song_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_song_likes_song_id ON public.song_likes(song_id);

-- Enable RLS on song_likes
ALTER TABLE public.song_likes ENABLE ROW LEVEL SECURITY;

-- RLS policies for song_likes
DROP POLICY IF EXISTS "Public can view song likes" ON public.song_likes;
CREATE POLICY "Public can view song likes" ON public.song_likes
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own song likes" ON public.song_likes;
CREATE POLICY "Users can insert own song likes" ON public.song_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own song likes" ON public.song_likes;
CREATE POLICY "Users can delete own song likes" ON public.song_likes
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Automatic Trigger to keep songs.likes_count in sync with song_likes table
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

-- 4. RPC Function to atomically toggle like status and return updated count
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

-- 5. Open RLS SELECT policies on songs & profiles for Community Features
-- (Allows all users to stream Global Top 20 and view community listener ranks)
DROP POLICY IF EXISTS "Users can view own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can view songs" ON public.songs;
CREATE POLICY "Users can view songs" ON public.songs
    FOR SELECT USING (true);

-- Ensure users can still insert/update/delete their own tracks
DROP POLICY IF EXISTS "Users can insert own songs" ON public.songs;
CREATE POLICY "Users can insert own songs" ON public.songs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own songs" ON public.songs;
CREATE POLICY "Users can update own songs" ON public.songs
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own songs" ON public.songs;
CREATE POLICY "Users can delete own songs" ON public.songs
    FOR DELETE USING (auth.uid() = user_id);

-- Profiles policy: allow viewing public profiles for Top Listeners Leaderboard
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles" ON public.profiles
    FOR SELECT USING (true);

-- 6. RPC Function to get Community Top Listeners Leaderboard
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

-- 7. Grant execute permissions on RPC functions
GRANT EXECUTE ON FUNCTION public.increment_play_count(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.toggle_song_like(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_listeners(INT) TO authenticated, anon;
