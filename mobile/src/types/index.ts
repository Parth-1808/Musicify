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
  likes_count?: number;
  bitrate?: string;
  format?: string;
  source_url?: string;
  source_id?: string;
  is_favorite?: boolean;
  user_id?: string;
  created_at?: string;
  integrated_lufs?: number;
  true_peak_dbtp?: number;
  loudness_range?: number;
  content_hash?: string;
  source_codec?: string;
  source_bitrate_kbps?: number;
  sample_rate?: number;
  channels?: number;
  audio_version?: number;
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
  id: 'native' | 'mp3_compat' | 'ultra_320k';
  name: string;
  description: string;
  badge: string;
  tag: string;
  icon: 'diamond';
}

export const QUALITY_OPTIONS: AudioQualityOption[] = [
  {
    id: 'native',
    name: 'Native Bit-Identical Stream',
    description: 'Direct stream copy (remux) from source with zero generational loss. No lossy-to-lossy degradation.',
    badge: 'Native Remux',
    tag: 'Zero Loss',
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

export interface TopListener {
  userId: string;
  name: string;
  avatarUrl?: string;
  totalPlays: number;
  totalHours: string;
  rank: number;
  badge: string;
  isCurrentUser?: boolean;
}

export interface UserQuota {
  paywall_enabled: boolean;
  is_vip: boolean;
  has_unlimited_access: boolean;
  base_quota: number;
  bonus_quota: number;
  total_quota: number;
  used_songs: number;
  remaining_songs: number;
  can_add_song: boolean;
  referral_code: string;
  total_referrals: number;
  vip_conversions: number;
  referred_by?: string | null;
}


