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

def download_stream_via_ffmpeg(stream_url: str, headers: dict, ffmpeg_args: list, output_file: Path) -> bool:
    """Stream audio directly from Google's CDN via FFmpeg, bypassing all yt-dlp format match issues"""
    ffmpeg_bin = get_ffmpeg_binary()
    ua = headers.get('User-Agent', '')
    cmd = [ffmpeg_bin, '-y']
    if ua:
        cmd.extend(['-user_agent', ua])
    
    header_str = "".join(f"{k}: {v}\r\n" for k, v in headers.items() if k.lower() not in ('user-agent', 'content-length', 'host'))
    if header_str:
        cmd.extend(['-headers', header_str])
    
    cmd.extend(['-i', stream_url])
    cmd.extend(ffmpeg_args)
    cmd.append(str(output_file))
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if res.returncode == 0 and output_file.exists() and output_file.stat().st_size > 10000:
            print(f"Direct FFmpeg streaming successful! Size: {output_file.stat().st_size} bytes")
            return True
        print(f"Direct FFmpeg streaming failed (code {res.returncode}): {res.stderr[-300:]}")
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
        converted_audio_path = temp_dir / f"{video_id}.{audio_ext}"

        # Step 2: Attempt Direct Ultra Hi-Fi FFmpeg Stream Extraction
        best_stream = get_best_stream_format(info)
        stream_success = False
        if best_stream and best_stream.get('url'):
            stream_headers = best_stream.get('http_headers', {})
            stream_url = best_stream['url']
            print(f"Attempting direct FFmpeg streaming for format {best_stream.get('format_id')}...")
            stream_success = await loop.run_in_executor(
                None, 
                lambda: download_stream_via_ffmpeg(stream_url, stream_headers, ffmpeg_args, converted_audio_path)
            )

        # Step 3: If direct streaming was not used or failed, fallback to standard yt-dlp download
        if not stream_success or not converted_audio_path.exists() or converted_audio_path.stat().st_size < 10000:
            print("Direct stream download not available; falling back to yt-dlp multi-client extractor...")
            preferred_format = str(best_stream.get('format_id')) if (best_stream and best_stream.get('format_id')) else 'ba/b/best[acodec!=none]/18/best'
            ydl_opts = {
                'format': preferred_format,
                'outtmpl': output_template,
                'writethumbnail': True,
                'quiet': True,
                'no_warnings': True,
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
            info_dl = await loop.run_in_executor(None, lambda: extract_info_with_fallback(ydl_opts, req.url, download=True))
            if info_dl:
                info = info_dl

        # Step 4: Locate downloaded audio file
        if not converted_audio_path.exists():
            matches = list(temp_dir.glob(f"*.{audio_ext}"))
            if matches:
                converted_audio_path = matches[0]
            else:
                raise HTTPException(status_code=500, detail="Audio conversion failed: no audio file produced")

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
