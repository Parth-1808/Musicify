"""
Musify Audio Pipeline - Production-Grade Source-Agnostic Audio Processing
Eliminates generational loss, enforces stream copy (remux) without re-encoding,
handles platform delivery variants (Opus for Android/Web, AAC for iOS),
embeds native tags via mutagen, and provides content-hash deduplication.
"""

import os
import re
import json
import time
import shutil
import base64
import hashlib
import logging
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from mutagen.oggopus import OggOpus
from mutagen.flac import Picture
from mutagen.mp4 import MP4, MP4Cover
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC

logger = logging.getLogger("musify.audio_pipeline")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [audio_pipeline] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def get_ffmpeg_binary() -> str:
    """Ensure ffmpeg binary is found in any OS or cloud environment."""
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
    except Exception:
        pass
    bin_path = shutil.which("ffmpeg")
    return bin_path or "ffmpeg"


def get_ffprobe_binary() -> str:
    """Ensure ffprobe binary is found in any OS or cloud environment."""
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
    except Exception:
        pass
    bin_path = shutil.which("ffprobe")
    return bin_path or "ffprobe"


def probe_audio(file_path: Path) -> Dict[str, Any]:
    """
    Extract stream metadata from an audio file using ffprobe.
    Records codec, bitrate_kbps, sample_rate, channels, and duration.
    """
    ffprobe_bin = get_ffprobe_binary()
    cmd = [
        ffprobe_bin,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(file_path)
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=15)
        data = json.loads(res.stdout)
    except subprocess.CalledProcessError as e:
        logger.error("ffprobe failed on %s: %s", file_path, e.stderr)
        raise RuntimeError(f"ffprobe failed: {e.stderr}") from e
    except Exception as e:
        logger.error("Failed to run ffprobe on %s: %s", file_path, e)
        raise RuntimeError(f"ffprobe execution error: {e}") from e

    audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    format_data = data.get("format", {})

    codec = audio_stream.get("codec_name", "unknown").lower()
    sample_rate = int(audio_stream.get("sample_rate") or 0)
    channels = int(audio_stream.get("channels") or 0)

    # Determine bitrate (stream first, fallback to container format)
    bit_rate = audio_stream.get("bit_rate") or format_data.get("bit_rate")
    bitrate_kbps = None
    if bit_rate:
        try:
            bitrate_kbps = int(round(int(bit_rate) / 1000))
        except (ValueError, TypeError):
            bitrate_kbps = None

    duration = 0.0
    dur_str = audio_stream.get("duration") or format_data.get("duration")
    if dur_str:
        try:
            duration = float(dur_str)
        except (ValueError, TypeError):
            duration = 0.0

    return {
        "codec": codec,
        "bitrate_kbps": bitrate_kbps,
        "sample_rate": sample_rate,
        "channels": channels,
        "duration": duration,
    }


def compute_content_hash(file_path: Path) -> str:
    """Compute SHA-256 hash of audio file contents for deduplication."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    return sha256.hexdigest()


def remux_audio(input_path: Path, output_path: Path) -> None:
    """
    Stream copy (remux) audio without re-encoding.
    Guarantees bit-identical audio packets with zero generational loss.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin, "-y",
        "-i", str(input_path),
        "-vn",
        "-c:a", "copy",
        str(output_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        logger.error("Remux failed from %s to %s: %s", input_path, output_path, res.stderr)
        raise RuntimeError(f"Remux failed: {res.stderr}")


def transcode_aac(input_path: Path, output_path: Path, bitrate_kbps: int = 160) -> None:
    """
    Encode once to AAC for iOS devices.
    Never re-encode a lossy file more than ONCE in its lifetime.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin, "-y",
        "-i", str(input_path),
        "-vn",
        "-c:a", "aac",
        "-b:a", f"{bitrate_kbps}k",
        str(output_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        logger.error("AAC transcode failed: %s", res.stderr)
        raise RuntimeError(f"AAC transcode failed: {res.stderr}")


def transcode_opus(input_path: Path, output_path: Path, bitrate_kbps: int = 160) -> None:
    """
    Encode once to Opus for Android/web devices when source is AAC or lossless.
    Never re-encode a lossy file more than ONCE in its lifetime.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin, "-y",
        "-i", str(input_path),
        "-vn",
        "-c:a", "libopus",
        "-b:a", f"{bitrate_kbps}k",
        str(output_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        logger.error("Opus transcode failed: %s", res.stderr)
        raise RuntimeError(f"Opus transcode failed: {res.stderr}")


def export_mp3_compatibility(input_path: Path, output_path: Path) -> None:
    """
    Optional MP3 Compatibility export using '-c:a libmp3lame -q:a 0' only (no '-b:a').
    Labeled strictly as 'Compatibility (MP3 VBR Q0)', NEVER 'High quality' or 'Studio master'.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin, "-y",
        "-i", str(input_path),
        "-vn",
        "-c:a", "libmp3lame",
        "-q:a", "0",
        str(output_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        logger.error("MP3 compatibility export failed: %s", res.stderr)
        raise RuntimeError(f"MP3 compatibility export failed: {res.stderr}")


def tag_opus(
    path: Path,
    title: str,
    artist: str,
    album: str = "Musify",
    artwork_path: Optional[Path] = None
) -> None:
    """
    Tag Opus file with mutagen.oggopus.OggOpus.
    Embeds cover art as a base64-encoded FLAC Picture in METADATA_BLOCK_PICTURE.
    """
    audio = OggOpus(str(path))
    audio["title"] = [title]
    audio["artist"] = [artist]
    audio["album"] = [album]

    if artwork_path and artwork_path.exists() and artwork_path.stat().st_size > 0:
        try:
            art_data = artwork_path.read_bytes()
            mime_type = "image/png" if artwork_path.suffix.lower() == ".png" else "image/jpeg"
            pic = Picture()
            pic.data = art_data
            pic.type = 3  # Front cover
            pic.mime = mime_type
            pic.desc = "Cover"
            audio["metadata_block_picture"] = [base64.b64encode(pic.write()).decode("ascii")]
        except Exception as e:
            logger.warning("Failed to embed cover art in Opus %s: %s", path, e)

    audio.save()


def tag_m4a(
    path: Path,
    title: str,
    artist: str,
    album: str = "Musify",
    artwork_path: Optional[Path] = None
) -> None:
    """
    Tag M4A file with mutagen.mp4.MP4 using (c)nam/(c)ART/(c)alb and covr (MP4Cover).
    """
    audio = MP4(str(path))
    audio["\xa9nam"] = [title]
    audio["\xa9ART"] = [artist]
    audio["\xa9alb"] = [album]

    if artwork_path and artwork_path.exists() and artwork_path.stat().st_size > 0:
        try:
            art_data = artwork_path.read_bytes()
            fmt = MP4Cover.FORMAT_PNG if artwork_path.suffix.lower() == ".png" else MP4Cover.FORMAT_JPEG
            audio["covr"] = [MP4Cover(art_data, imageformat=fmt)]
        except Exception as e:
            logger.warning("Failed to embed cover art in M4A %s: %s", path, e)

    audio.save()


def tag_mp3(
    path: Path,
    title: str,
    artist: str,
    album: str = "Musify",
    artwork_path: Optional[Path] = None
) -> None:
    """
    Tag MP3 file with ID3v2.3 tags (TIT2, TPE1, TALB, APIC).
    """
    audio = MP3(str(path), ID3=ID3)
    try:
        audio.add_tags()
    except Exception:
        pass

    audio.tags.add(TIT2(encoding=3, text=title))
    audio.tags.add(TPE1(encoding=3, text=artist))
    audio.tags.add(TALB(encoding=3, text=album))

    if artwork_path and artwork_path.exists() and artwork_path.stat().st_size > 0:
        try:
            art_data = artwork_path.read_bytes()
            mime_type = "image/png" if artwork_path.suffix.lower() == ".png" else "image/jpeg"
            audio.tags.add(
                APIC(
                    encoding=3,
                    mime=mime_type,
                    type=3,
                    desc="Cover",
                    data=art_data
                )
            )
        except Exception as e:
            logger.warning("Failed to embed cover art in MP3 %s: %s", path, e)

    audio.save()


def tag_audio_file(
    file_path: Path,
    title: str,
    artist: str,
    album: str = "Musify",
    artwork_path: Optional[Path] = None
) -> None:
    """Dispatch tagging to appropriate mutagen handler based on file extension."""
    ext = file_path.suffix.lower()
    if ext == ".opus":
        tag_opus(file_path, title, artist, album, artwork_path)
    elif ext in (".m4a", ".mp4"):
        tag_m4a(file_path, title, artist, album, artwork_path)
    elif ext == ".mp3":
        tag_mp3(file_path, title, artist, album, artwork_path)
    else:
        logger.info("No specific mutagen tagging handler for extension %s", ext)


def parse_loudnorm_output(stderr_text: str) -> Dict[str, float]:
    """
    Parse JSON block from ffmpeg loudnorm filter output.
    Extracts input_i (integrated LUFS), input_tp (true peak dBTP),
    input_lra (loudness range), and input_thresh.
    """
    match = re.search(r"\{\s*\"input_i\"\s*:[^}]+\}", stderr_text, re.DOTALL)
    if not match:
        raise ValueError("Could not find loudnorm JSON block in ffmpeg output")
    
    data = json.loads(match.group(0))
    return {
        "input_i": float(data["input_i"]),
        "input_tp": float(data["input_tp"]),
        "input_lra": float(data["input_lra"]),
        "input_thresh": float(data["input_thresh"]),
    }


def measure_loudness(file_path: Path) -> Dict[str, float]:
    """
    Run an EBU R128 loudness measurement pass on an audio file without modifying it.
    Command: ffmpeg -i file -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -
    Returns:
      integrated_lufs: float (input_i)
      true_peak_dbtp: float (input_tp)
      loudness_range: float (input_lra)
      loudness_threshold: float (input_thresh)
    """
    ffmpeg_bin = get_ffmpeg_binary()
    cmd = [
        ffmpeg_bin,
        "-i", str(file_path),
        "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
        "-f", "null",
        "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        logger.error("Loudness measurement failed on %s: %s", file_path, res.stderr[-300:])
        raise RuntimeError(f"Loudness measurement failed: {res.stderr[-300:]}")

    parsed = parse_loudnorm_output(res.stderr)
    return {
        "integrated_lufs": parsed["input_i"],
        "true_peak_dbtp": parsed["input_tp"],
        "loudness_range": parsed["input_lra"],
        "loudness_threshold": parsed["input_thresh"],
    }


def calculate_normalization_gain(
    integrated_lufs: Optional[float],
    true_peak_dbtp: Optional[float],
    target_lufs: float = -14.0
) -> float:
    """
    Calculate playback normalization gain without modifying the audio file.
    Formula:
      gain_db = target_lufs - integrated_lufs
      gain_db = min(gain_db, (-1.0) - true_peak_dbtp)  # never clip
      gain_db = clamp(gain_db, -12.0, +6.0)
    Missing data returns 0.0 dB.
    """
    if integrated_lufs is None or true_peak_dbtp is None:
        return 0.0

    gain_db = target_lufs - integrated_lufs
    # Never exceed -1.0 dBTP ceiling
    clip_ceiling = -1.0 - true_peak_dbtp
    gain_db = min(gain_db, clip_ceiling)
    # Clamp between -12 dB and +6 dB
    gain_db = max(-12.0, min(6.0, gain_db))
    return round(gain_db, 2)


def process_audio_source(
    source_file: Path,
    output_dir: Path,
    song_id: str,
    title: str,
    artist: str,
    album: str = "Musify",
    artwork_path: Optional[Path] = None,
    export_mp3_compat: bool = False,
    preferred_platform: str = "android"
) -> Dict[str, Any]:
    """
    Source-agnostic audio processing pipeline.
    
    1. Probes source audio using ffprobe.
    2. Computes content_hash (SHA-256) of the source audio.
    3. Remuxes to native container without re-encoding (0 generational loss):
       - Opus source -> .opus (Ogg container)
       - AAC source -> .m4a
    4. Generates platform variants (Opus for Android/Web, AAC for iOS).
    5. Optionally generates MP3 Compatibility export (-c:a libmp3lame -q:a 0).
    6. Tags all output variants with mutagen (OggOpus, MP4, ID3v2.3).
    7. Returns complete metadata with honest quality labeling.
    """
    start_time = time.time()
    logger.info("Processing source audio %s for song %s (%s - %s)", source_file, song_id, artist, title)

    # 1. Probe source audio
    probe_info = probe_audio(source_file)
    source_codec = probe_info["codec"]
    source_bitrate = probe_info["bitrate_kbps"]
    sample_rate = probe_info["sample_rate"]
    channels = probe_info["channels"]
    duration = probe_info["duration"]

    logger.info(
        "Source probed: codec=%s, bitrate=%skbps, sample_rate=%sHz, channels=%s, duration=%.2fs",
        source_codec, source_bitrate or "unknown", sample_rate, channels, duration
    )

    # 2. Compute content hash
    content_hash = compute_content_hash(source_file)
    logger.info("Computed content_hash (SHA-256): %s", content_hash)

    variants: Dict[str, Dict[str, Any]] = {}
    output_dir.mkdir(parents=True, exist_ok=True)

    # 3 & 4. Platform delivery & Remux vs Transcode (Never re-encode lossy > 1 time)
    if "opus" in source_codec:
        # Opus source -> Stream copy to .opus (0 generational loss)
        opus_path = output_dir / f"{song_id}.opus"
        remux_audio(source_file, opus_path)
        tag_audio_file(opus_path, title, artist, album, artwork_path)
        variants["opus"] = {
            "path": str(opus_path),
            "filename": f"{song_id}.opus",
            "format": "opus",
            "label": f"Native Stream (Opus ~{source_bitrate or 160}kbps)",
            "file_size": opus_path.stat().st_size,
            "remuxed": True,
        }

        # Transcode once to AAC for iOS platform delivery
        m4a_path = output_dir / f"{song_id}.m4a"
        transcode_aac(source_file, m4a_path, bitrate_kbps=source_bitrate or 160)
        tag_audio_file(m4a_path, title, artist, album, artwork_path)
        variants["aac"] = {
            "path": str(m4a_path),
            "filename": f"{song_id}.m4a",
            "format": "m4a",
            "label": f"AAC Transcode for iOS (~{source_bitrate or 160}kbps)",
            "file_size": m4a_path.stat().st_size,
            "remuxed": False,
        }

    elif "aac" in source_codec:
        # AAC source -> Stream copy to .m4a (0 generational loss)
        m4a_path = output_dir / f"{song_id}.m4a"
        remux_audio(source_file, m4a_path)
        tag_audio_file(m4a_path, title, artist, album, artwork_path)
        variants["aac"] = {
            "path": str(m4a_path),
            "filename": f"{song_id}.m4a",
            "format": "m4a",
            "label": f"Native Stream (AAC ~{source_bitrate or 128}kbps)",
            "file_size": m4a_path.stat().st_size,
            "remuxed": True,
        }

        # Transcode once to Opus for Android/Web platform delivery
        opus_path = output_dir / f"{song_id}.opus"
        transcode_opus(source_file, opus_path, bitrate_kbps=source_bitrate or 160)
        tag_audio_file(opus_path, title, artist, album, artwork_path)
        variants["opus"] = {
            "path": str(opus_path),
            "filename": f"{song_id}.opus",
            "format": "opus",
            "label": f"Opus Transcode (~{source_bitrate or 160}kbps)",
            "file_size": opus_path.stat().st_size,
            "remuxed": False,
        }

    elif "mp3" in source_codec:
        # MP3 source -> Stream copy to .mp3 (0 generational loss)
        mp3_path = output_dir / f"{song_id}.mp3"
        remux_audio(source_file, mp3_path)
        tag_audio_file(mp3_path, title, artist, album, artwork_path)
        variants["mp3"] = {
            "path": str(mp3_path),
            "filename": f"{song_id}.mp3",
            "format": "mp3",
            "label": f"Native Stream (MP3 ~{source_bitrate or 192}kbps)",
            "file_size": mp3_path.stat().st_size,
            "remuxed": True,
        }

    else:
        # Lossless or other source (FLAC, WAV, ALAC, etc.) -> Encode once to Opus & AAC
        opus_path = output_dir / f"{song_id}.opus"
        transcode_opus(source_file, opus_path, bitrate_kbps=160)
        tag_audio_file(opus_path, title, artist, album, artwork_path)
        variants["opus"] = {
            "path": str(opus_path),
            "filename": f"{song_id}.opus",
            "format": "opus",
            "label": "Opus 160kbps (from Lossless)",
            "file_size": opus_path.stat().st_size,
            "remuxed": False,
        }

        m4a_path = output_dir / f"{song_id}.m4a"
        transcode_aac(source_file, m4a_path, bitrate_kbps=160)
        tag_audio_file(m4a_path, title, artist, album, artwork_path)
        variants["aac"] = {
            "path": str(m4a_path),
            "filename": f"{song_id}.m4a",
            "format": "m4a",
            "label": "AAC 160kbps (from Lossless)",
            "file_size": m4a_path.stat().st_size,
            "remuxed": False,
        }

    # 5. Optional MP3 Compatibility export
    if export_mp3_compat and "mp3" not in variants:
        mp3_path = output_dir / f"{song_id}.mp3"
        export_mp3_compatibility(source_file, mp3_path)
        tag_audio_file(mp3_path, title, artist, album, artwork_path)
        variants["mp3"] = {
            "path": str(mp3_path),
            "filename": f"{song_id}.mp3",
            "format": "mp3",
            "label": "Compatibility (MP3 VBR Q0)",
            "file_size": mp3_path.stat().st_size,
            "remuxed": False,
        }

    # 6. Determine primary output variant based on platform
    preferred_platform = (preferred_platform or "android").lower()
    if preferred_platform == "ios" and "aac" in variants:
        primary_key = "aac"
    elif preferred_platform in ("android", "web") and "opus" in variants:
        primary_key = "opus"
    elif "opus" in variants:
        primary_key = "opus"
    elif "aac" in variants:
        primary_key = "aac"
    elif "mp3" in variants:
        primary_key = "mp3"
    else:
        primary_key = list(variants.keys())[0]

    primary_variant = variants[primary_key]

    # 7. Run Loudness Measurement Pass on primary output variant (no file modification)
    primary_variant_path = Path(primary_variant["path"])
    try:
        loudness_info = measure_loudness(primary_variant_path)
        logger.info(
            "Loudness measured: integrated=%.2f LUFS, true_peak=%.2f dBTP, LRA=%.2f LU",
            loudness_info["integrated_lufs"], loudness_info["true_peak_dbtp"], loudness_info["loudness_range"]
        )
    except Exception as e:
        logger.warning("Could not measure loudness on %s: %s", primary_variant_path, e)
        loudness_info = {
            "integrated_lufs": None,
            "true_peak_dbtp": None,
            "loudness_range": None,
            "loudness_threshold": None,
        }

    elapsed_ms = int((time.time() - start_time) * 1000)

    logger.info(
        "Finished processing in %dms. Primary: %s (%s). Total variants: %d",
        elapsed_ms, primary_variant["filename"], primary_variant["label"], len(variants)
    )

    return {
        "song_id": song_id,
        "content_hash": content_hash,
        "source_metadata": {
            "source_codec": source_codec,
            "source_bitrate_kbps": source_bitrate,
            "sample_rate": sample_rate,
            "channels": channels,
            "duration": duration,
        },
        "loudness": loudness_info,
        "variants": variants,
        "primary_key": primary_key,
        "primary_variant": primary_variant,
        "processing_time_ms": elapsed_ms,
    }
