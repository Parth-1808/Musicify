import { getSupabase, getBackendUrl } from '../config/supabase';
import { Song, Playlist } from '../types';

export const ApiService = {
  /**
   * Preview YouTube metadata (title, artist, thumbnail, duration)
   */
  async getYouTubeInfo(url: string) {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      throw new Error('Backend URL is not configured in .env (EXPO_PUBLIC_BACKEND_URL).');
    }
    const response = await fetch(`${backendUrl}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to inspect YouTube URL' }));
      throw new Error(err.detail || 'Could not fetch YouTube video information');
    }

    return await response.json();
  },

  /**
   * Request backend to download YouTube audio in ultra high quality (320kbps MP3 / Opus / FLAC),
   * tag it, upload to Supabase, and return song metadata.
   */
  async downloadYouTubeAudio(params: {
    url: string;
    quality: string;
    userId?: string;
    uploadToSupabase?: boolean;
  }): Promise<{ success: boolean; song: Song; supabase_synced: boolean }> {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      throw new Error('Backend URL is not configured in .env (EXPO_PUBLIC_BACKEND_URL).');
    }
    const response = await fetch(`${backendUrl}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: params.url,
        quality: params.quality,
        user_id: params.userId,
        upload_to_supabase: params.uploadToSupabase ?? true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Download failed' }));
      throw new Error(err.detail || 'Could not download track');
    }

    const data = await response.json();
    
    // Ensure full URL for audio and artwork if relative
    const song: Song = {
      ...data.song,
      audio_url: data.song.audio_url.startsWith('http')
        ? data.song.audio_url
        : `${backendUrl}${data.song.audio_url}`,
      artwork_url: data.song.artwork_url?.startsWith('http')
        ? data.song.artwork_url
        : `${backendUrl}${data.song.artwork_url}`,
    };

    return {
      success: data.success,
      song,
      supabase_synced: data.supabase_synced,
    };
  },

  /**
   * Fetch songs from Supabase or fallback to backend
   */
  async fetchSongs(userId?: string): Promise<Song[]> {
    const supabase = getSupabase();
    if (supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('songs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) return data as Song[];
      } catch (e) {
        console.warn('Supabase fetch failed, attempting backend fallback:', e);
      }
    }

    // Fallback: fetch from backend local storage
    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/songs`);
      if (response.ok) {
        const result = await response.json();
        return (result.songs || []).map((s: any) => ({
          ...s,
          audio_url: s.audio_url.startsWith('http') ? s.audio_url : `${backendUrl}${s.audio_url}`,
          artwork_url: s.artwork_url?.startsWith('http') ? s.artwork_url : `${backendUrl}${s.artwork_url}`,
        }));
      }
    } catch (e) {
      console.warn('Backend fetch songs failed:', e);
    }

    return [];
  },

  /**
   * Increment song play count
   */
  async incrementPlayCount(songId: string): Promise<void> {
    const backendUrl = getBackendUrl();
    try {
      await fetch(`${backendUrl}/api/play/${songId}`, { method: 'POST' });
    } catch {
      // Non-critical, ignore
    }

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.rpc('increment_play_count', { target_song_id: songId });
      } catch {
        // Fallback update
        try {
          const { data } = await supabase.from('songs').select('play_count').eq('id', songId).single();
          if (data) {
            await supabase.from('songs').update({ play_count: (data.play_count || 0) + 1 }).eq('id', songId);
          }
        } catch {}
      }
    }
  },

  /**
   * Delete song from Supabase and backend
   */
  async deleteSong(songId: string, userId?: string): Promise<boolean> {
    let success = true;

    // 1. Delete on backend
    try {
      const backendUrl = getBackendUrl();
      await fetch(`${backendUrl}/api/songs/${songId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Backend delete error:', e);
    }

    // 2. Delete on Supabase
    const supabase = getSupabase();
    if (supabase && userId) {
      try {
        const { error } = await supabase.from('songs').delete().eq('id', songId).eq('user_id', userId);
        if (error) {
          console.error('Supabase delete error:', error);
          success = false;
        }
      } catch {
        success = false;
      }
    }

    return success;
  },

  /**
   * Fetch user playlists from Supabase
   */
  async fetchPlaylists(userId?: string): Promise<Playlist[]> {
    const supabase = getSupabase();
    if (supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('playlists')
          .select('*, playlist_songs(song:songs(*))')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            cover_url: p.cover_url,
            created_at: p.created_at,
            songs: (p.playlist_songs || [])
              .map((ps: any) => ps.song)
              .filter(Boolean),
            song_count: (p.playlist_songs || []).length,
          }));
        }
      } catch (e) {
        console.warn('Supabase fetch playlists failed:', e);
      }
    }
    return [];
  },

  /**
   * Create a playlist
   */
  async createPlaylist(name: string, description = '', userId?: string): Promise<Playlist | null> {
    const supabase = getSupabase();
    if (supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('playlists')
          .insert({
            name,
            description,
            user_id: userId,
          })
          .select()
          .single();

        if (!error && data) {
          return {
            id: data.id,
            name: data.name,
            description: data.description,
            cover_url: data.cover_url,
            songs: [],
            song_count: 0,
            created_at: data.created_at,
          };
        }
      } catch (e) {
        console.error('Create playlist error:', e);
      }
    }
    return null;
  },

  /**
   * Add song to playlist
   */
  async addSongToPlaylist(playlistId: string, songId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('playlist_songs').insert({
          playlist_id: playlistId,
          song_id: songId,
        });
        return !error;
      } catch {
        return false;
      }
    }
    return false;
  },

  /**
   * Remove song from playlist
   */
  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('playlist_songs')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('song_id', songId);
        return !error;
      } catch {
        return false;
      }
    }
    return false;
  },

  /**
   * Delete playlist
   */
  async deletePlaylist(playlistId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('playlists').delete().eq('id', playlistId);
        return !error;
      } catch {
        return false;
      }
    }
    return false;
  },
};
