import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Song, Playlist } from '../types';

const OFFLINE_SONGS_KEY = 'MUSIFY_OFFLINE_SONGS_CACHE';
const PLAYLISTS_KEY = 'MUSIFY_LOCAL_PLAYLISTS';
const FAVORITES_KEY = 'MUSIFY_FAVORITES';
const ENV_STORAGE_KEY = 'MUSIFY_ENV_ESTABLISHED';

/**
 * Dynamic path getters - safely evaluated at runtime instead of module evaluation time.
 * Prevents native IllegalArgumentException: Invalid URI when FileSystem.documentDirectory
 * is null/undefined during early React Native / Hermes startup.
 */
function getBaseDir(): string | null {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return null;
  const doc = FileSystem.documentDirectory;
  return doc.endsWith('/') ? `${doc}musify/` : `${doc}/musify/`;
}

function getSongsDir(): string | null {
  const base = getBaseDir();
  return base ? `${base}songs/` : null;
}

function getArtworkDir(): string | null {
  const base = getBaseDir();
  return base ? `${base}artwork/` : null;
}

function getEnvMarkerFile(): string | null {
  const base = getBaseDir();
  return base ? `${base}env_established.json` : null;
}

async function ensureDirectories(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const base = getBaseDir();
  const songs = getSongsDir();
  const artwork = getArtworkDir();
  if (!base || !songs || !artwork) return false;

  try {
    const dirs = [base, songs, artwork];
    for (const dir of dirs) {
      const dirInfo = await FileSystem.getInfoAsync(dir).catch(() => ({ exists: false }));
      if (!dirInfo || !dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch((err) => {
          console.warn('Directory creation notice for', dir, err);
        });
      }
    }
    return true;
  } catch (err) {
    console.warn('ensureDirectories safe catch:', err);
    return false;
  }
}

export const StorageService = {
  async init() {
    try {
      await ensureDirectories();
    } catch (e) {
      console.warn('StorageService.init notice:', e);
    }
  },

  /**
   * Check whether the local GPU & audio environment has already been established once.
   * Checks both AsyncStorage and permanent on-device filesystem marker so it is NEVER requested again.
   */
  async isEnvironmentEstablished(): Promise<boolean> {
    try {
      const flag = await AsyncStorage.getItem(ENV_STORAGE_KEY).catch(() => null);
      if (flag === 'true') return true;

      const marker = getEnvMarkerFile();
      if (marker) {
        const info = await FileSystem.getInfoAsync(marker).catch(() => ({ exists: false }));
        if (info && info.exists) {
          await AsyncStorage.setItem(ENV_STORAGE_KEY, 'true').catch(() => {});
          return true;
        }
      }
    } catch (e) {
      console.warn('Error checking environment establishment:', e);
    }
    return false;
  },

  /**
   * Permanently marks the environment as established.
   * Saves to both AsyncStorage and disk file so subsequent app opens never re-download or re-establish.
   */
  async markEnvironmentEstablished(sizeMB: number = 42.8): Promise<void> {
    try {
      await AsyncStorage.setItem(ENV_STORAGE_KEY, 'true');
      await AsyncStorage.setItem('MUSIFY_ENV_SIZE_MB', sizeMB.toString());
      await AsyncStorage.setItem('MUSIFY_ENV_ESTABLISHED_DATE', new Date().toISOString());

      const marker = getEnvMarkerFile();
      if (marker) {
        await ensureDirectories();
        const payload = JSON.stringify({
          established: true,
          sizeMB,
          date: new Date().toISOString(),
        });
        await FileSystem.writeAsStringAsync(marker, payload).catch((err) => {
          console.warn('Could not write marker file:', err);
        });
      }
    } catch (e) {
      console.warn('Error saving environment marker:', e);
    }
  },

  async getOfflineSongs(): Promise<Song[]> {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_SONGS_KEY);
      if (!data) return [];
      const parsed: Song[] = JSON.parse(data);

      if (Platform.OS === 'web') {
        return parsed.map((s) => ({ ...s, isOffline: true }));
      }
      
      // Verify files exist on native filesystem safely
      const validSongs: Song[] = [];
      for (const song of parsed) {
        if (song.localAudioUri && (song.localAudioUri.startsWith('file://') || song.localAudioUri.startsWith('content://'))) {
          try {
            const info = await FileSystem.getInfoAsync(song.localAudioUri).catch(() => ({ exists: false }));
            if (info && info.exists) {
              validSongs.push({ ...song, isOffline: true });
            }
          } catch {
            // Ignore invalid file URI
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

    const songsDir = getSongsDir();
    const artDir = getArtworkDir();
    if (!songsDir || !artDir) {
      throw new Error('Device storage directory unavailable');
    }

    const fileExt = song.format || 'mp3';
    const localAudioUri = `${songsDir}${song.id}.${fileExt}`;
    const localArtworkUri = `${artDir}${song.id}.jpg`;

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
        const artDir = getArtworkDir();
        if (song?.localAudioUri) {
          await FileSystem.deleteAsync(song.localAudioUri, { idempotent: true }).catch(() => {});
        }
        if (song?.localArtworkUri && artDir && song.localArtworkUri.startsWith(artDir)) {
          await FileSystem.deleteAsync(song.localArtworkUri, { idempotent: true }).catch(() => {});
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
      const songsDir = getSongsDir();
      const artDir = getArtworkDir();
      if (songsDir) {
        const sInfo = await FileSystem.getInfoAsync(songsDir).catch(() => ({ exists: false }));
        if (sInfo && sInfo.exists) {
          const songFiles = await FileSystem.readDirectoryAsync(songsDir).catch(() => []);
          for (const file of songFiles) {
            const info = await FileSystem.getInfoAsync(`${songsDir}${file}`).catch(() => null);
            if (info && info.exists && 'size' in info && typeof info.size === 'number') {
              songBytes += info.size;
            }
          }
        }
      }

      if (artDir) {
        const aInfo = await FileSystem.getInfoAsync(artDir).catch(() => ({ exists: false }));
        if (aInfo && aInfo.exists) {
          const artFiles = await FileSystem.readDirectoryAsync(artDir).catch(() => []);
          for (const file of artFiles) {
            const info = await FileSystem.getInfoAsync(`${artDir}${file}`).catch(() => null);
            if (info && info.exists && 'size' in info && typeof info.size === 'number') {
              artworkBytes += info.size;
            }
          }
        }
      }
    } catch {
      // Safe fallback
    }

    const totalMB = ((songBytes + artworkBytes) / (1024 * 1024)).toFixed(1);
    return { songBytes, artworkBytes, totalMB };
  }
};
