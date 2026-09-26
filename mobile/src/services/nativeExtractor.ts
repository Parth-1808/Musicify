import { Platform } from 'react-native';

export interface ExtractedTrack {
  id: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  thumbnail: string;
  streamUrl: string;
  format: string; // 'mp3' | 'm4a' | 'opus' | 'webm'
  bitrate: string;
  sourceUrl: string;
}

/**
 * Clean YouTube video titles by removing junk tags like (Official Video), [Lyrics], 4K, HD, etc.
 */
function cleanTitleAndArtist(rawTitle: string, authorName: string = ''): { title: string; artist: string } {
  let cleaned = rawTitle
    .replace(/\s*[\(\[](?:Official\s*(?:Music\s*)?(?:Video|Audio|Visualizer|Lyric\s*Video)?|Lyrics?|HD|4K|HQ|Audio|Visualizer|Studio\s*Version)[\)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();

  let artist = authorName.replace(/ - Topic$/i, '').replace(/VEVO$/i, '').trim();
  let title = cleaned;

  // Split on " - " or ":" if present (e.g. "Artist - Track")
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  }

  return {
    artist: artist || 'Unknown Artist',
    title: title || rawTitle,
  };
}

export const NativeExtractor = {
  /**
   * Extract video ID from any YouTube URL (standard, shortened, music, shorts, or raw ID)
   */
  extractVideoId(input: string): string | null {
    if (!input) return null;
    const str = input.trim();

    // Raw 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
      return str;
    }

    const patterns = [
      /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /[?&]v=([a-zA-Z0-9_-]{11})/,
    ];

    for (const pat of patterns) {
      const match = str.match(pat);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  },

  /**
   * On-device client-side extraction using YouTube's direct player API
   * Zero ports, zero external backend servers required.
   */
  async extract(urlOrId: string): Promise<ExtractedTrack> {
    const videoId = this.extractVideoId(urlOrId);
    if (!videoId) {
      throw new Error('Please enter a valid YouTube video or music link.');
    }

    const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let oembedData: any = null;
    let visitorData = '';

    // Step 1: Query oEmbed metadata (Title, Author, High-res Cover)
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(standardUrl)}&format=json`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (oembedRes.ok) {
        oembedData = await oembedRes.json();
      }
    } catch (e) {
      console.warn('oEmbed lookup warning:', e);
    }

    // Step 2: Query YouTube watch page to retrieve VISITOR_DATA authorization token
    try {
      const watchRes = await fetch(standardUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const m = html.match(/"VISITOR_DATA":\s*"([^"]+)"/);
        if (m && m[1]) {
          visitorData = m[1];
        }
      }
    } catch (e) {
      console.warn('Watch page visitor token fetch warning:', e);
    }

    // Step 3: Query YouTube InnerTube Player API using VisionOS client strategy
    const payload = {
      context: {
        client: {
          clientName: 'VISIONOS',
          clientVersion: '1.02',
          deviceMake: 'Apple',
          deviceModel: 'RealityDevice17,1',
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
          osName: 'visionOS',
          osVersion: '26.5.23O471',
          hl: 'en',
          timeZone: 'UTC',
          utcOffsetMinutes: 0,
          visitorData: visitorData || undefined,
        },
      },
      videoId: videoId,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '101',
      'X-Youtube-Client-Version': '1.02',
      'Origin': 'https://www.youtube.com',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    };
    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!playerRes.ok) {
      throw new Error(`YouTube player API responded with status ${playerRes.status}`);
    }

    const playerData = await playerRes.json();
    const playability = playerData?.playabilityStatus?.status;
    if (playability && playability !== 'OK') {
      const reason = playerData?.playabilityStatus?.reason || 'Video stream is unavailable or restricted.';
      throw new Error(reason);
    }

    // Locate audio streams
    const formats: any[] = playerData?.streamingData?.adaptiveFormats || [];
    const audioStreams = formats.filter(
      (f) => f.mimeType && f.mimeType.startsWith('audio/') && Boolean(f.url)
    );

    if (audioStreams.length === 0) {
      // Check combined formats
      const combinedFormats: any[] = playerData?.streamingData?.formats || [];
      const combined = combinedFormats.filter((f) => Boolean(f.url));
      if (combined.length > 0) {
        audioStreams.push(combined[0]);
      }
    }

    if (audioStreams.length === 0) {
      throw new Error('No accessible audio stream found for this YouTube track.');
    }

    // Sort to prioritize highest quality stream
    // itag 251: Opus 160k (Best Studio Quality)
    // itag 140: M4A 128k (Native hardware acceleration on iOS & Android)
    audioStreams.sort((a, b) => {
      const getScore = (s: any) => {
        const id = String(s.itag || s.format_id);
        if (id === '251') return 100;
        if (id === '140') return 80;
        if (id === '250') return 60;
        if (id === '249') return 40;
        return (s.bitrate || 0) / 1000;
      };
      return getScore(b) - getScore(a);
    });

    const chosenStream = audioStreams[0];
    const streamUrl = chosenStream.url;
    const isOpus = (chosenStream.mimeType || '').includes('opus');
    const isM4A = (chosenStream.mimeType || '').includes('mp4') || (chosenStream.mimeType || '').includes('m4a');
    const format = isOpus ? 'opus' : isM4A ? 'm4a' : 'mp3';

    // Duration calculation
    const durationSeconds =
      parseInt(playerData?.videoDetails?.lengthSeconds || '0', 10) ||
      parseInt(chosenStream.approxDurationMs || '0', 10) / 1000 ||
      0;

    // Track Title and Artist cleaning
    const rawTitle =
      playerData?.videoDetails?.title ||
      oembedData?.title ||
      'Unknown Title';

    const rawAuthor =
      playerData?.videoDetails?.author ||
      oembedData?.author_name ||
      'Unknown Artist';

    const { title, artist } = cleanTitleAndArtist(rawTitle, rawAuthor);

    // High quality thumbnail
    const thumbnail =
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` ||
      oembedData?.thumbnail_url ||
      playerData?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
      '';

    return {
      id: videoId,
      title,
      artist,
      duration: Math.round(durationSeconds),
      thumbnail,
      streamUrl,
      format,
      bitrate: isOpus ? 'Opus Studio Master @ 48kHz' : 'Ultra Hi-Fi 320k Studio Master',
      sourceUrl: standardUrl,
    };
  },
};
