import { Audio, AVPlaybackStatus } from 'expo-av';
import { Song } from '../types';

export type PlaybackStatusListener = (status: {
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isBuffering: boolean;
  didJustFinish: boolean;
}) => void;

class AudioService {
  private sound: Audio.Sound | null = null;
  private currentSong: Song | null = null;
  private isConfigured = false;
  private statusListeners: Set<PlaybackStatusListener> = new Set();
  private onTrackFinishedCallback?: () => void;
  private onPlayThresholdCallback?: (song: Song) => void;
  private hasReportedPlay = false;

  async initAudio() {
    if (this.isConfigured) return;
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.isConfigured = true;
    } catch (e) {
      console.warn('Error setting audio mode:', e);
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

    // Unload existing sound
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch (e) {
        console.warn('Error unloading previous sound:', e);
      }
      this.sound = null;
    }

    this.currentSong = song;

    // Prefer local audio file if available
    const uriToPlay = song.localAudioUri || song.audio_url;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: uriToPlay },
        {
          shouldPlay: true,
          positionMillis: startPositionMillis,
          progressUpdateIntervalMillis: 300,
        },
        this.onPlaybackStatusUpdate
      );

      this.sound = sound;
    } catch (error) {
      console.error('Failed to load audio sound:', error);
      throw error;
    }
  }

  private onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error(`Playback Error: ${status.error}`);
      }
      return;
    }

    const { positionMillis, durationMillis = 0, isPlaying, isBuffering, didJustFinish } = status;

    this.notifyStatus({
      isPlaying,
      positionMillis,
      durationMillis: durationMillis || (this.currentSong?.duration ? this.currentSong.duration * 1000 : 0),
      isBuffering,
      didJustFinish: Boolean(didJustFinish),
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
    if (this.sound) {
      await this.sound.playAsync();
    }
  }

  async pause(): Promise<void> {
    if (this.sound) {
      await this.sound.pauseAsync();
    }
  }

  async seekTo(positionMillis: number): Promise<void> {
    if (this.sound) {
      await this.sound.setPositionAsync(positionMillis);
    }
  }

  async stop(): Promise<void> {
    if (this.sound) {
      await this.sound.stopAsync();
    }
  }

  getCurrentSong(): Song | null {
    return this.currentSong;
  }
}

export const audioService = new AudioService();
