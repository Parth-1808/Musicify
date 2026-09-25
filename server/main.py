import os
import re
import uuid
import json
import shutil
import asyncio
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
import yt_dlp
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB
import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Ensure ffmpeg and ffprobe are available in any cloud environment (Render, Railway, Linux)
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception as e:
    pass

app = FastAPI(title="Musify Backend", description="High-Quality YouTube Audio Extractor & Supabase Sync Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories for local cache and downloads
BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
ARTWORK_DIR = BASE_DIR / "artwork"
METADATA_DIR = BASE_DIR / "metadata"

DOWNLOADS_DIR.mkdir(exist_ok=True)
ARTWORK_DIR.mkdir(exist_ok=True)
METADATA_DIR.mkdir(exist_ok=True)

# Supabase Client Initialization
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", ""))

supabase_client: Optional[Client] = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        print("Connected to Supabase Cloud Storage & Database!")
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}")

class VideoInfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    quality: Optional[str] = "ultra_320k" # "ultra_320k", "opus_256k", "flac_lossless"
    user_id: Optional[str] = None
    upload_to_supabase: Optional[bool] = True

def clean_title(title: str) -> tuple[str, str]:
    """Extract clean title and artist if formatted as 'Artist - Title'"""
    # Remove common video tags
    cleaned = re.sub(r'\(Official (Video|Music Video|Audio|Lyric Video|HD|4K|Visualizer)\)', '', title, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[Official (Video|Music Video|Audio|Lyric Video|HD|4K|Visualizer)\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\(Audio\)', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[Audio\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\(Lyrics?\)', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[Lyrics?\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()

    if " - " in cleaned:
        parts = cleaned.split(" - ", 1)
        artist = parts[0].strip()
        song_title = parts[1].strip()
        return artist, song_title
    
    return "Various Artists", cleaned

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Musify Audio Engine",
        "supabase_connected": supabase_client is not None,
        "features": [
            "Ultra Hi-Fi 320kbps MP3 & Lossless extraction",
            "Supabase Cloud Storage & Database Sync",
            "Offline Local File Serving",
            "YouTube Metadata & High-Res Artwork scraping"
        ]
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
    }

@app.post("/api/info")
def get_video_info(req: VideoInfoRequest):
    """Fetch video metadata without downloading"""
    ydl_opts = {
        'skip_download': True,
        'extract_flat': False,
        'quiet': True,
        'no_warnings': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android']
            }
        },
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            if not info:
                raise HTTPException(status_code=400, detail="Could not extract video info")
            
            raw_title = info.get('title', 'Unknown Title')
            artist, title = clean_title(raw_title)
            if info.get('artist'):
                artist = info.get('artist')
            elif info.get('uploader') and artist == "Various Artists":
                artist = info.get('uploader')

            # Extract best thumbnail
            thumbnails = info.get('thumbnails', [])
            best_thumb = info.get('thumbnail')
            if thumbnails:
                # Get the highest resolution thumbnail
                best_thumb = thumbnails[-1].get('url', best_thumb)

            duration = info.get('duration', 0)
            mins = duration // 60
            secs = duration % 60
            duration_formatted = f"{mins}:{secs:02d}"

            return {
                "id": info.get('id'),
                "title": title,
                "artist": artist,
                "raw_title": raw_title,
                "duration": duration,
                "duration_formatted": duration_formatted,
                "thumbnail": best_thumb,
                "view_count": info.get('view_count', 0),
                "channel": info.get('uploader', 'Unknown Channel'),
                "url": req.url
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch YouTube details: {str(e)}")

@app.post("/api/download")
async def download_track(req: DownloadRequest):
    """Download audio in higher quality than Spotify, embed tags, and sync to Supabase"""
    song_uuid = str(uuid.uuid4())
    temp_dir = BASE_DIR / "temp" / song_uuid
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Determine audio format & bitrate with studio master settings
        audio_ext = "mp3"
        bitrate_str = "320k"
        postprocessor_codec = "mp3"
        quality_label = "320kbps Studio Master (48kHz)"
        ffmpeg_args = [
            '-ar', '48000', # 48kHz High-Resolution Audio
            '-b:a', '320k', # True 320kbps
            '-q:a', '0',   # Max LAME VBR/CBR encoder precision
        ]

        if req.quality == "flac_lossless":
            audio_ext = "flac"
            postprocessor_codec = "flac"
            bitrate_str = "lossless"
            quality_label = "24-bit/48kHz Lossless FLAC Master"
            ffmpeg_args = [
                '-ar', '48000',
                '-sample_fmt', 's24', # 24-bit depth for high dynamic range
            ]
        elif req.quality == "opus_256k":
            audio_ext = "opus"
            postprocessor_codec = "opus"
            bitrate_str = "256k"
            quality_label = "256kbps Acoustic Studio Opus"
            ffmpeg_args = [
                '-ar', '48000',
                '-b:a', '256k',
                '-vbr', 'on',
                '-compression_level', '10',
            ]

        output_template = str(temp_dir / f"%(id)s.%(ext)s")

        ydl_opts = {
            # Pick absolute best available audio stream (Opus 48k or AAC 256k)
            'format': 'bestaudio/best',
            'outtmpl': output_template,
            'writethumbnail': True,
            'quiet': True,
            'no_warnings': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android']
                }
            },
            'postprocessors': [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': postprocessor_codec,
                    'preferredquality': bitrate_str if bitrate_str != "lossless" else None,
                },
                {
                    'key': 'FFmpegMetadata',
                    'add_metadata': True,
                }
            ],
            'postprocessor_args': {
                'FFmpegExtractAudio': ffmpeg_args
            }
        }

        # Run yt-dlp in threadpool
        loop = asyncio.get_event_loop()
        def run_ytdl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(req.url, download=True)

        info = await loop.run_in_executor(None, run_ytdl)
        if not info:
            raise HTTPException(status_code=400, detail="Failed to download audio track")

        video_id = info.get('id', song_uuid)
        raw_title = info.get('title', 'Unknown Title')
        detected_artist, title = clean_title(raw_title)
        artist = info.get('artist') or detected_artist or info.get('uploader') or "Unknown Artist"
        duration = info.get('duration', 0)

        # Locate downloaded audio file
        converted_audio_path = temp_dir / f"{video_id}.{audio_ext}"
        if not converted_audio_path.exists():
            # Find any file in temp_dir with target extension
            matches = list(temp_dir.glob(f"*.{audio_ext}"))
            if matches:
                converted_audio_path = matches[0]
            else:
                raise HTTPException(status_code=500, detail="Audio conversion failed")

        # Locate downloaded artwork thumbnail
        thumbnail_path = None
        for img_ext in ['jpg', 'jpeg', 'png', 'webp']:
            thumb_candidate = temp_dir / f"{video_id}.{img_ext}"
            if thumb_candidate.exists():
                thumbnail_path = thumb_candidate
                break
        
        # If thumbnail not found on disk, download directly from info['thumbnail']
        thumb_url = info.get('thumbnail')
        final_thumb_filename = f"{song_uuid}.jpg"
        final_thumb_path = ARTWORK_DIR / final_thumb_filename

        if thumb_url and (not thumbnail_path or not thumbnail_path.exists()):
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(thumb_url, timeout=10.0)
                    if resp.status_code == 200:
                        final_thumb_path.write_bytes(resp.content)
                        thumbnail_path = final_thumb_path
            except Exception as e:
                print(f"Could not download thumbnail fallback: {e}")
        elif thumbnail_path and thumbnail_path.exists():
            shutil.copyfile(thumbnail_path, final_thumb_path)
            thumbnail_path = final_thumb_path

        # Embed ID3 tags & Artwork into MP3
        if audio_ext == "mp3" and converted_audio_path.exists():
            try:
                audio = MP3(str(converted_audio_path), ID3=ID3)
                try:
                    audio.add_tags()
                except Exception:
                    pass
                audio.tags.add(TIT2(encoding=3, text=title))
                audio.tags.add(TPE1(encoding=3, text=artist))
                audio.tags.add(TALB(encoding=3, text="Musify Ultra Hi-Fi"))
                if final_thumb_path.exists():
                    with open(final_thumb_path, 'rb') as art:
                        audio.tags.add(
                            APIC(
                                encoding=3,
                                mime='image/jpeg',
                                type=3, # Front cover
                                desc='Cover',
                                data=art.read()
                            )
                        )
                audio.save()
            except Exception as tag_err:
                print(f"Failed to embed ID3 tags: {tag_err}")

        # Move audio to permanent downloads directory
        final_audio_filename = f"{song_uuid}.{audio_ext}"
        permanent_audio_path = DOWNLOADS_DIR / final_audio_filename
        shutil.copyfile(converted_audio_path, permanent_audio_path)

        file_size = permanent_audio_path.stat().st_size

        # URLs
        local_audio_url = f"/api/audio/{final_audio_filename}"
        local_artwork_url = f"/api/artwork/{final_thumb_filename}"

        supabase_audio_url = None
        supabase_artwork_url = None

        # Upload to Supabase if configured & requested
        if supabase_client and req.upload_to_supabase:
            try:
                user_folder = req.user_id if req.user_id else "global"
                
                # 1. Upload audio to 'tracks' or 'songs' bucket
                storage_audio_path = f"{user_folder}/{final_audio_filename}"
                for target_bucket in ["tracks", "songs"]:
                    try:
                        with open(permanent_audio_path, "rb") as f:
                            supabase_client.storage.from_(target_bucket).upload(
                                path=storage_audio_path,
                                file=f,
                                file_options={"content-type": f"audio/{audio_ext}", "x-upsert": "true"}
                            )
                        supabase_audio_url = supabase_client.storage.from_(target_bucket).get_public_url(storage_audio_path)
                        break
                    except Exception as b_err:
                        continue

                # 2. Upload artwork to 'artwork' or 'tracks' bucket
                if final_thumb_path.exists():
                    storage_art_path = f"{user_folder}/{final_thumb_filename}"
                    for art_bucket in ["artwork", "tracks"]:
                        try:
                            upload_path = storage_art_path if art_bucket == "artwork" else f"artwork/{storage_art_path}"
                            with open(final_thumb_path, "rb") as f:
                                supabase_client.storage.from_(art_bucket).upload(
                                    path=upload_path,
                                    file=f,
                                    file_options={"content-type": "image/jpeg", "x-upsert": "true"}
                                )
                            supabase_artwork_url = supabase_client.storage.from_(art_bucket).get_public_url(upload_path)
                            break
                        except Exception:
                            continue

                # 3. Insert song record into 'songs' table if user_id is provided
                if req.user_id:
                    song_data = {
                        "id": song_uuid,
                        "user_id": req.user_id,
                        "title": title,
                        "artist": artist,
                        "album": "Musify",
                        "duration": duration,
                        "audio_url": supabase_audio_url or local_audio_url,
                        "artwork_url": supabase_artwork_url or local_artwork_url,
                        "source_url": req.url,
                        "source_id": video_id,
                        "bitrate": quality_label,
                        "format": audio_ext,
                        "play_count": 0,
                        "file_size": file_size,
                        "is_favorite": False
                    }
                    supabase_client.table("songs").insert(song_data).execute()
            except Exception as sb_err:
                print(f"Supabase upload warning: {sb_err}")

        # Save metadata record locally
        meta_record = {
            "id": song_uuid,
            "title": title,
            "artist": artist,
            "duration": duration,
            "audio_url": supabase_audio_url or local_audio_url,
            "artwork_url": supabase_artwork_url or local_artwork_url,
            "local_audio_url": local_audio_url,
            "local_artwork_url": local_artwork_url,
            "source_url": req.url,
            "source_id": video_id,
            "bitrate": quality_label,
            "format": audio_ext,
            "play_count": 0,
            "file_size": file_size,
            "created_at": None
        }
        (METADATA_DIR / f"{song_uuid}.json").write_text(json.dumps(meta_record, indent=2))

        return {
            "success": True,
            "song": meta_record,
            "supabase_synced": bool(supabase_audio_url)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.get("/api/audio/{filename}")
def stream_audio(filename: str, range: Optional[str] = Header(None)):
    """Serve audio stream supporting byte-range requests for seeking and fast buffering"""
    file_path = DOWNLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    file_size = file_path.stat().st_size
    mime_type = "audio/mpeg"
    if filename.endswith(".opus"):
        mime_type = "audio/opus"
    elif filename.endswith(".flac"):
        mime_type = "audio/flac"

    if range:
        byte1, byte2 = 0, None
        match = re.search(r'bytes=(\d+)-(\d*)', range)
        if match:
            groups = match.groups()
            byte1 = int(groups[0])
            if groups[1]:
                byte2 = int(groups[1])
        if byte2 is None or byte2 >= file_size:
            byte2 = file_size - 1

        length = byte2 - byte1 + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(byte1)
                yield f.read(length)

        headers = {
            "Content-Range": f"bytes {byte1}-{byte2}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": mime_type,
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    return FileResponse(file_path, media_type=mime_type, filename=filename)

@app.get("/api/artwork/{filename}")
def get_artwork(filename: str):
    file_path = ARTWORK_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Artwork not found")
    return FileResponse(file_path, media_type="image/jpeg")

@app.get("/api/songs")
def list_local_songs():
    """List all locally processed songs"""
    songs = []
    for meta_file in METADATA_DIR.glob("*.json"):
        try:
            data = json.loads(meta_file.read_text())
            songs.append(data)
        except Exception:
            pass
    return {"songs": sorted(songs, key=lambda s: s.get('id', ''), reverse=True)}

@app.post("/api/play/{song_id}")
def record_play(song_id: str):
    """Increment play count locally and in Supabase"""
    meta_file = METADATA_DIR / f"{song_id}.json"
    play_count = 1
    if meta_file.exists():
        try:
            data = json.loads(meta_file.read_text())
            data["play_count"] = data.get("play_count", 0) + 1
            play_count = data["play_count"]
            meta_file.write_text(json.dumps(data, indent=2))
        except Exception:
            pass

    if supabase_client:
        try:
            supabase_client.rpc("increment_play_count", {"target_song_id": song_id}).execute()
        except Exception as e:
            print(f"Supabase play count RPC warning: {e}")

    return {"success": True, "song_id": song_id, "play_count": play_count}

@app.delete("/api/songs/{song_id}")
def delete_song(song_id: str):
    """Delete a song from local storage and Supabase"""
    # Delete metadata
    meta_file = METADATA_DIR / f"{song_id}.json"
    if meta_file.exists():
        meta_file.unlink()

    # Delete audio files
    for ext in ["mp3", "opus", "flac"]:
        audio_file = DOWNLOADS_DIR / f"{song_id}.{ext}"
        if audio_file.exists():
            audio_file.unlink()

    # Delete artwork
    art_file = ARTWORK_DIR / f"{song_id}.jpg"
    if art_file.exists():
        art_file.unlink()

    # Delete in Supabase
    if supabase_client:
        try:
            supabase_client.table("songs").delete().eq("id", song_id).execute()
        except Exception as e:
            print(f"Supabase delete warning: {e}")

    return {"success": True, "song_id": song_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
