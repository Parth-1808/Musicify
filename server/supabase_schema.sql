-- Musify Supabase Database Schema & Storage Configuration

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Songs Table (Stores downloaded YouTube tracks in high-fidelity)
CREATE TABLE IF NOT EXISTS public.songs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Unknown Artist',
    album TEXT DEFAULT 'Single',
    duration INT DEFAULT 0, -- Duration in seconds
    audio_url TEXT NOT NULL, -- Supabase Storage Public URL or external URL
    artwork_url TEXT, -- Supabase Storage Public URL for cover art
    source_url TEXT, -- Original YouTube URL
    source_id TEXT, -- YouTube Video ID
    bitrate TEXT DEFAULT '320kbps', -- Audio bitrate (e.g. 320kbps, 256kbps, Lossless)
    format TEXT DEFAULT 'mp3', -- Audio format (mp3, opus, flac)
    play_count INT DEFAULT 0, -- Track listening count
    last_played_at TIMESTAMP WITH TIME ZONE,
    is_favorite BOOLEAN DEFAULT FALSE,
    file_size BIGINT DEFAULT 0, -- Size in bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Playlists Table
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Playlist Songs Association Table
CREATE TABLE IF NOT EXISTS public.playlist_songs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    position INT DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(playlist_id, song_id)
);

-- 6. Listening History / Analytics Table (To track detailed stats)
CREATE TABLE IF NOT EXISTS public.listening_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    listened_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    duration_played INT DEFAULT 0
);

-- 7. Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_songs_user_id ON public.songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_play_count ON public.songs(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_songs_is_favorite ON public.songs(is_favorite);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON public.playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_listening_history_user ON public.listening_history(user_id);

-- 8. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_history ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies (Users can only manage their own data)
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Songs Policies
CREATE POLICY "Users can view own songs" ON public.songs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own songs" ON public.songs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own songs" ON public.songs
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own songs" ON public.songs
    FOR DELETE USING (auth.uid() = user_id);

-- Playlists Policies
CREATE POLICY "Users can view own playlists" ON public.playlists
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own playlists" ON public.playlists
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own playlists" ON public.playlists
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own playlists" ON public.playlists
    FOR DELETE USING (auth.uid() = user_id);

-- Playlist Songs Policies
CREATE POLICY "Users can view own playlist songs" ON public.playlist_songs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.playlists 
            WHERE playlists.id = playlist_songs.playlist_id 
            AND playlists.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can insert into own playlists" ON public.playlist_songs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playlists 
            WHERE playlists.id = playlist_songs.playlist_id 
            AND playlists.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can delete from own playlists" ON public.playlist_songs
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.playlists 
            WHERE playlists.id = playlist_songs.playlist_id 
            AND playlists.user_id = auth.uid()
        )
    );

-- Listening History Policies
CREATE POLICY "Users can view own history" ON public.listening_history
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON public.listening_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 10. Automatically Create Profile on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (new.id, new.email, split_part(new.email, '@', 1));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Helper Function to Increment Play Count atomically
CREATE OR REPLACE FUNCTION public.increment_play_count(target_song_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.songs
    SET play_count = play_count + 1,
        last_played_at = TIMEZONE('utc'::text, NOW())
    WHERE id = target_song_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Storage Buckets Creation (Run in SQL Editor or Supabase Dashboard)
-- Insert storage buckets if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('songs', 'songs', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('artwork', 'artwork', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'songs' bucket
CREATE POLICY "Public songs access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'songs');

CREATE POLICY "Authenticated users can upload songs" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'songs' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their songs" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'songs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage Policies for 'artwork' bucket
CREATE POLICY "Public artwork access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'artwork');

CREATE POLICY "Authenticated users can upload artwork" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'artwork' AND auth.role() = 'authenticated');
