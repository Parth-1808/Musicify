export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  audio_url: string;
  artwork_url?: string;
  localAudioUri?: string;
  localArtworkUri?: string;
  isOffline?: boolean;
  play_count: number;
  bitrate?: string;
  format?: string;
  source_url?: string;
  source_id?: string;
  is_favorite?: boolean;
  user_id?: string;
  created_at?: string;
}

export interface Playlist {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  cover_url?: string;
  songs: Song[];
  song_count?: number;
  created_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

export interface AudioQualityOption {
  id: 'ultra_320k';
  name: string;
  description: string;
  badge: string;
  tag: string;
  icon: 'diamond';
}

export const QUALITY_OPTIONS: AudioQualityOption[] = [
  {
    id: 'ultra_320k',
    name: '320 kbps Ultra Studio Master',
    description: '48kHz CBR Master encoded at maximum LAME precision with full dynamic range. Exceeds standard Spotify Free (160k) and matches Spotify Premium.',
    badge: '320K MP3 @ 48kHz',
    tag: 'Ultra Hi-Fi',
    icon: 'diamond',
  },
];

export interface SleepTimerOption {
  label: string;
  minutes: number | null; // null represents 'end of current track'
  isEndOfTrack?: boolean;
}

export const SLEEP_TIMER_OPTIONS: SleepTimerOption[] = [
  { label: '5 minutes', minutes: 5 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: 'End of current track', minutes: null, isEndOfTrack: true },
];

export interface ListeningStats {
  totalPlays: number;
  totalTimeMinutes: number;
  topSongs: Song[];
  favoriteCount: number;
  offlineCount: number;
}
