import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioStatus } from 'expo-audio';
import { Song } from '../types';

export type PlaybackStatusListener = (status: {
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isBuffering: boolean;
  didJustFinish: boolean;
}) => void;

class AudioService {
  private player: AudioPlayer | null = null;
  private statusSubscription: { remove: () => void } | null = null;
  private currentSong: Song | null = null;
  private isConfigured = false;
  private statusListeners: Set<PlaybackStatusListener> = new Set();
  private onTrackFinishedCallback?: () => void;
  private onPlayThresholdCallback?: (song: Song) => void;
  private hasReportedPlay = false;

  async initAudio() {
    if (this.isConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      this.isConfigured = true;
    } catch (e) {
      console.warn('Notice setting expo-audio mode:', e);
    }
  }

  setTrackFinishedCallback(cb: () => void) {
    this.onTrackFinishedCallback = cb;
  }

  setPlayThresholdCallback(cb: (song: Song) => void) {
    this.onPlayThresholdCallback = cb;
  }

  addStatusListener(listener: PlaybackStatusListener) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatus(status: {
    isPlaying: boolean;
    positionMillis: number;
    durationMillis: number;
    isBuffering: boolean;
    didJustFinish: boolean;
  }) {
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('Status listener error:', err);
      }
    });
  }

  async loadAndPlay(song: Song, startPositionMillis = 0): Promise<void> {
    await this.initAudio();

    // Reset play count reporting flag for new song
    this.hasReportedPlay = false;

    // Release existing player
    if (this.statusSubscription) {
      try {
        this.statusSubscription.remove();
      } catch {
        // ignore
      }
      this.statusSubscription = null;
    }

    if (this.player) {
      try {
        this.player.pause();
        this.player.remove();
      } catch (e) {
        console.warn('Notice cleaning previous player:', e);
      }
      this.player = null;
    }

    this.currentSong = song;

    // Prefer local audio file if available
    const uriToPlay = song.localAudioUri || song.audio_url;

    try {
      const newPlayer = createAudioPlayer(uriToPlay, {
        updateInterval: 250,
      });

      this.player = newPlayer;

      this.statusSubscription = newPlayer.addListener('playbackStatusUpdate', this.onPlaybackStatusUpdate);

      try {
        newPlayer.setActiveForLockScreen(true, {
          title: song.title,
          artist: song.artist,
          artworkUrl: song.artwork_url,
        });
      } catch {
        // Non-fatal if lock screen metadata fails
      }

      if (startPositionMillis > 0) {
        await newPlayer.seekTo(startPositionMillis / 1000);
      }

      newPlayer.play();
    } catch (error) {
      console.error('Failed to load audio with expo-audio:', error);
      throw error;
    }
  }

  private onPlaybackStatusUpdate = (status: AudioStatus) => {
    const positionMillis = Math.round((status.currentTime || 0) * 1000);
    const durationMillis =
      Math.round((status.duration || 0) * 1000) ||
      (this.currentSong?.duration ? this.currentSong.duration * 1000 : 0);

    const isPlaying = Boolean(status.playing);
    const isBuffering = Boolean(status.isBuffering);
    const didJustFinish = Boolean(status.didJustFinish);

    this.notifyStatus({
      isPlaying,
      positionMillis,
      durationMillis,
      isBuffering,
      didJustFinish,
    });

    // Check if listened for at least 30 seconds or 50% of track
    if (!this.hasReportedPlay && this.currentSong) {
      const targetMillis = Math.min(30000, (durationMillis || 60000) * 0.5);
      if (positionMillis >= targetMillis || didJustFinish) {
        this.hasReportedPlay = true;
        if (this.onPlayThresholdCallback) {
          this.onPlayThresholdCallback(this.currentSong);
        }
      }
    }

    if (didJustFinish) {
      if (this.onTrackFinishedCallback) {
        this.onTrackFinishedCallback();
      }
    }
  };

  async play(): Promise<void> {
    try {
      if (this.player) {
        this.player.play();
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  async pause(): Promise<void> {
    try {
      if (this.player) {
        this.player.pause();
      }
    } catch (e) {
      console.warn('Audio pause error:', e);
    }
  }

  async seekTo(positionMillis: number): Promise<void> {
    try {
      if (this.player) {
        await this.player.seekTo(Math.max(0, positionMillis / 1000));
      }
    } catch (e) {
      console.warn('Audio seek error:', e);
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.player) {
        this.player.pause();
        await this.player.seekTo(0);
      }
    } catch (e) {
      console.warn('Audio stop error:', e);
    }
  }

  getCurrentSong(): Song | null {
    return this.currentSong;
  }
}

export const audioService = new AudioService();
