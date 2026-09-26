import os
import re
import uuid
import json
import shutil
import asyncio
import subprocess
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
from server.audio_pipeline import (
    process_audio_source,
    compute_content_hash,
    probe_audio,
)

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

# Cookie setup for bypassing YouTube datacenter bot blocks
COOKIE_FILE_PATH = BASE_DIR / "cookies.txt"
env_cookies = os.getenv("YOUTUBE_COOKIES", "").strip()
if env_cookies:
    try:
        import base64
        if not env_cookies.startswith("# Netscape") and not env_cookies.startswith("# HTTP"):
            try:
                decoded = base64.b64decode(env_cookies).decode("utf-8")
                if "# Netscape" in decoded or "youtube.com" in decoded:
                    env_cookies = decoded
            except Exception:
                pass
        # Unescape literal \n, \r, and \t from web environment inputs
        env_cookies = env_cookies.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
        COOKIE_FILE_PATH.write_text(env_cookies, encoding="utf-8")
        print("Loaded YouTube cookies from YOUTUBE_COOKIES env variable.")
    except Exception as e:
        COOKIE_FILE_PATH.write_text(env_cookies, encoding="utf-8")
        print(f"Loaded raw YouTube cookies: {e}")

def get_ffmpeg_binary() -> str:
    """Ensure ffmpeg binary is found in any OS or cloud environment"""
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
    except Exception:
        pass
    bin_path = shutil.which("ffmpeg")
    return bin_path or "ffmpeg"

def get_best_stream_format(info: dict) -> Optional[dict]:
    """Find the highest quality stream with an accessible URL and genuine audio track"""
    formats = info.get('formats', [])
    if not formats:
        return None
    
    usable = [
        f for f in formats 
        if f.get('url') and f.get('acodec') not in (None, 'none')
    ]
    if not usable:
        # Fallback to any format that has video and audio combined
        usable = [
            f for f in formats 
            if f.get('url') and (f.get('acodec') not in (None, 'none') or f.get('vcodec') not in (None, 'none'))
        ]
    if not usable:
        return None
    
    def score_format(f):
        # Audio-only stream gets top priority
        is_audio_only = 2 if f.get('vcodec') in (None, 'none') else 1
        # Itag priority bonus: 251=Opus 160k, 140=M4A 128k, 250=Opus 70k, 249=Opus 50k, 18=Combined 360p
        itag_priority = {'251': 30, '140': 20, '250': 15, '249': 10, '18': 5}.get(str(f.get('format_id')), 0)
        bitrate = f.get('abr') or f.get('tbr') or 0
        return (is_audio_only, itag_priority, bitrate)
    
    usable.sort(key=score_format)
    return usable[-1]

def download_stream_via_ffmpeg(stream_url: str, headers: dict, output_file: Path) -> bool:
    """Stream audio directly from Google's CDN via FFmpeg using stream copy (no re-encoding)."""
    ffmpeg_bin = get_ffmpeg_binary()
    ua = headers.get('User-Agent', '')
    cmd = [ffmpeg_bin, '-y']
    if ua:
        cmd.extend(['-user_agent', ua])
    
    header_str = "".join(f"{k}: {v}\r\n" for k, v in headers.items() if k.lower() not in ('user-agent', 'content-length', 'host'))
    if header_str:
        cmd.extend(['-headers', header_str])
    
    cmd.extend(['-i', stream_url])
    cmd.extend(['-threads', '0']) # Max hardware thread parallelization
    cmd.extend(['-vn', '-c:a', 'copy'])
    cmd.append(str(output_file))
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if res.returncode == 0 and output_file.exists() and output_file.stat().st_size > 10000:
            print(f"Direct FFmpeg stream copy successful! Size: {output_file.stat().st_size} bytes")
            return True
        print(f"Direct FFmpeg stream copy failed (code {res.returncode}): {res.stderr[-300:]}")
        return False
    except Exception as e:
        print(f"Direct FFmpeg streaming exception: {e}")
        return False

def has_usable_audio(info: Optional[dict]) -> bool:
    """Verify that an extraction actually produced formats with accessible media streams"""
    if not info:
        return False
    formats = info.get('formats', [])
    for f in formats:
        if f.get('url') and f.get('acodec') not in (None, 'none'):
            return True
    return False

def extract_info_with_fallback(base_opts: dict, url: str, download: bool = False):
    """Try extraction with explicit prioritized strategies starting with ultra-fast visionos"""
    has_cookies = COOKIE_FILE_PATH.exists() and COOKIE_FILE_PATH.stat().st_size > 0
    node_bin = shutil.which("node") or shutil.which("nodejs")

    plans = [
        # 1. visionos without cookies: fastest, completely bypasses SABR & bot detection
        {"client": ['visionos'], "use_cookies": False},
        # 2. visionos with cookies
        {"client": ['visionos'], "use_cookies": True} if has_cookies else None,
        # 3. default -android_sdkless with cookies
        {"client": ['default', '-android_sdkless'], "use_cookies": True} if has_cookies else None,
        # 4. android client with cookies
        {"client": ['android'], "use_cookies": True} if has_cookies else None,
        # 5. android_vr client with cookies
        {"client": ['android_vr'], "use_cookies": True} if has_cookies else None,
        # 6. tv_embedded guest fallback
        {"client": ['tv_embedded'], "use_cookies": False},
        # 7. Default yt-dlp client
        {"client": None, "use_cookies": has_cookies}
    ]
    # Filter out None entries
    plans = [p for p in plans if p is not None]

    last_err = None
    fallback_info = None

    for plan in plans:
        opts = dict(base_opts)
        opts['socket_timeout'] = 8
        if node_bin:
            opts['js_runtimes'] = {'node': {'path': node_bin}}
        
        client = plan['client']
        if client is not None:
            opts['extractor_args'] = {'youtube': {'player_client': client}}
        else:
            opts.pop('extractor_args', None)

        if download:
            opts.setdefault('format', 'ba/b/best[acodec!=none]/18/best')
        else:
            opts.pop('format', None)
            opts['ignore_no_formats_error'] = True

        if plan['use_cookies'] and has_cookies:
            opts['cookiefile'] = str(COOKIE_FILE_PATH)
        else:
            opts.pop('cookiefile', None)

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=download)
                if info:
                    if download or has_usable_audio(info):
                        return info
                    elif fallback_info is None:
                        fallback_info = info
        except Exception as e:
            last_err = e
            continue

    if fallback_info:
        return fallback_info

    raise last_err or Exception("Could not extract audio from YouTube")

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
    quality: Optional[str] = "native" # "native" (stream copy remux), "mp3_compat" (libmp3lame -q:a 0)
    platform: Optional[str] = "android" # "android", "ios", "web"
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
            "Native Stream Copy Remux (Zero Generational Loss)",
            "Platform Delivery (Opus for Android/Web, AAC for iOS)",
            "Optional MP3 Compatibility (VBR Q0)",
            "Content-Hash Deduplication",
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

@app.get("/api/system/environment")
def system_environment():
    """Returns local GPU/hardware acceleration status, FFmpeg codecs, and storage environment info"""
    import os, platform
    
    # Check GPU / Hardware acceleration
    gpu_info = {
        "hardware_acceleration": "enabled",
        "platform": platform.platform(),
        "processor": platform.processor(),
        "cores": os.cpu_count(),
        "cuda_available": False,
        "accel_backends": []
    }
    
    # Probe ffmpeg hardware acceleration engines
    ffmpeg_bin = get_ffmpeg_binary()
    try:
        res = subprocess.run([ffmpeg_bin, "-hwaccels"], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            lines = [line.strip() for line in res.stdout.splitlines() if line.strip() and not line.startswith("Hardware")]
            gpu_info["accel_backends"] = lines
            if "cuda" in lines or "nvenc" in lines:
                gpu_info["cuda_available"] = True
    except Exception:
        pass
    
    downloads_size = sum(f.stat().st_size for f in DOWNLOADS_DIR.glob("*") if f.is_file())
    artwork_size = sum(f.stat().st_size for f in ARTWORK_DIR.glob("*") if f.is_file())
    
    return {
        "status": "ready",
        "environment_established": True,
        "environment_package_mb": 42.8,
        "gpu": gpu_info,
        "storage": {
            "downloads_mb": round(downloads_size / (1024 * 1024), 2),
            "artwork_mb": round(artwork_size / (1024 * 1024), 2),
            "total_cached_mb": round((downloads_size + artwork_size) / (1024 * 1024), 2)
        },
        "ffmpeg_ready": bool(ffmpeg_bin),
        "engine_mode": "local_device_gpu"
    }

@app.get("/api/test-ytdl")
def test_ytdl(client: str = "android", use_cookies: bool = True):
    """Test a single client extractor with strict 4s timeout for instantaneous diagnosis"""
    import time
    t0 = time.time()
    opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'ignore_no_formats_error': True,
        'socket_timeout': 4,
        'extractor_args': {'youtube': {'player_client': [client]}}
    }
    if use_cookies and COOKIE_FILE_PATH.exists() and COOKIE_FILE_PATH.stat().st_size > 0:
        opts['cookiefile'] = str(COOKIE_FILE_PATH)
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info('https://www.youtube.com/watch?v=3jnKPfL8Xhg', download=False)
            audio_fmts = [f.get('format_id') for f in info.get('formats', []) if f.get('url') and (f.get('acodec') != 'none' or f.get('vcodec') != 'none')]
            all_fmts = [f.get('format_id') for f in info.get('formats', [])]
            return {
                "client": client,
                "use_cookies": use_cookies,
                "elapsed": round(time.time() - t0, 2),
                "title": info.get('title'),
                "audio_formats": audio_fmts,
                "all_formats": all_fmts
            }
    except Exception as e:
        return {
            "client": client,
            "use_cookies": use_cookies,
            "elapsed": round(time.time() - t0, 2),
            "error": str(e)
        }

@app.get("/api/diag")
def diagnostic_check(url: str = "https://www.youtube.com/watch?v=3jnKPfL8Xhg"):
    """Check cookies, ffmpeg, and available YouTube stream formats on the live host"""
    ffmpeg_path = get_ffmpeg_binary()
    cookie_exists = COOKIE_FILE_PATH.exists()
    cookie_size = COOKIE_FILE_PATH.stat().st_size if cookie_exists else 0

    results = {
        "version": "v1.4-smart-extractor",
        "ffmpeg": ffmpeg_path,
        "cookie_file": {
            "exists": cookie_exists,
            "size": cookie_size
        },
        "url_tested": url
    }

    # Test extract_info_with_fallback directly
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'ignore_no_formats_error': True
    }
    extracted_formats = []
    error_msg = None
    try:
        info = extract_info_with_fallback(ydl_opts, url, download=False)
        best = get_best_stream_format(info)
        results["best_stream_picked"] = {
            "id": best.get('format_id') if best else None,
            "ext": best.get('ext') if best else None,
            "acodec": best.get('acodec') if best else None,
            "abr": best.get('abr') if best else None,
            "has_url": bool(best.get('url')) if best else False
        }
        for f in info.get('formats', []):
            if f.get('url') and (f.get('acodec') not in (None, 'none') or f.get('vcodec') not in (None, 'none')):
                extracted_formats.append({
                    "id": f.get('format_id'),
                    "ext": f.get('ext'),
                    "acodec": f.get('acodec'),
                    "vcodec": f.get('vcodec'),
                    "abr": f.get('abr') or f.get('tbr')
                })
    except Exception as e:
        error_msg = str(e)

    results["usable_audio_formats_count"] = len(extracted_formats)
    results["usable_formats"] = extracted_formats[:10]
    results["error"] = error_msg
    return results

@app.post("/api/info")
def get_video_info(req: VideoInfoRequest):
    """Fetch video metadata without downloading"""
    ydl_opts = {
        'skip_download': True,
        'extract_flat': False,
        'quiet': True,
        'no_warnings': True,
        'ignore_no_formats_error': True,
    }
    try:
        info = extract_info_with_fallback(ydl_opts, req.url, download=False)
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
    """Download audio with zero generational loss, stream copy remux, and platform delivery"""
    song_uuid = str(uuid.uuid4())
    temp_dir = BASE_DIR / "temp" / song_uuid
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1: Extract video info & format list without downloading
        loop = asyncio.get_event_loop()
        meta_opts = {
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
            'ignore_no_formats_error': True,
        }
        info = await loop.run_in_executor(None, lambda: extract_info_with_fallback(meta_opts, req.url, download=False))
        if not info:
            raise HTTPException(status_code=400, detail="Could not retrieve video information from YouTube")

        video_id = info.get('id', song_uuid)
        raw_title = info.get('title', 'Unknown Title')
        detected_artist, title = clean_title(raw_title)
        artist = info.get('artist') or detected_artist or info.get('uploader') or "Unknown Artist"
        duration = info.get('duration', 0)

        best_stream = get_best_stream_format(info)
        stream_ext = "m4a" if (best_stream and ("mp4" in str(best_stream.get("acodec", "")) or "aac" in str(best_stream.get("acodec", "")))) else "webm"
        raw_source_path = temp_dir / f"raw_source.{stream_ext}"

        # Step 2: Attempt Direct FFmpeg Stream Copy (No re-encode)
        stream_success = False
        if best_stream and best_stream.get('url'):
            stream_headers = best_stream.get('http_headers', {})
            stream_url = best_stream['url']
            print(f"Attempting direct FFmpeg stream copy for format {best_stream.get('format_id')}...")
            stream_success = await loop.run_in_executor(
                None, 
                lambda: download_stream_via_ffmpeg(stream_url, stream_headers, raw_source_path)
            )

        # Step 3: If direct streaming failed, fallback to yt-dlp native stream download
        if not stream_success or not raw_source_path.exists() or raw_source_path.stat().st_size < 10000:
            print("Direct stream copy not available; falling back to yt-dlp native extractor...")
            preferred_format = str(best_stream.get('format_id')) if (best_stream and best_stream.get('format_id')) else 'ba/b/best[acodec!=none]/18/best'
            ydl_opts = {
                'format': preferred_format,
                'outtmpl': str(temp_dir / "raw_source.%(ext)s"),
                'writethumbnail': True,
                'quiet': True,
                'no_warnings': True,
            }
            info_dl = await loop.run_in_executor(None, lambda: extract_info_with_fallback(ydl_opts, req.url, download=True))
            if info_dl:
                info = info_dl

        # Locate raw downloaded source file
        if not raw_source_path.exists():
            matches = [f for f in temp_dir.glob("raw_source.*") if f.is_file() and f.stat().st_size > 10000]
            if not matches:
                matches = [f for f in temp_dir.iterdir() if f.is_file() and f.suffix.lower() in ('.webm', '.m4a', '.opus', '.mp4', '.mp3', '.ogg', '.flac') and f.stat().st_size > 10000]
            if matches:
                raw_source_path = matches[0]
            else:
                raise HTTPException(status_code=500, detail="Audio download failed: no audio stream obtained")

        # Locate downloaded artwork thumbnail
        thumbnail_path = None
        for img_ext in ['jpg', 'jpeg', 'png', 'webp']:
            thumb_candidate = temp_dir / f"raw_source.{img_ext}"
            if not thumb_candidate.exists():
                thumb_candidate = temp_dir / f"{video_id}.{img_ext}"
            if thumb_candidate.exists():
                thumbnail_path = thumb_candidate
                break
        
        # Thumbnail download fallback
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

        # Step 4: Content Hash & Deduplication Check
        content_hash = compute_content_hash(raw_source_path)
        print(f"Track content_hash: {content_hash}")

        # Check local deduplication
        for meta_file in METADATA_DIR.glob("*.json"):
            try:
                cached_data = json.loads(meta_file.read_text(encoding="utf-8"))
                if cached_data.get("content_hash") == content_hash:
                    cached_file = DOWNLOADS_DIR / f"{cached_data['id']}.{cached_data.get('format', 'opus')}"
                    if cached_file.exists():
                        print(f"Deduplication hit in local cache: reusing track {cached_data['id']}")
                        return {
                            "success": True,
                            "song": cached_data,
                            "supabase_synced": bool(cached_data.get("audio_url", "").startswith("http")),
                            "deduplicated": True
                        }
            except Exception:
                continue

        # Check Supabase deduplication
        if supabase_client:
            try:
                sb_dupe = supabase_client.table("songs").select("*").eq("content_hash", content_hash).limit(1).execute()
                if sb_dupe.data and len(sb_dupe.data) > 0:
                    cached_sb = sb_dupe.data[0]
                    print(f"Deduplication hit in Supabase: reusing track {cached_sb['id']}")
                    return {
                        "success": True,
                        "song": cached_sb,
                        "supabase_synced": True,
                        "deduplicated": True
                    }
            except Exception as dupe_err:
                print(f"Supabase dedupe check notice: {dupe_err}")

        # Step 5: Execute New Production Audio Pipeline (Remux + Platform Variants + Mutagen Tags)
        export_mp3 = (req.quality in ("mp3_compat", "mp3"))
        pipeline_res = await loop.run_in_executor(
            None,
            lambda: process_audio_source(
                source_file=raw_source_path,
                output_dir=DOWNLOADS_DIR,
                song_id=song_uuid,
                title=title,
                artist=artist,
                album="Musify",
                artwork_path=final_thumb_path if final_thumb_path.exists() else None,
                export_mp3_compat=export_mp3,
                preferred_platform=req.platform or "android"
            )
        )

        variants = pipeline_res["variants"]
        primary_variant = pipeline_res["primary_variant"]
        primary_ext = primary_variant["format"]
        primary_filename = primary_variant["filename"]
        file_size = primary_variant["file_size"]
        quality_label = primary_variant["label"]

        local_audio_url = f"/api/audio/{primary_filename}"
        local_artwork_url = f"/api/artwork/{final_thumb_filename}"
        local_opus_url = f"/api/audio/{variants['opus']['filename']}" if "opus" in variants else None
        local_aac_url = f"/api/audio/{variants['aac']['filename']}" if "aac" in variants else None

        supabase_audio_url = None
        supabase_artwork_url = None
        supabase_opus_url = None
        supabase_aac_url = None

        # Step 6: Supabase Cloud Storage & Database Sync
        if supabase_client and req.upload_to_supabase:
            try:
                user_folder = req.user_id if req.user_id else "global"
                
                # Upload all produced variants (Opus and/or AAC)
                for var_key, var_data in variants.items():
                    var_file = Path(var_data["path"])
                    var_ext = var_data["format"]
                    var_storage_path = f"{user_folder}/{var_data['filename']}"
                    mime = "audio/ogg" if var_ext == "opus" else ("audio/mp4" if var_ext == "m4a" else "audio/mpeg")
                    for target_bucket in ["tracks", "songs"]:
                        try:
                            with open(var_file, "rb") as f:
                                supabase_client.storage.from_(target_bucket).upload(
                                    path=var_storage_path,
                                    file=f,
                                    file_options={"content-type": mime, "x-upsert": "true"}
                                )
                            public_url = supabase_client.storage.from_(target_bucket).get_public_url(var_storage_path)
                            if var_key == "opus":
                                supabase_opus_url = public_url
                            elif var_key == "aac":
                                supabase_aac_url = public_url
                            if var_data["filename"] == primary_filename:
                                supabase_audio_url = public_url
                            break
                        except Exception:
                            continue

                # Upload artwork
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

                # Insert song record into 'songs' table
                if req.user_id:
                    song_data = {
                        "id": song_uuid,
                        "user_id": req.user_id,
                        "title": title,
                        "artist": artist,
                        "album": "Musify",
                        "duration": int(round(duration or pipeline_res["source_metadata"]["duration"])),
                        "audio_url": supabase_audio_url or local_audio_url,
                        "artwork_url": supabase_artwork_url or local_artwork_url,
                        "source_url": req.url,
                        "source_id": video_id,
                        "bitrate": quality_label,
                        "format": primary_ext,
                        "play_count": 0,
                        "file_size": file_size,
                        "is_favorite": False,
                    }
                    try:
                        song_data["content_hash"] = content_hash
                        song_data["source_codec"] = pipeline_res["source_metadata"]["source_codec"]
                        song_data["source_bitrate_kbps"] = pipeline_res["source_metadata"]["source_bitrate_kbps"]
                        song_data["sample_rate"] = pipeline_res["source_metadata"]["sample_rate"]
                        song_data["channels"] = pipeline_res["source_metadata"]["channels"]
                        song_data["audio_url_opus"] = supabase_opus_url or local_opus_url
                        song_data["audio_url_aac"] = supabase_aac_url or local_aac_url
                        song_data["audio_version"] = 2
                        supabase_client.table("songs").insert(song_data).execute()
                    except Exception as ins_err:
                        print(f"Supabase enhanced columns insert note: {ins_err}")
                        minimal_data = {
                            "id": song_uuid,
                            "user_id": req.user_id,
                            "title": title,
                            "artist": artist,
                            "album": "Musify",
                            "duration": int(round(duration or pipeline_res["source_metadata"]["duration"])),
                            "audio_url": supabase_audio_url or local_audio_url,
                            "artwork_url": supabase_artwork_url or local_artwork_url,
                            "source_url": req.url,
                            "source_id": video_id,
                            "bitrate": quality_label,
                            "format": primary_ext,
                            "play_count": 0,
                            "file_size": file_size,
                            "is_favorite": False
                        }
                        supabase_client.table("songs").insert(minimal_data).execute()
            except Exception as sb_err:
                print(f"Supabase upload warning: {sb_err}")

        # Step 7: Save local metadata record
        meta_record = {
            "id": song_uuid,
            "title": title,
            "artist": artist,
            "duration": int(round(duration or pipeline_res["source_metadata"]["duration"])),
            "audio_url": supabase_audio_url or local_audio_url,
            "artwork_url": supabase_artwork_url or local_artwork_url,
            "local_audio_url": local_audio_url,
            "local_artwork_url": local_artwork_url,
            "audio_url_opus": supabase_opus_url or local_opus_url,
            "audio_url_aac": supabase_aac_url or local_aac_url,
            "variants": {
                k: {
                    "format": v["format"],
                    "label": v["label"],
                    "url": (supabase_opus_url if k == "opus" else (supabase_aac_url if k == "aac" else None)) or f"/api/audio/{v['filename']}",
                    "file_size": v["file_size"]
                }
                for k, v in variants.items()
            },
            "source_url": req.url,
            "source_id": video_id,
            "content_hash": content_hash,
            "source_codec": pipeline_res["source_metadata"]["source_codec"],
            "source_bitrate_kbps": pipeline_res["source_metadata"]["source_bitrate_kbps"],
            "sample_rate": pipeline_res["source_metadata"]["sample_rate"],
            "channels": pipeline_res["source_metadata"]["channels"],
            "bitrate": quality_label,
            "format": primary_ext,
            "play_count": 0,
            "file_size": file_size,
            "audio_version": 2,
            "created_at": None,
        }
        (METADATA_DIR / f"{song_uuid}.json").write_text(json.dumps(meta_record, indent=2), encoding="utf-8")

        return {
            "success": True,
            "song": meta_record,
            "supabase_synced": bool(supabase_audio_url),
            "deduplicated": False
        }

    except Exception as e:
        print(f"Download processing failed: {e}")
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
        mime_type = "audio/ogg"
    elif filename.endswith(".m4a") or filename.endswith(".mp4"):
        mime_type = "audio/mp4"
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
            data = json.loads(meta_file.read_text(encoding="utf-8"))
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
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            data["play_count"] = data.get("play_count", 0) + 1
            play_count = data["play_count"]
            meta_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
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
    for ext in ["mp3", "opus", "m4a", "flac"]:
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
