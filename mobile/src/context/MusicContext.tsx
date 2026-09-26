import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, Playlist } from '../types';
import { audioService } from '../services/audioService';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { useAuth } from './AuthContext';
import {
  dspEngine,
  DSPSettings,
  EQPresetName,
  LoudnessGainResult,
} from '../services/dspEngine';

interface MusicContextType {
  // Songs & Playlists State
  songs: Song[];
  offlineSongs: Song[];
  cloudSongs: Song[];
  playlists: Playlist[];
  favorites: string[];
  isLoading: boolean;

  // Playback State
  currentSong: Song | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isBuffering: boolean;
  queue: Song[];
  queueIndex: number;
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;

  // Player Actions
  playSong: (song: Song, contextQueue?: Song[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  pauseSong: () => Promise<void>;
  resumeSong: () => Promise<void>;
  seekTo: (positionMillis: number) => Promise<void>;
  nextSong: () => Promise<void>;
  prevSong: () => Promise<void>;

  // Queue Actions
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  // Song Management
  toggleFavorite: (songId: string) => Promise<void>;
  downloadSongForOffline: (song: Song, onProgress?: (p: number) => void) => Promise<void>;
  removeSongOffline: (songId: string) => Promise<void>;
  deleteSongEverywhere: (songId: string) => Promise<void>;
  refreshSongs: () => Promise<void>;

  // Sleep Timer
  sleepTimerRemainingSeconds: number | null;
  isSleepTimerEndOfTrack: boolean;
  setSleepTimer: (minutes: number | null, isEndOfTrack?: boolean) => void;
  cancelSleepTimer: () => void;

  // Toast Notifications
  toastMessage: string | null;
  toastIcon: string;
  showToast: (message: string, icon?: string) => void;

  // Hi-Fi Audio Equalizer Engine & Real-Time DSP (Phase 3)
  eqPreset: 'studio_master' | 'bass_boost' | 'vocal_clarity' | 'pure_direct';
  setEqPreset: (preset: 'studio_master' | 'bass_boost' | 'vocal_clarity' | 'pure_direct') => void;
  dspSettings: DSPSettings;
  updateDSPSettings: (settings: Partial<DSPSettings>) => void;
  setEQBand: (index: number, gainDb: number) => void;
  applyEQPreset: (preset: EQPresetName) => void;
  resetDSPToDefaults: () => void;
  currentNormalizationInfo: {
    normGain: LoudnessGainResult | null;
    songLufs: number | null;
    songTruePeak: number | null;
  };

  // Offline Mode Toggle
  isOfflineMode: boolean;
  toggleOfflineMode: () => void;

  // Playlist Management
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
}

const MusicContext = createContext<MusicContextType>({} as MusicContextType);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [cloudSongs, setCloudSongs] = useState<Song[]>([]);
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // When offline mode is ON: ONLY offline tracks are visible!
  // When online (offline mode is OFF): ONLY cloud tracks are visible!
  const songs = isOfflineMode ? offlineSongs : cloudSongs;

  // Playback state
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [isShuffle, setIsShuffle] = useState(false);

  // Sleep Timer state
  const [sleepTimerRemainingSeconds, setSleepTimerRemainingSeconds] = useState<number | null>(null);
  const [isSleepTimerEndOfTrack, setIsSleepTimerEndOfTrack] = useState<boolean>(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIcon, setToastIcon] = useState<string>('checkmark-circle');

  // Audiophile Hi-Fi EQ Preset state (legacy compatibility)
  const [eqPreset, setEqPresetState] = useState<'studio_master' | 'bass_boost' | 'vocal_clarity' | 'pure_direct'>('studio_master');

  // Real-Time DSP Audio Enhancement Engine State (Phase 3)
  const [dspSettings, setDspSettings] = useState<DSPSettings>(dspEngine.getSettings());
  const [normalizationInfo, setNormalizationInfo] = useState<{
    normGain: LoudnessGainResult | null;
    songLufs: number | null;
    songTruePeak: number | null;
  }>({ normGain: null, songLufs: null, songTruePeak: null });

  useEffect(() => {
    const unsub = dspEngine.subscribe((settings) => {
      setDspSettings(settings);
      setNormalizationInfo(audioService.getCurrentNormalizationInfo());
    });
    return unsub;
  }, []);

  const updateDSPSettings = (partial: Partial<DSPSettings>) => {
    dspEngine.updateSettings(partial);
  };

  const setEQBand = (index: number, gainDb: number) => {
    dspEngine.setEQBand(index, gainDb);
  };

  const applyEQPreset = (preset: EQPresetName) => {
    dspEngine.applyPreset(preset);
    showToast(`EQ: ${preset}`, 'options');
  };

  const resetDSPToDefaults = () => {
    dspEngine.resetToDefaults();
    showToast('DSP settings reset to defaults', 'refresh');
  };

  const setEqPreset = (preset: 'studio_master' | 'bass_boost' | 'vocal_clarity' | 'pure_direct') => {
    setEqPresetState(preset);
    if (preset === 'bass_boost') {
      applyEQPreset('Bass Boost');
    } else if (preset === 'vocal_clarity') {
      applyEQPreset('Vocal');
    } else if (preset === 'pure_direct') {
      updateDSPSettings({ enhancementEnabled: false });
      showToast('DSP: Pure Direct (Bypass)', 'options');
    } else {
      applyEQPreset('Flat');
    }
  };

  const showToast = (message: string, icon = 'checkmark-circle') => {
    setToastMessage(message);
    setToastIcon(icon);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Restore saved offline mode preference
  useEffect(() => {
    AsyncStorage.getItem('@musify:offline_mode').then((val) => {
      if (val === 'true') {
        setIsOfflineMode(true);
      }
    });
  }, []);

  const toggleOfflineMode = async () => {
    const nextVal = !isOfflineMode;
    setIsOfflineMode(nextVal);
    await AsyncStorage.setItem('@musify:offline_mode', nextVal ? 'true' : 'false');
    if (nextVal) {
      showToast('Offline Mode: Playing local downloads only', 'cloud-offline');
      if (currentSong && !currentSong.isOffline && !currentSong.localAudioUri) {
        await audioService.pause();
        setIsPlaying(false);
      }
    } else {
      showToast('Online Mode: Cloud library connected', 'cloud-done');
      await loadLibrary();
    }
  };

  // Refs for callbacks
  const queueRef = useRef<Song[]>([]);
  queueRef.current = queue;
  const queueIndexRef = useRef<number>(0);
  queueIndexRef.current = queueIndex;
  const repeatModeRef = useRef<'off' | 'all' | 'one'>('off');
  repeatModeRef.current = repeatMode;
  const isShuffleRef = useRef<boolean>(false);
  isShuffleRef.current = isShuffle;
  const isSleepTimerEndOfTrackRef = useRef<boolean>(false);
  isSleepTimerEndOfTrackRef.current = isSleepTimerEndOfTrack;

  // Sleep Timer countdown effect
  useEffect(() => {
    if (sleepTimerRemainingSeconds === null || sleepTimerRemainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setSleepTimerRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          audioService.pause();
          setIsPlaying(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sleepTimerRemainingSeconds]);

  // Initialize offline storage & listeners
  useEffect(() => {
    StorageService.init().catch((e) => console.warn('Storage init notice:', e));

    const unsubscribe = audioService.addStatusListener((status) => {
      setIsPlaying(status.isPlaying);
      setPositionMillis(status.positionMillis);
      setDurationMillis(status.durationMillis);
      setIsBuffering(status.isBuffering);
      setNormalizationInfo(audioService.getCurrentNormalizationInfo());
    });

    audioService.setTrackFinishedCallback(() => {
      handleTrackFinished();
    });

    audioService.setPlayThresholdCallback((song) => {
      handleSongPlayReported(song.id);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    loadLibrary();
  }, [user]);

  const loadLibrary = async () => {
    setIsLoading(true);
    try {
      // 1. Get offline songs from device storage
      const localOffline = await StorageService.getOfflineSongs();
      // 2. Get favorites
      const favs = await StorageService.getFavorites();
      setFavorites(favs);
      const favSet = new Set(favs);

      // Enhance offline songs
      const enhancedOfflineSongs: Song[] = localOffline.map((s) => {
        const isFav = favSet.has(s.id);
        const baseSeed = Math.abs((s.title || s.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
        const computedLikes = s.likes_count ?? Math.max(1, Math.floor((s.play_count || 1) * 0.45) + (baseSeed % 28) + 4);
        return {
          ...s,
          isOffline: true,
          is_favorite: isFav,
          likes_count: isFav ? Math.max(1, computedLikes) : computedLikes,
        };
      });
      setOfflineSongs(enhancedOfflineSongs);

      // 3. Get cloud songs (remote Supabase + local cloud cache)
      const remoteSongs = await ApiService.fetchSongs(user?.id);
      const cachedCloudSongs = await StorageService.getCloudSongs();

      const cloudMap = new Map<string, Song>();
      for (const s of remoteSongs) {
        cloudMap.set(s.id, { ...s, isOffline: false, localAudioUri: undefined });
      }
      for (const s of cachedCloudSongs) {
        if (!cloudMap.has(s.id)) {
          cloudMap.set(s.id, { ...s, isOffline: false, localAudioUri: undefined });
        }
      }

      const enhancedCloudSongs: Song[] = Array.from(cloudMap.values()).map((s) => {
        const isFav = favSet.has(s.id);
        const baseSeed = Math.abs((s.title || s.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
        const computedLikes = s.likes_count ?? Math.max(1, Math.floor((s.play_count || 1) * 0.45) + (baseSeed % 28) + 4);
        return {
          ...s,
          isOffline: false,
          is_favorite: isFav,
          likes_count: isFav ? Math.max(1, computedLikes) : computedLikes,
        };
      });
      setCloudSongs(enhancedCloudSongs);

      // 4. Get playlists
      const pls = await ApiService.fetchPlaylists(user?.id);
      if (pls.length > 0) {
        setPlaylists(pls);
      } else {
        const localPls = await StorageService.getLocalPlaylists();
        setPlaylists(localPls);
      }
    } catch (e) {
      console.error('Failed to load library:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSongPlayReported = async (songId: string) => {
    try {
      // Increment local state immediately
      setCloudSongs((prev) =>
        prev.map((s) => (s.id === songId ? { ...s, play_count: (s.play_count || 0) + 1 } : s))
      );
      setOfflineSongs((prev) =>
        prev.map((s) => (s.id === songId ? { ...s, play_count: (s.play_count || 0) + 1 } : s))
      );

      // Sync with backend & Supabase if online
      if (!isOfflineMode) {
        await ApiService.incrementPlayCount(songId);
      }
    } catch (e) {
      console.warn('Could not record play count:', e);
    }
  };

  const handleTrackFinished = async () => {
    // If sleep timer set to End of Track, pause and clear timer
    if (isSleepTimerEndOfTrackRef.current) {
      setIsSleepTimerEndOfTrack(false);
      setSleepTimerRemainingSeconds(null);
      await audioService.pause();
      setIsPlaying(false);
      return;
    }

    const mode = repeatModeRef.current;
    const currentQ = queueRef.current;
    const currIdx = queueIndexRef.current;

    if (mode === 'one') {
      // Replay current song
      if (currentQ[currIdx]) {
        await audioService.loadAndPlay(currentQ[currIdx], 0);
      }
      return;
    }

    if (currIdx < currentQ.length - 1) {
      // Advance to next song in queue
      const nextIdx = currIdx + 1;
      setQueueIndex(nextIdx);
      setCurrentSong(currentQ[nextIdx]);
      await audioService.loadAndPlay(currentQ[nextIdx]);
    } else if (mode === 'all' && currentQ.length > 0) {
      // Loop back to start
      setQueueIndex(0);
      setCurrentSong(currentQ[0]);
      await audioService.loadAndPlay(currentQ[0]);
    } else {
      setIsPlaying(false);
    }
  };

  const playSong = async (song: Song, contextQueue?: Song[]) => {
    try {
      if (isOfflineMode && !song.localAudioUri && !song.isOffline) {
        showToast('Song not downloaded for offline', 'cloud-offline');
        return;
      }

      let newQueue = contextQueue && contextQueue.length > 0 ? [...contextQueue] : [...songs];
      if (newQueue.length === 0) {
        newQueue = [song];
      }

      let index = newQueue.findIndex((s) => s.id === song.id);
      if (index === -1) {
        newQueue.unshift(song);
        index = 0;
      }

      setQueue(newQueue);
      setQueueIndex(index);
      setCurrentSong(song);

      await audioService.loadAndPlay(song);
    } catch (e) {
      console.error('Error playing song:', e);
    }
  };

  const togglePlay = async () => {
    if (!currentSong && songs.length > 0) {
      await playSong(songs[0]);
      return;
    }
    if (isPlaying) {
      await audioService.pause();
    } else {
      await audioService.play();
    }
  };

  const pauseSong = async () => {
    await audioService.pause();
  };

  const resumeSong = async () => {
    await audioService.play();
  };

  const seekTo = async (millis: number) => {
    await audioService.seekTo(millis);
  };

  const nextSong = async () => {
    const currentQ = queueRef.current;
    const currIdx = queueIndexRef.current;

    if (currentQ.length === 0) return;

    let nextIdx = currIdx + 1;
    if (isShuffleRef.current && currentQ.length > 1) {
      nextIdx = Math.floor(Math.random() * currentQ.length);
    } else if (nextIdx >= currentQ.length) {
      nextIdx = 0;
    }

    setQueueIndex(nextIdx);
    setCurrentSong(currentQ[nextIdx]);
    await audioService.loadAndPlay(currentQ[nextIdx]);
  };

  const prevSong = async () => {
    // If track played > 3 seconds, restart current track
    if (positionMillis > 3000) {
      await audioService.seekTo(0);
      return;
    }

    const currentQ = queueRef.current;
    const currIdx = queueIndexRef.current;
    if (currentQ.length === 0) return;

    let prevIdx = currIdx - 1;
    if (prevIdx < 0) {
      prevIdx = currentQ.length - 1;
    }

    setQueueIndex(prevIdx);
    setCurrentSong(currentQ[prevIdx]);
    await audioService.loadAndPlay(currentQ[prevIdx]);
  };

  const addToQueue = (song: Song) => {
    setQueue((prev) => [...prev, song]);
    showToast(`Added to queue`, 'list');
  };

  const playNext = (song: Song) => {
    setQueue((prev) => {
      const copy = [...prev];
      copy.splice(queueIndex + 1, 0, song);
      return copy;
    });
    showToast(`Playing next`, 'play-skip-forward');
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
    if (index < queueIndex) {
      setQueueIndex((prev) => prev - 1);
    }
  };

  const clearQueue = () => {
    if (currentSong) {
      setQueue([currentSong]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const toggleFavorite = async (songId: string) => {
    const isNowFav = await StorageService.toggleFavorite(songId);
    setFavorites((prev) =>
      isNowFav ? [...prev, songId] : prev.filter((id) => id !== songId)
    );
    const updateFavItem = (s: Song) => {
      if (s.id === songId) {
        const currentLikes = s.likes_count ?? 12;
        const nextLikes = isNowFav ? currentLikes + 1 : Math.max(0, currentLikes - 1);
        return { ...s, is_favorite: isNowFav, likes_count: nextLikes };
      }
      return s;
    };
    setCloudSongs((prev) => prev.map(updateFavItem));
    setOfflineSongs((prev) => prev.map(updateFavItem));
    if (currentSong && currentSong.id === songId) {
      setCurrentSong((prev) => (prev ? updateFavItem(prev) : null));
    }
  };

  const downloadSongForOffline = async (song: Song, onProgress?: (p: number) => void) => {
    try {
      const offlineVersion = await StorageService.downloadSongOffline(song, onProgress);
      setOfflineSongs((prev) => {
        const filtered = prev.filter((s) => s.id !== song.id);
        return [offlineVersion, ...filtered];
      });
    } catch (e) {
      console.error('Offline download failed:', e);
      throw e;
    }
  };

  const removeSongOffline = async (songId: string) => {
    await StorageService.removeSongOffline(songId);
    setOfflineSongs((prev) => prev.filter((s) => s.id !== songId));
  };

  const deleteSongEverywhere = async (songId: string) => {
    // 1. If currently playing, stop
    if (currentSong?.id === songId) {
      await audioService.stop();
      setCurrentSong(null);
      setIsPlaying(false);
    }

    // 2. Remove from queue
    setQueue((prev) => prev.filter((s) => s.id !== songId));

    // 3. Remove local offline file & cloud cache
    await StorageService.removeSongOffline(songId);
    await StorageService.removeCloudSong(songId);
    setOfflineSongs((prev) => prev.filter((s) => s.id !== songId));
    setCloudSongs((prev) => prev.filter((s) => s.id !== songId));

    // 4. Delete on backend and Supabase
    const songToDelete = songs.find((s) => s.id === songId);
    await ApiService.deleteSong(songId, user?.id);
    showToast(`Deleted "${songToDelete?.title || 'Track'}"`, 'trash');
  };

  const refreshSongs = async () => {
    await loadLibrary();
  };

  const createPlaylist = async (name: string, description = '') => {
    let newPl = await ApiService.createPlaylist(name, description, user?.id);
    if (!newPl) {
      // Local fallback
      newPl = {
        id: `pl-${Date.now()}`,
        name,
        description,
        songs: [],
        song_count: 0,
        created_at: new Date().toISOString(),
      };
      const updated = [newPl, ...playlists];
      setPlaylists(updated);
      await StorageService.saveLocalPlaylists(updated);
      showToast(`Created playlist "${name}"`, 'folder');
      return newPl;
    }

    setPlaylists((prev) => [newPl!, ...prev]);
    showToast(`Created playlist "${name}"`, 'folder');
    return newPl;
  };

  const addSongToPlaylist = async (playlistId: string, songId: string) => {
    const song = songs.find((s) => s.id === songId);
    if (!song) return;

    await ApiService.addSongToPlaylist(playlistId, songId);

    const targetPl = playlists.find((p) => p.id === playlistId);
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          if (pl.songs.some((s) => s.id === songId)) return pl;
          return {
            ...pl,
            songs: [...pl.songs, song],
            song_count: (pl.song_count || 0) + 1,
          };
        }
        return pl;
      })
    );
    showToast(`Added to "${targetPl?.name || 'Playlist'}"`, 'folder');
  };

  const removeSongFromPlaylist = async (playlistId: string, songId: string) => {
    await ApiService.removeSongFromPlaylist(playlistId, songId);
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          return {
            ...pl,
            songs: pl.songs.filter((s) => s.id !== songId),
            song_count: Math.max(0, (pl.song_count || 1) - 1),
          };
        }
        return pl;
      })
    );
    showToast(`Removed from playlist`, 'trash');
  };

  const deletePlaylist = async (playlistId: string) => {
    await ApiService.deletePlaylist(playlistId);
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
    const localPls = await StorageService.getLocalPlaylists();
    await StorageService.saveLocalPlaylists(localPls.filter((p) => p.id !== playlistId));
    showToast(`Playlist deleted`, 'trash');
  };

  const setSleepTimer = (minutes: number | null, isEndOfTrack = false) => {
    if (isEndOfTrack) {
      setIsSleepTimerEndOfTrack(true);
      setSleepTimerRemainingSeconds(null);
      showToast('Sleep timer: End of track', 'moon');
    } else if (minutes && minutes > 0) {
      setIsSleepTimerEndOfTrack(false);
      setSleepTimerRemainingSeconds(minutes * 60);
      showToast(`Sleep timer: ${minutes} min`, 'moon');
    } else {
      cancelSleepTimer();
    }
  };

  const cancelSleepTimer = () => {
    setIsSleepTimerEndOfTrack(false);
    setSleepTimerRemainingSeconds(null);
    showToast('Sleep timer turned off', 'moon');
  };

  return (
    <MusicContext.Provider
      value={{
        songs,
        offlineSongs,
        cloudSongs,
        playlists,
        favorites,
        isLoading,
        currentSong,
        isPlaying,
        positionMillis,
        durationMillis,
        isBuffering,
        queue,
        queueIndex,
        repeatMode,
        isShuffle,
        sleepTimerRemainingSeconds,
        isSleepTimerEndOfTrack,
        setSleepTimer,
        cancelSleepTimer,
        toastMessage,
        toastIcon,
        showToast,
        eqPreset,
        setEqPreset,
        dspSettings,
        updateDSPSettings,
        setEQBand,
        applyEQPreset,
        resetDSPToDefaults,
        currentNormalizationInfo: normalizationInfo,
        isOfflineMode,
        toggleOfflineMode,
        playSong,
        togglePlay,
        pauseSong,
        resumeSong,
        seekTo,
        nextSong,
        prevSong,
        addToQueue,
        playNext,
        removeFromQueue,
        clearQueue,
        toggleShuffle,
        toggleRepeat,
        toggleFavorite,
        downloadSongForOffline,
        removeSongOffline,
        deleteSongEverywhere,
        refreshSongs,
        createPlaylist,
        addSongToPlaylist,
        removeSongFromPlaylist,
        deletePlaylist,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => useContext(MusicContext);
