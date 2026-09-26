# 🎵 Musify — Production-Grade Mobile Music Player & Cloud Streamer

Musify is a mobile application that lets you paste YouTube music links or import audio, stream and cache bit-identical audio with **zero generational loss** (stream copy remux into native Opus/M4A containers), sync to **Supabase Cloud**, and save tracks for **100% offline playback**.

Designed with a **dark glassmorphic UI**, background audio playback, queue management, custom playlists, and tracking for **"how many times listened"**.

---

## ✨ Features

- **💎 Zero Generational Loss Audio Pipeline**:
  - Direct stream copy (remux) from source without lossy-to-lossy degradation:
    - **Opus source** $\rightarrow$ bit-identical stream copy into native Ogg Opus container (`.opus`)
    - **AAC source** $\rightarrow$ bit-identical stream copy into native M4A container (`.m4a`)
  - **Multi-Platform Delivery**: Opus for Android/Web, AAC for iOS.
  - **MP3 Compatibility Export**: Optional LAME VBR Q0 (`-c:a libmp3lame -q:a 0`) export for legacy players.
  - **Native Container Tagging**: Full mutagen tagging with embedded artwork (base64 FLAC Picture block for Opus, MP4Cover for M4A, ID3v2.3 for MP3).
  - **Content-Hash Deduplication**: SHA-256 content hashing eliminates duplicate storage and uploads.
- **☁️ Supabase Cloud Storage & Database Sync**:
  - Automatically uploads audio to Supabase Storage (`songs` bucket).
  - Stores artwork in the `artwork` bucket.
  - Keeps track of user songs, playlists, favorites, and listening history in PostgreSQL with Row Level Security (RLS).
- **📱 100% Offline Playback & Local Cache**:
  - "Save for Offline" saves audio files directly into your phone's storage (`expo-file-system`).
  - Listen without internet, WiFi, or mobile data anytime, anywhere.
- **🎧 Playback Experience**:
  - **Background Audio**: Seamless playback when minimizing the app or locking your phone (`expo-audio`).
  - **Lockscreen & Notification Controls**: Media control support built into Android & iOS.
  - **Dynamic Queue**: Up Next list, add to queue, play next, reorder, remove, or clear.
  - **Playlists**: Create custom playlists, add songs, organize collections.
  - **Shuffle & Repeat**: Modes for 'off', 'all', and 'repeat one'.
- **🔥 "How Many Times Listened" (Listening Insights)**:
  - Tracks every time you listen to a song for 30+ seconds or finish it.
  - Displays play counts directly on song cards (e.g. `🔥 24 plays`).
  - Dedicated **Stats Screen** showing your `#1 Most Streamed Song`, total listening hours, and listening leaderboard.
- **🔒 Email & Password Authentication**:
  - Secure authentication powered by Supabase Auth.
  - Includes a **Guest / Demo Mode** option so you can test the app immediately.
- **🎨 Glassmorphic Theme**:
  - Deep obsidian theme (`#08090D`) with frosted glass blur cards (`expo-blur`), neon green glow (`#1DB954`), and cyan/purple accents.

---

## 🚀 Quick Start Guide

### 1. Launch the Audio Engine (Docker or Python)

Musify includes a FastAPI backend that handles source extraction, stream copy remuxing, metadata probing, and Supabase synchronization.

**Option A: Docker Compose**
```bash
docker compose up -d --build
```

**Option B: Direct Local Python**
```powershell
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```
*(The server is currently running in the background on `http://localhost:8000`)*

### 2. Start the Mobile App (Expo / React Native)

In a new terminal window:
```powershell
cd c:\Users\bachh\Downloads\musify\mobile
npx expo start
```
- **First-Time Launch**: On the first opening after download, Musify displays the **Environment Setup Modal** indicating the **42.8 MB** package (Audio DSP Codecs, GPU Shaders, and Offline Cache Partition) and calibrates your device GPU!
- **To test in your Web Browser**: Press `w` (or preview on `http://localhost:8081`).
- **To test on your Android / iOS Phone**: Install **Expo Go** from Google Play Store or Apple App Store, and scan the QR code!

---

## 🗄️ Supabase Setup (Optional for Cloud Sync)

The app works **immediately out-of-the-box in local offline mode**, but to enable cloud sync:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard and run the script in:
   [`server/supabase_schema.sql`](file:///c:/Users/bachh/Downloads/musify/server/supabase_schema.sql)
   *(This automatically creates the tables `profiles`, `songs`, `playlists`, `playlist_songs`, `listening_history`, indexes, and public storage buckets `songs` and `artwork`).*
3. Copy your **Project URL** and **anon public key** from *Project Settings -> API*.
4. You can either:
   - Paste them in the app under **Settings -> Supabase Cloud Configuration**, OR
   - Put them in `server/.env`:
     ```env
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_ANON_KEY=your-anon-public-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
     ```

---

## 📁 Project Architecture

```
musify/
├── package.json               # Root scripts
├── README.md                  # Project documentation
├── server/                    # Python Audio Extraction & Supabase Sync Engine
│   ├── main.py                # FastAPI server (API routes, streaming)
│   ├── audio_pipeline.py      # Production audio pipeline (remux, variants, mutagen tags)
│   ├── requirements.txt       # Python dependencies
│   ├── supabase_schema.sql    # Complete SQL schema & RLS policies
│   ├── .env.example           # Environment template
│   ├── downloads/             # Local audio cache
│   ├── artwork/               # High-res cover art cache
│   └── metadata/              # Song metadata cache
└── mobile/                    # React Native / Expo Mobile App
    ├── App.tsx                # Main app entry point & bottom navigation
    ├── app.json               # Audio background mode & permissions
    ├── package.json           # Mobile dependencies
    └── src/
        ├── types/             # TypeScript models (Song, Playlist, Quality)
        ├── theme/             # Glassmorphism design system & colors
        ├── config/            # Supabase & backend API configuration
        ├── services/
        │   ├── audioService.ts   # expo-av background playback & play counter
        │   ├── storageService.ts # Local offline file cache & persistence
        │   └── apiService.ts     # YouTube download & Supabase API
        ├── context/
        │   ├── AuthContext.tsx   # Supabase Auth & Guest mode
        │   └── MusicContext.tsx  # Global player state, queue & playlists
        ├── components/
        │   ├── GlassCard.tsx        # Frosted glass container
        │   ├── GlassButton.tsx      # Neon glowing button
        │   ├── SongListItem.tsx     # Song row with play count badge & menu
        │   ├── MiniPlayer.tsx       # Floating glass mini-player
        │   ├── FullPlayerModal.tsx  # Spotify-tier full screen music player
        │   ├── DownloadModal.tsx    # YouTube URL downloader with 320k selector
        │   ├── QueueModal.tsx       # Up next playback queue manager
        │   └── PlaylistModal.tsx    # Add to playlist & playlist creator
        └── screens/
            ├── HomeScreen.tsx     # Greeting, download banner, most played
            ├── LibraryScreen.tsx  # All tracks, offline, favorites, playlists, search
            ├── StatsScreen.tsx    # "How many times listened" insights & leaderboard
            ├── SettingsScreen.tsx # Supabase config, storage management, audio info
            └── AuthScreen.tsx     # Sign in / Sign up with email & password
```
