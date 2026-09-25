import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Song, Playlist } from '../types';
import { audioService } from '../services/audioService';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { useAuth } from './AuthContext';

interface MusicContextType {
  // Songs & Playlists State
  songs: Song[];
  offlineSongs: Song[];
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

  // Playlist Management
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
}

const MusicContext = createContext<MusicContextType>({} as MusicContextType);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [songs, setSongs] = useState<Song[]>([]);
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    StorageService.init();

    const unsubscribe = audioService.addStatusListener((status) => {
      setIsPlaying(status.isPlaying);
      setPositionMillis(status.positionMillis);
      setDurationMillis(status.durationMillis);
      setIsBuffering(status.isBuffering);
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
      // 1. Get offline songs
      const localOffline = await StorageService.getOfflineSongs();
      setOfflineSongs(localOffline);

      // 2. Get favorites
      const favs = await StorageService.getFavorites();
      setFavorites(favs);

      // 3. Get cloud songs
      const cloudSongs = await ApiService.fetchSongs(user?.id);

      // Merge local offline URIs if song is already cached
      const mergedSongs: Song[] = (cloudSongs.length > 0 ? cloudSongs : localOffline).map((cs) => {
        const matchingOffline = localOffline.find((os) => os.id === cs.id);
        if (matchingOffline) {
          return {
            ...cs,
            isOffline: true,
            localAudioUri: matchingOffline.localAudioUri,
            localArtworkUri: matchingOffline.localArtworkUri,
          };
        }
        return cs;
      });

      // Also ensure offline songs not yet in cloud are present
      localOffline.forEach((os) => {
        if (!mergedSongs.some((s) => s.id === os.id)) {
          mergedSongs.push(os);
        }
      });

      setSongs(mergedSongs);

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
      setSongs((prev) =>
        prev.map((s) => (s.id === songId ? { ...s, play_count: (s.play_count || 0) + 1 } : s))
      );
      setOfflineSongs((prev) =>
        prev.map((s) => (s.id === songId ? { ...s, play_count: (s.play_count || 0) + 1 } : s))
      );

      // Sync with backend & Supabase
      await ApiService.incrementPlayCount(songId);
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
  };

  const playNext = (song: Song) => {
    setQueue((prev) => {
      const copy = [...prev];
      copy.splice(queueIndex + 1, 0, song);
      return copy;
    });
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
    setSongs((prev) =>
      prev.map((s) => (s.id === songId ? { ...s, is_favorite: isNowFav } : s))
    );
  };

  const downloadSongForOffline = async (song: Song, onProgress?: (p: number) => void) => {
    try {
      const offlineVersion = await StorageService.downloadSongOffline(song, onProgress);
      setOfflineSongs((prev) => {
        const filtered = prev.filter((s) => s.id !== song.id);
        return [offlineVersion, ...filtered];
      });
      setSongs((prev) =>
        prev.map((s) =>
          s.id === song.id
            ? {
                ...s,
                isOffline: true,
                localAudioUri: offlineVersion.localAudioUri,
                localArtworkUri: offlineVersion.localArtworkUri,
              }
            : s
        )
      );
    } catch (e) {
      console.error('Offline download failed:', e);
      throw e;
    }
  };

  const removeSongOffline = async (songId: string) => {
    await StorageService.removeSongOffline(songId);
    setOfflineSongs((prev) => prev.filter((s) => s.id !== songId));
    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId
          ? { ...s, isOffline: false, localAudioUri: undefined, localArtworkUri: undefined }
          : s
      )
    );
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

    // 3. Remove local offline file
    await StorageService.removeSongOffline(songId);
    setOfflineSongs((prev) => prev.filter((s) => s.id !== songId));

    // 4. Remove from songs state
    setSongs((prev) => prev.filter((s) => s.id !== songId));

    // 5. Delete on backend and Supabase
    await ApiService.deleteSong(songId, user?.id);
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
      return newPl;
    }

    setPlaylists((prev) => [newPl!, ...prev]);
    return newPl;
  };

  const addSongToPlaylist = async (playlistId: string, songId: string) => {
    const song = songs.find((s) => s.id === songId);
    if (!song) return;

    await ApiService.addSongToPlaylist(playlistId, songId);

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
  };

  const deletePlaylist = async (playlistId: string) => {
    await ApiService.deletePlaylist(playlistId);
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
    const localPls = await StorageService.getLocalPlaylists();
    await StorageService.saveLocalPlaylists(localPls.filter((p) => p.id !== playlistId));
  };

  const setSleepTimer = (minutes: number | null, isEndOfTrack = false) => {
    if (isEndOfTrack) {
      setIsSleepTimerEndOfTrack(true);
      setSleepTimerRemainingSeconds(null);
    } else if (minutes && minutes > 0) {
      setIsSleepTimerEndOfTrack(false);
      setSleepTimerRemainingSeconds(minutes * 60);
    } else {
      cancelSleepTimer();
    }
  };

  const cancelSleepTimer = () => {
    setIsSleepTimerEndOfTrack(false);
    setSleepTimerRemainingSeconds(null);
  };

  return (
    <MusicContext.Provider
      value={{
        songs,
        offlineSongs,
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
