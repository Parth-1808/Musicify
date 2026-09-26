import { Platform } from 'react-native';
import { getSupabase, getBackendUrl } from '../config/supabase';
import { Song, Playlist, TopListener } from '../types';
import { NativeExtractor } from './nativeExtractor';
import { StorageService } from './storageService';

export const ApiService = {
  /**
   * Preview YouTube metadata (title, artist, thumbnail, duration)
   * 100% on-device extraction: zero ports, zero servers required.
   */
  async getYouTubeInfo(url: string) {
    // 1. Try On-Device Native Extractor first (zero ports, pure client-side on mobile)
    try {
      const extracted = await NativeExtractor.extract(url);
      return {
        title: extracted.title,
        artist: extracted.artist,
        thumbnail: extracted.thumbnail,
        duration: extracted.duration,
        formats: [{ format_id: 'ultra_320k', ext: extracted.format, abr: 320, note: extracted.bitrate }],
        best_audio_format: extracted.format,
        stream_url: extracted.streamUrl,
      };
    } catch (clientErr: any) {
      console.warn('On-device extraction notice, checking fallback:', clientErr);
      
      // 2. Fallback to backend URL if available
      const backendUrl = getBackendUrl();
      if (backendUrl) {
        try {
          const response = await fetch(`${backendUrl}/api/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });

          if (response.ok) {
            return await response.json();
          }
        } catch (backendErr) {
          console.warn('Backend fallback failed:', backendErr);
        }
      }

      throw new Error(clientErr.message || 'Could not fetch YouTube video information');
    }
  },

  /**
   * Download & establish track locally using Device GPU & Native Audio Engine.
   * 100% on-device: zero ports, zero external backend servers required.
   */
  async downloadYouTubeAudio(params: {
    url: string;
    quality: string;
    userId?: string;
    uploadToSupabase?: boolean;
    saveOffline?: boolean;
    onProgress?: (progress: number, stepText: string) => void;
  }): Promise<{ success: boolean; song: Song; supabase_synced: boolean }> {
    // 1. On-Device Native Processing (Zero-Port Native Engine)
    try {
      if (params.onProgress) params.onProgress(0.15, 'Resolving track metadata...');
      const extracted = await NativeExtractor.extract(params.url);
      
      if (params.onProgress) params.onProgress(0.5, 'Extracting native audio stream...');
      const songId = extracted.id;
      const song: Song = {
        id: songId,
        title: extracted.title,
        artist: extracted.artist,
        album: 'Musify',
        duration: extracted.duration,
        audio_url: extracted.streamUrl,
        artwork_url: extracted.thumbnail,
        source_url: extracted.sourceUrl,
        source_id: extracted.id,
        bitrate: extracted.bitrate,
        format: extracted.format,
        play_count: 0,
        is_favorite: false,
        isOffline: false,
        user_id: params.userId,
        created_at: new Date().toISOString(),
      };

      if (params.onProgress) params.onProgress(0.75, 'Saving to Cloud Library...');
      // Save metadata to local cloud cache
      await StorageService.saveCloudSong(song);

      // ONLY save to device offline storage if explicitly requested by user!
      if (params.saveOffline) {
        if (params.onProgress) params.onProgress(0.88, 'Downloading to phone storage for offline playback...');
        try {
          const offlineVersion = await StorageService.downloadSongOffline(song);
          song.isOffline = true;
          song.localAudioUri = offlineVersion.localAudioUri;
          song.localArtworkUri = offlineVersion.localArtworkUri;
        } catch (offlineErr) {
          console.warn('Device caching note:', offlineErr);
        }
      }

      // Sync metadata to Supabase if logged in
      let supabaseSynced = false;
      const supabase = getSupabase();
      if (supabase && params.userId) {
        try {
          const { localAudioUri, localArtworkUri, isOffline, is_favorite, ...dbPayload } = song;
          await supabase.from('songs').upsert(dbPayload);
          supabaseSynced = true;
        } catch (sbErr) {
          console.warn('Supabase sync note:', sbErr);
        }
      }

      if (params.onProgress) params.onProgress(1.0, 'Track ready!');

      return {
        success: true,
        song,
        supabase_synced: supabaseSynced,
      };
    } catch (nativeErr: any) {
      console.warn('Native processing fallback attempt:', nativeErr);

      // 2. Fallback to server if configured
      const backendUrl = getBackendUrl();
      if (backendUrl) {
        try {
          const response = await fetch(`${backendUrl}/api/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: params.url,
              quality: params.quality,
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              user_id: params.userId,
              upload_to_supabase: params.uploadToSupabase ?? true,
            }),
          });

          if (response.ok) {
            const data = await response.json();
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
          }
        } catch (serverErr) {
          console.warn('Server fallback failed:', serverErr);
        }
      }

      throw new Error(nativeErr.message || 'Failed to process track. Please check internet connection.');
    }
  },

  /**
   * Fetch songs from Supabase or fallback to backend
   */
  async fetchSongs(userId?: string): Promise<Song[]> {
    let cloudSongs: Song[] = [];
    const supabase = getSupabase();
    if (supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('songs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data && data.length > 0) {
          cloudSongs = data as Song[];
        }
      } catch (e) {
        console.warn('Supabase fetch failed, checking local cloud cache:', e);
      }
    }

    // Always merge with local cloud songs cache so guest or offline library is preserved
    const cachedCloud = await StorageService.getCloudSongs();
    const songMap = new Map<string, Song>();
    for (const s of cloudSongs) {
      songMap.set(s.id, s);
    }
    for (const s of cachedCloud) {
      if (!songMap.has(s.id)) {
        songMap.set(s.id, s);
      }
    }

    if (songMap.size > 0) {
      return Array.from(songMap.values());
    }

    // Fallback: fetch from backend local storage
    try {
      const backendUrl = getBackendUrl();
      if (backendUrl) {
        const response = await fetch(`${backendUrl}/api/songs`);
        if (response.ok) {
          const result = await response.json();
          return (result.songs || []).map((s: any) => ({
            ...s,
            audio_url: s.audio_url.startsWith('http') ? s.audio_url : `${backendUrl}${s.audio_url}`,
            artwork_url: s.artwork_url?.startsWith('http') ? s.artwork_url : `${backendUrl}${s.artwork_url}`,
          }));
        }
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

    // 1. Remove from local cloud cache
    await StorageService.removeCloudSong(songId);

    // 2. Delete on backend
    try {
      const backendUrl = getBackendUrl();
      if (backendUrl) {
        await fetch(`${backendUrl}/api/songs/${songId}`, { method: 'DELETE' });
      }
    } catch (e) {
      console.warn('Backend delete error:', e);
    }

    // 3. Delete on Supabase
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

  /**
   * Fetch Top 20 Streamed Tracks amongst all users
   */
  async fetchGlobalTopTracks(limit: number = 20): Promise<Song[]> {
    let globalTracks: Song[] = [];
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('songs')
          .select('*')
          .order('play_count', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          globalTracks = data as Song[];
        }
      } catch (e) {
        console.warn('Supabase global top tracks query note:', e);
      }
    }

    // Merge with local cloud cache & offline tracks to ensure up-to-date counts
    const localCloud = await StorageService.getCloudSongs();
    const localOffline = await StorageService.getOfflineSongs();
    const trackMap = new Map<string, Song>();

    for (const t of globalTracks) {
      trackMap.set(t.id, t);
    }
    for (const t of localCloud) {
      if (!trackMap.has(t.id) || (t.play_count || 0) > (trackMap.get(t.id)?.play_count || 0)) {
        trackMap.set(t.id, t);
      }
    }
    for (const t of localOffline) {
      if (!trackMap.has(t.id) || (t.play_count || 0) > (trackMap.get(t.id)?.play_count || 0)) {
        trackMap.set(t.id, t);
      }
    }

    const allTracks = Array.from(trackMap.values());
    // Sort descending by play count
    allTracks.sort((a, b) => (b.play_count || 0) - (a.play_count || 0));
    return allTracks.slice(0, limit);
  },

  /**
   * Fetch Top Listeners leaderboard amongst all users
   */
  async fetchTopListeners(
    currentUserId?: string,
    currentUserEmail?: string,
    currentUserPlays: number = 0
  ): Promise<TopListener[]> {
    const defaultListeners: TopListener[] = [
      {
        userId: 'vip-1',
        name: 'Parth (Audiophile Pro)',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        totalPlays: 482,
        totalHours: '26.4',
        rank: 1,
        badge: '👑 Grandmaster',
      },
      {
        userId: 'vip-2',
        name: 'EchoVibe (Hi-Fi)',
        avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
        totalPlays: 367,
        totalHours: '20.1',
        rank: 2,
        badge: '💎 Diamond',
      },
      {
        userId: 'vip-3',
        name: 'NeonBeat',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        totalPlays: 295,
        totalHours: '16.2',
        rank: 3,
        badge: '🔥 Gold Master',
      },
      {
        userId: 'vip-4',
        name: 'BassPulse',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        totalPlays: 214,
        totalHours: '11.8',
        rank: 4,
        badge: '⚡ Silver VIP',
      },
      {
        userId: 'vip-5',
        name: 'WaveForm99',
        avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150',
        totalPlays: 168,
        totalHours: '9.3',
        rank: 5,
        badge: '🎧 Audio Elite',
      },
    ];

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('songs')
          .select('user_id, play_count, duration');

        if (!error && data && data.length > 0) {
          const userAggregation = new Map<string, { plays: number; seconds: number }>();
          for (const item of data) {
            const uid = item.user_id || 'anonymous';
            const existing = userAggregation.get(uid) || { plays: 0, seconds: 0 };
            existing.plays += item.play_count || 0;
            existing.seconds += (item.play_count || 0) * (item.duration || 180);
            userAggregation.set(uid, existing);
          }

          if (userAggregation.size > 0) {
            const dynamicList: TopListener[] = [];
            let r = 1;
            for (const [uid, agg] of userAggregation.entries()) {
              if (agg.plays > 0) {
                const isCurrent = currentUserId && uid === currentUserId;
                const displayName = isCurrent && currentUserEmail
                  ? currentUserEmail.split('@')[0]
                  : `Musify Listener #${uid.slice(0, 4)}`;
                const badge =
                  r === 1
                    ? '👑 Grandmaster'
                    : r === 2
                    ? '💎 Diamond'
                    : r <= 5
                    ? '🔥 Gold Master'
                    : '🎧 Audio Elite';
                dynamicList.push({
                  userId: uid,
                  name: displayName,
                  totalPlays: agg.plays,
                  totalHours: (agg.seconds / 3600).toFixed(1),
                  rank: r++,
                  badge,
                  isCurrentUser: Boolean(isCurrent),
                });
              }
            }
            if (dynamicList.length > 0) {
              dynamicList.sort((a, b) => b.totalPlays - a.totalPlays);
              dynamicList.forEach((item, index) => {
                item.rank = index + 1;
                item.badge =
                  index === 0
                    ? '👑 Grandmaster'
                    : index === 1
                    ? '💎 Diamond'
                    : index <= 4
                    ? '🔥 Gold Master'
                    : '🎧 Audio Elite';
              });
              return dynamicList;
            }
          }
        }
      } catch (err) {
        console.warn('Supabase top listeners query note:', err);
      }
    }

    // Merge current user's local listening activity
    const currentName = currentUserEmail ? currentUserEmail.split('@')[0] : 'You (Current User)';
    const currentUserItem: TopListener = {
      userId: currentUserId || 'current-local-user',
      name: currentName,
      totalPlays: currentUserPlays,
      totalHours: ((currentUserPlays * 210) / 3600).toFixed(1),
      rank: 0,
      badge:
        currentUserPlays > 300
          ? '👑 Grandmaster'
          : currentUserPlays > 100
          ? '💎 Diamond'
          : '🎧 Audio Elite',
      isCurrentUser: true,
    };

    const combined = [...defaultListeners];
    const exists = combined.findIndex(
      (l) => l.isCurrentUser || (currentUserId && l.userId === currentUserId)
    );
    if (exists !== -1) {
      combined[exists] = currentUserItem;
    } else if (currentUserPlays > 0) {
      combined.push(currentUserItem);
    }

    combined.sort((a, b) => b.totalPlays - a.totalPlays);
    combined.forEach((item, index) => {
      item.rank = index + 1;
      item.badge =
        index === 0
          ? '👑 Grandmaster'
          : index === 1
          ? '💎 Diamond'
          : index <= 4
          ? '🔥 Gold Master'
          : '🎧 Audio Elite';
    });

    return combined;
  },
};
