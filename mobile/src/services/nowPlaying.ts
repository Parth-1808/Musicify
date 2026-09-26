import { AudioPlayer } from 'expo-audio';
import { Song } from '../types';

let active = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Clean dirty titles and artist names (e.g., removing "(Official Video)", "VEVO", "[Lyrics]", etc.)
 * and format valid metadata for system lock screen / notification media player.
 */
export function cleanMetadata(song: Partial<Song>): {
  title: string;
  artist: string;
  albumTitle: string;
  artworkUrl?: string;
} {
  let title = (song.title || '').trim();
  let artist = (song.artist || '').trim();

  // Strip YouTube tags like (Official Video), [Lyrics], 4K, HD, etc.
  title = title
    .replace(/\s*[\(\[](?:Official\s*(?:Music\s*)?(?:Video|Audio|Visualizer|Lyric\s*Video)?|Lyrics?|HD|4K|HQ|Audio|Visualizer|Studio\s*Version)[\)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();

  artist = artist
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  // Handle "Artist - Title" embedded in the title string
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      if (!artist || artist === 'Unknown Artist') {
        artist = parts[0].trim();
      }
      title = parts.slice(1).join(' - ').trim();
    }
  }

  // Artwork URL must be valid HTTPS or local file://
  let artworkUrl = song.localArtworkUri || song.artwork_url;
  if (artworkUrl) {
    artworkUrl = artworkUrl.trim();
    if (!artworkUrl.startsWith('http://') && !artworkUrl.startsWith('https://') && !artworkUrl.startsWith('file://')) {
      artworkUrl = undefined;
    }
  }

  return {
    title: title || 'Unknown Title',
    artist: artist || 'Unknown Artist',
    albumTitle: song.album || 'Musify',
    artworkUrl: artworkUrl || undefined,
  };
}

/**
 * Debounced sync with system lock screen / notification media player.
 * The 400ms debounce protects against iOS crashes during rapid track skipping
 * and prevents race conditions with Android MediaSession binder.
 */
export function syncNowPlaying(player: AudioPlayer, song: Partial<Song>) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  timer = setTimeout(() => {
    try {
      const meta = cleanMetadata(song);

      if (!active) {
        player.setActiveForLockScreen(true, meta, {
          showSeekForward: true,
          showSeekBackward: true,
        });
        active = true;
      } else {
        player.updateLockScreenMetadata(meta);
      }
    } catch (e) {
      console.warn('Notice updating lock screen metadata:', e);
    }
  }, 400);
}

/**
 * Clears now playing controls and disables lock screen widget.
 */
export function clearNowPlaying(player?: AudioPlayer | null) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (player) {
    try {
      player.clearLockScreenControls();
    } catch {
      // ignore
    }
    try {
      player.setActiveForLockScreen(false);
    } catch {
      // ignore
    }
  }
  active = false;
}
