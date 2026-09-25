import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Song, Playlist } from '../types';

const OFFLINE_SONGS_KEY = 'MUSIFY_OFFLINE_SONGS_CACHE';
const PLAYLISTS_KEY = 'MUSIFY_LOCAL_PLAYLISTS';
const FAVORITES_KEY = 'MUSIFY_FAVORITES';

const BASE_MUSIC_DIR = `${FileSystem.documentDirectory || ''}musify/`;
const SONGS_DIR = `${BASE_MUSIC_DIR}songs/`;
const ARTWORK_DIR = `${BASE_MUSIC_DIR}artwork/`;

async function ensureDirectories() {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
  const dirs = [BASE_MUSIC_DIR, SONGS_DIR, ARTWORK_DIR];
  for (const dir of dirs) {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

export const StorageService = {
  async init() {
    await ensureDirectories();
  },

  async getOfflineSongs(): Promise<Song[]> {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_SONGS_KEY);
      if (!data) return [];
      const parsed: Song[] = JSON.parse(data);

      if (Platform.OS === 'web') {
        return parsed.map((s) => ({ ...s, isOffline: true }));
      }
      
      // Verify files exist on native filesystem
      const validSongs: Song[] = [];
      for (const song of parsed) {
        if (song.localAudioUri) {
          const info = await FileSystem.getInfoAsync(song.localAudioUri);
          if (info.exists) {
            validSongs.push({ ...song, isOffline: true });
          }
        }
      }
      return validSongs;
    } catch (e) {
      console.error('Failed to get offline songs:', e);
      return [];
    }
  },

  async downloadSongOffline(
    song: Song,
    onProgress?: (progress: number) => void
  ): Promise<Song> {
    if (Platform.OS === 'web') {
      const updatedSong: Song = {
        ...song,
        localAudioUri: song.audio_url,
        localArtworkUri: song.artwork_url,
        isOffline: true,
      };
      const existing = await this.getOfflineSongs();
      const filtered = existing.filter((s) => s.id !== song.id);
      filtered.unshift(updatedSong);
      await AsyncStorage.setItem(OFFLINE_SONGS_KEY, JSON.stringify(filtered));
      if (onProgress) onProgress(1);
      return updatedSong;
    }

    await ensureDirectories();

    const fileExt = song.format || 'mp3';
    const localAudioUri = `${SONGS_DIR}${song.id}.${fileExt}`;
    const localArtworkUri = `${ARTWORK_DIR}${song.id}.jpg`;

    // 1. Download audio file
    const downloadResumable = FileSystem.createDownloadResumable(
      song.audio_url,
      localAudioUri,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten /
          (downloadProgress.totalBytesExpectedToWrite || 1);
        if (onProgress) onProgress(Math.min(1, Math.max(0, progress)));
      }
    );

    const downloadResult = await downloadResumable.downloadAsync();
    if (!downloadResult || downloadResult.status !== 200) {
      throw new Error(`Failed to download audio file: HTTP status ${downloadResult?.status}`);
    }

    // 2. Download artwork if available
    let savedArtworkUri = song.artwork_url;
    if (song.artwork_url && song.artwork_url.startsWith('http')) {
      try {
        await FileSystem.downloadAsync(song.artwork_url, localArtworkUri);
        savedArtworkUri = localArtworkUri;
      } catch (err) {
        console.warn('Could not cache artwork locally:', err);
      }
    }

    const updatedSong: Song = {
      ...song,
      localAudioUri: downloadResult.uri,
      localArtworkUri: savedArtworkUri,
      isOffline: true,
    };

    // Save to offline storage
    const existing = await this.getOfflineSongs();
    const filtered = existing.filter((s) => s.id !== song.id);
    filtered.unshift(updatedSong);
    await AsyncStorage.setItem(OFFLINE_SONGS_KEY, JSON.stringify(filtered));

    return updatedSong;
  },

  async removeSongOffline(songId: string): Promise<void> {
    try {
      const existing = await this.getOfflineSongs();
      const song = existing.find((s) => s.id === songId);

      if (Platform.OS !== 'web') {
        if (song?.localAudioUri) {
          await FileSystem.deleteAsync(song.localAudioUri, { idempotent: true });
        }
        if (song?.localArtworkUri && song.localArtworkUri.startsWith(ARTWORK_DIR)) {
          await FileSystem.deleteAsync(song.localArtworkUri, { idempotent: true });
        }
      }

      const updated = existing.filter((s) => s.id !== songId);
      await AsyncStorage.setItem(OFFLINE_SONGS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to remove offline song:', e);
    }
  },

  async isSongDownloaded(songId: string): Promise<boolean> {
    const existing = await this.getOfflineSongs();
    return existing.some((s) => s.id === songId);
  },

  async getFavorites(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async toggleFavorite(songId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavorites();
      const exists = favorites.includes(songId);
      let updated: string[];
      if (exists) {
        updated = favorites.filter((id) => id !== songId);
      } else {
        updated = [...favorites, songId];
      }
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return !exists;
    } catch {
      return false;
    }
  },

  async getLocalPlaylists(): Promise<Playlist[]> {
    try {
      const data = await AsyncStorage.getItem(PLAYLISTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async saveLocalPlaylists(playlists: Playlist[]): Promise<void> {
    await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  },

  async getStorageUsage(): Promise<{ songBytes: number; artworkBytes: number; totalMB: string }> {
    let songBytes = 0;
    let artworkBytes = 0;
    try {
      const songFiles = await FileSystem.readDirectoryAsync(SONGS_DIR);
      for (const file of songFiles) {
        const info = await FileSystem.getInfoAsync(`${SONGS_DIR}${file}`);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          songBytes += info.size;
        }
      }

      const artFiles = await FileSystem.readDirectoryAsync(ARTWORK_DIR);
      for (const file of artFiles) {
        const info = await FileSystem.getInfoAsync(`${ARTWORK_DIR}${file}`);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          artworkBytes += info.size;
        }
      }
    } catch {
      // Ignore if directory empty
    }

    const totalMB = ((songBytes + artworkBytes) / (1024 * 1024)).toFixed(1);
    return { songBytes, artworkBytes, totalMB };
  }
};
