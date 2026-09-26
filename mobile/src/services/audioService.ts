import { Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  AudioPlayer,
  AudioStatus,
} from 'expo-audio';
import { Song } from '../types';
import { syncNowPlaying, clearNowPlaying } from './nowPlaying';
import {
  dspEngine,
  calculateNormalizationGain,
  LoudnessGainResult,
  DSPSettings,
} from './dspEngine';

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
  private currentNormGain: LoudnessGainResult | null = null;
  private volumeFadeInterval: any = null;

  constructor() {
    dspEngine.subscribe((settings) => {
      this.onDSPSettingsChanged(settings);
    });
  }

  async initAudio() {
    if (this.isConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
        interruptionModeAndroid: 'doNotMix',
      });

      if (Platform.OS === 'android') {
        try {
          await requestNotificationPermissionsAsync();
        } catch {
          // Non-fatal if permission request fails or is already determined
        }
      }

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
    this.currentSong = song;

    // Prefer local audio file if available
    const uriToPlay = song.localAudioUri || song.audio_url;

    try {
      if (!this.player) {
        // Single player for the whole app
        const newPlayer = createAudioPlayer(uriToPlay, {
          updateInterval: 250,
        });
        this.player = newPlayer;
        this.statusSubscription = newPlayer.addListener('playbackStatusUpdate', this.onPlaybackStatusUpdate);
      } else {
        // Switch songs with player.replace() to prevent multiple conflicting MediaSessions on Android
        try {
          this.player.replace(uriToPlay);
        } catch (replaceErr) {
          console.warn('Notice replacing player source, re-creating single player:', replaceErr);
          if (this.statusSubscription) {
            try {
              this.statusSubscription.remove();
            } catch {
              // ignore
            }
            this.statusSubscription = null;
          }
          try {
            this.player.remove();
          } catch {
            // ignore
          }
          this.player = createAudioPlayer(uriToPlay, {
            updateInterval: 250,
          });
          this.statusSubscription = this.player.addListener('playbackStatusUpdate', this.onPlaybackStatusUpdate);
        }
      }

      if (startPositionMillis > 0) {
        await this.player.seekTo(startPositionMillis / 1000);
      }

      this.player.play();

      // Apply real-time loudness normalization gain smoothly over 100ms
      this.applyNormalizationGain(song);

      // Debounced metadata synchronization for lock screen & system media player
      syncNowPlaying(this.player, song);
    } catch (error) {
      console.error('Failed to load audio with expo-audio:', error);
      throw error;
    }
  }

  private applyNormalizationGain(song?: Song | null) {
    if (!this.player) return;
    const targetSong = song || this.currentSong;
    const settings = dspEngine.getSettings();

    if (settings.enhancementEnabled && settings.normalizationEnabled) {
      const result = calculateNormalizationGain(
        targetSong?.integrated_lufs,
        targetSong?.true_peak_dbtp,
        settings.targetLufs
      );
      this.currentNormGain = result;
      this.rampVolumeSmoothly(Math.min(1.0, Math.max(0.05, result.linearGain)), 100);
    } else {
      this.currentNormGain = null;
      this.rampVolumeSmoothly(1.0, 100);
    }

    if (Platform.OS === 'web' && (this.player as any)?.media) {
      dspEngine.webGraph.init((this.player as any).media);
      dspEngine.webGraph.updateSettings(
        settings,
        targetSong?.integrated_lufs,
        targetSong?.true_peak_dbtp
      );
    }
  }

  private rampVolumeSmoothly(targetVolume: number, durationMs: number = 100) {
    if (!this.player) return;
    if (this.volumeFadeInterval) {
      clearInterval(this.volumeFadeInterval);
      this.volumeFadeInterval = null;
    }

    const startVolume = typeof this.player.volume === 'number' ? this.player.volume : 1.0;
    const steps = 5;
    const stepDuration = Math.max(10, Math.floor(durationMs / steps));
    let step = 0;

    this.volumeFadeInterval = setInterval(() => {
      if (!this.player) {
        if (this.volumeFadeInterval) clearInterval(this.volumeFadeInterval);
        return;
      }
      step++;
      const current = startVolume + (targetVolume - startVolume) * (step / steps);
      try {
        this.player.volume = Number(Math.max(0.0, Math.min(1.0, current)).toFixed(3));
      } catch {
        // ignore
      }

      if (step >= steps) {
        if (this.volumeFadeInterval) {
          clearInterval(this.volumeFadeInterval);
          this.volumeFadeInterval = null;
        }
        try {
          this.player.volume = targetVolume;
        } catch {
          // ignore
        }
      }
    }, stepDuration);
  }

  private onDSPSettingsChanged(settings: DSPSettings) {
    this.applyNormalizationGain(this.currentSong);
  }

  getCurrentNormalizationInfo() {
    return {
      normGain: this.currentNormGain,
      songLufs: this.currentSong?.integrated_lufs ?? null,
      songTruePeak: this.currentSong?.true_peak_dbtp ?? null,
    };
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
        if (this.currentSong) {
          syncNowPlaying(this.player, this.currentSong);
        }
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
        clearNowPlaying(this.player);
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
