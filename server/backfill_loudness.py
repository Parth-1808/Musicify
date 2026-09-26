"""
Musify Audio Loudness Backfill Script (Phase 2)
Analyzes existing songs for EBU R128 Loudness (integrated LUFS, true peak dBTP, LRA).
Features:
- Idempotent & Resumable: Skips already-analyzed rows (integrated_lufs IS NOT NULL).
- Batch Processing: Processes songs in batches of 20.
- Non-Destructive: The audio files are NEVER modified (measurement pass with null sink).
- Dual Storage: Backfills local metadata JSON cache and Supabase PostgreSQL database.
- Structured Logging: Clear progress and failure logs without crashing.
"""

import os
import sys
import json
import logging
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx
from dotenv import load_dotenv

# Ensure server package is resolvable
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server.audio_pipeline import (
    measure_loudness,
    compute_content_hash,
    probe_audio,
    get_ffmpeg_binary
)

load_dotenv(CURRENT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [backfill] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("backfill")

BASE_DIR = CURRENT_DIR
DOWNLOADS_DIR = BASE_DIR / "downloads"
METADATA_DIR = BASE_DIR / "metadata"

BATCH_SIZE = 20

# Initialize Supabase client if credentials exist
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")).strip()
supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Connected to Supabase at %s", SUPABASE_URL)
    except Exception as e:
        logger.warning("Could not initialize Supabase client: %s", e)


def find_local_audio_file(song_id: str, format_hint: Optional[str] = None) -> Optional[Path]:
    """Find audio file corresponding to song_id in DOWNLOADS_DIR."""
    if format_hint:
        candidate = DOWNLOADS_DIR / f"{song_id}.{format_hint}"
        if candidate.exists():
            return candidate

    for ext in ["opus", "m4a", "mp3", "webm", "flac"]:
        candidate = DOWNLOADS_DIR / f"{song_id}.{ext}"
        if candidate.exists():
            return candidate
    return None


def analyze_audio_file(file_path: Path) -> Dict[str, Any]:
    """Run non-destructive EBU R128 loudness measurement and probe stream info."""
    loudness = measure_loudness(file_path)
    probe = probe_audio(file_path)
    content_hash = compute_content_hash(file_path)
    return {
        "integrated_lufs": loudness["integrated_lufs"],
        "true_peak_dbtp": loudness["true_peak_dbtp"],
        "loudness_range": loudness["loudness_range"],
        "source_codec": probe["codec"],
        "source_bitrate_kbps": probe["bitrate_kbps"],
        "sample_rate": probe["sample_rate"],
        "channels": probe["channels"],
        "content_hash": content_hash,
        "audio_version": 2,
    }


def backfill_local_metadata(dry_run: bool = False) -> Dict[str, int]:
    """
    Backfill loudness and hash metadata for all local metadata JSON files.
    Idempotent: Skips files where integrated_lufs is already populated.
    """
    logger.info("Starting local metadata backfill in %s", METADATA_DIR)
    meta_files = list(METADATA_DIR.glob("*.json"))
    stats = {"inspected": len(meta_files), "analyzed": 0, "skipped": 0, "failed": 0}

    # Group into batches of BATCH_SIZE
    unprocessed: List[Path] = []
    for mf in meta_files:
        try:
            data = json.loads(mf.read_text(encoding="utf-8"))
            if data.get("integrated_lufs") is not None:
                stats["skipped"] += 1
            else:
                unprocessed.append(mf)
        except Exception:
            unprocessed.append(mf)

    logger.info(
        "Local files: %d inspected, %d already analyzed (skipped), %d remaining",
        stats["inspected"], stats["skipped"], len(unprocessed)
    )

    if not unprocessed:
        logger.info("All local songs are already analyzed! Nothing to backfill locally.")
        return stats

    total_batches = (len(unprocessed) + BATCH_SIZE - 1) // BATCH_SIZE
    for batch_idx in range(total_batches):
        batch = unprocessed[batch_idx * BATCH_SIZE : (batch_idx + 1) * BATCH_SIZE]
        logger.info("[Local Batch %d/%d] Processing %d songs...", batch_idx + 1, total_batches, len(batch))

        for mf in batch:
            try:
                data = json.loads(mf.read_text(encoding="utf-8"))
                song_id = data.get("id") or mf.stem
                audio_file = find_local_audio_file(song_id, data.get("format"))

                if not audio_file:
                    logger.warning("No audio file found for %s (%s). Skipping.", song_id, data.get("title"))
                    stats["failed"] += 1
                    continue

                logger.info("Analyzing %s ('%s')...", song_id, data.get("title", "Unknown"))
                analysis = analyze_audio_file(audio_file)

                # Update metadata dictionary
                data.update(analysis)
                if not dry_run:
                    mf.write_text(json.dumps(data, indent=2), encoding="utf-8")

                stats["analyzed"] += 1
                logger.info(
                    "OK %s -> integrated=%.2f LUFS, true_peak=%.2f dBTP, LRA=%.2f LU",
                    song_id, analysis["integrated_lufs"], analysis["true_peak_dbtp"], analysis["loudness_range"]
                )
            except Exception as e:
                logger.error("Failed to analyze local song %s: %s", mf.name, e)
                stats["failed"] += 1

    return stats


def backfill_supabase(dry_run: bool = False) -> Dict[str, int]:
    """
    Backfill loudness and hash metadata for Supabase songs table.
    Idempotent: Queries rows where integrated_lufs IS NULL in batches of 20.
    """
    if not supabase_client:
        logger.info("Supabase not configured. Skipping cloud backfill.")
        return {"inspected": 0, "analyzed": 0, "skipped": 0, "failed": 0}

    logger.info("Starting Supabase database backfill...")
    stats = {"inspected": 0, "analyzed": 0, "skipped": 0, "failed": 0}

    # Fetch total count
    try:
        count_res = supabase_client.table("songs").select("id", count="exact").execute()
        stats["inspected"] = count_res.count or 0
    except Exception as e:
        logger.warning("Could not count songs in Supabase: %s", e)

    batch_num = 1
    while True:
        try:
            # Resumable query: fetch next batch where integrated_lufs is null
            res = (
                supabase_client.table("songs")
                .select("id, title, audio_url, format, content_hash, integrated_lufs")
                .is_("integrated_lufs", "null")
                .limit(BATCH_SIZE)
                .execute()
            )
            rows = res.data or []
            if not rows:
                break

            logger.info("[Supabase Batch %d] Processing %d unanalyzed songs...", batch_num, len(rows))

            for row in rows:
                song_id = row["id"]
                title = row.get("title", "Unknown")
                audio_url = row.get("audio_url", "")

                try:
                    # 1. Check local file first
                    local_file = find_local_audio_file(song_id, row.get("format"))
                    temp_file = None

                    if local_file and local_file.exists():
                        target_file = local_file
                    elif audio_url and audio_url.startswith("http"):
                        # Download to temporary file for measurement
                        ext = row.get("format") or "mp3"
                        temp_fd, temp_path = tempfile.mkstemp(suffix=f".{ext}")
                        os.close(temp_fd)
                        temp_file = Path(temp_path)
                        with httpx.Client(timeout=30.0) as client:
                            resp = client.get(audio_url)
                            resp.raise_for_status()
                            temp_file.write_bytes(resp.content)
                        target_file = temp_file
                    else:
                        logger.warning("No audio source available for Supabase song %s (%s).", song_id, title)
                        stats["failed"] += 1
                        continue

                    analysis = analyze_audio_file(target_file)

                    if temp_file and temp_file.exists():
                        temp_file.unlink()

                    if not dry_run:
                        supabase_client.table("songs").update({
                            "integrated_lufs": analysis["integrated_lufs"],
                            "true_peak_dbtp": analysis["true_peak_dbtp"],
                            "loudness_range": analysis["loudness_range"],
                            "source_codec": analysis["source_codec"],
                            "source_bitrate_kbps": analysis["source_bitrate_kbps"],
                            "sample_rate": analysis["sample_rate"],
                            "channels": analysis["channels"],
                            "content_hash": analysis["content_hash"],
                            "audio_version": 2,
                        }).eq("id", song_id).execute()

                    stats["analyzed"] += 1
                    logger.info("OK Supabase %s ('%s') -> %.2f LUFS", song_id, title, analysis["integrated_lufs"])

                except Exception as e:
                    logger.error("Failed to analyze Supabase song %s: %s", song_id, e)
                    stats["failed"] += 1

            batch_num += 1

        except Exception as e:
            logger.error("Supabase query error: %s", e)
            break

    stats["skipped"] = stats["inspected"] - stats["analyzed"] - stats["failed"]
    return stats


def run_backfill(dry_run: bool = False):
    """Run full idempotent backfill across local and Supabase stores."""
    print("=" * 65)
    print(" [MUSIFY] EBU R128 LOUDNESS ANALYSIS BACKFILL (PHASE 2)")
    print(" Non-destructive measurement pass with batch size of 20")
    print("=" * 65)

    local_stats = backfill_local_metadata(dry_run=dry_run)
    sb_stats = backfill_supabase(dry_run=dry_run)

    print("\n" + "=" * 65)
    print(" BACKFILL SUMMARY REPORT")
    print("=" * 65)
    print(f" Local Files  : {local_stats['analyzed']} analyzed, {local_stats['skipped']} skipped, {local_stats['failed']} failed (Total: {local_stats['inspected']})")
    print(f" Supabase Rows: {sb_stats['analyzed']} analyzed, {sb_stats['skipped']} skipped, {sb_stats['failed']} failed (Total: {sb_stats['inspected']})")
    print("=" * 65)
    print(" Backfill finished successfully!")


if __name__ == "__main__":
    is_dry = "--dry-run" in sys.argv
    run_backfill(dry_run=is_dry)
