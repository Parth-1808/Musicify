"""
Unit Tests for Musify Audio Quality Pipeline (Phase 1)
Tests:
1. Loudness JSON parsing
2. Normalization gain formula (clip ceiling, clamp bounds, fallback)
3. Hash computation & deduplication
4. Remux bit-identical audio preservation (ffmpeg -f md5 -)
5. Mutagen tagging for Opus, M4A, and MP3
6. ffprobe source metadata probing
"""

import os
import shutil
import tempfile
import unittest
import subprocess
from pathlib import Path

from server.audio_pipeline import (
    parse_loudnorm_output,
    calculate_normalization_gain,
    compute_content_hash,
    remux_audio,
    probe_audio,
    tag_opus,
    tag_m4a,
    tag_mp3,
    process_audio_source,
    get_ffmpeg_binary
)
from mutagen.oggopus import OggOpus
from mutagen.mp4 import MP4
from mutagen.mp3 import MP3


class TestAudioPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = get_ffmpeg_binary()

    def test_loudness_json_parsing(self):
        """Test parsing loudnorm output JSON from ffmpeg stderr."""
        sample_stderr = """
[Parsed_loudnorm_0 @ 000002167d363580] 
{
	"input_i" : "-16.42",
	"input_tp" : "-0.45",
	"input_lra" : "8.70",
	"input_thresh" : "-26.85",
	"output_i" : "-14.02",
	"output_tp" : "-1.00",
	"output_lra" : "7.20",
	"output_thresh" : "-24.40",
	"normalization_type" : "dynamic",
	"target_offset" : "0.02"
}
        """
        parsed = parse_loudnorm_output(sample_stderr)
        self.assertEqual(parsed["input_i"], -16.42)
        self.assertEqual(parsed["input_tp"], -0.45)
        self.assertEqual(parsed["input_lra"], 8.70)
        self.assertEqual(parsed["input_thresh"], -26.85)

    def test_loudness_json_parsing_invalid(self):
        """Test error handling when loudnorm JSON is missing."""
        with self.assertRaises(ValueError):
            parse_loudnorm_output("Invalid output without loudnorm data")

    def test_gain_formula_normal(self):
        """
        Test normal gain calculation:
        target = -14, input_i = -18, true_peak = -6
        diff = -14 - (-18) = +4 dB
        clip cap = -1.0 - (-6) = +5 dB
        min(4, 5) = 4 dB (within [-12, +6])
        """
        gain = calculate_normalization_gain(integrated_lufs=-18.0, true_peak_dbtp=-6.0, target_lufs=-14.0)
        self.assertEqual(gain, 4.0)

    def test_gain_formula_clip_prevention(self):
        """
        Test clip ceiling:
        target = -14, input_i = -20 (would want +6 dB), but true_peak = -2 dBTP
        clip cap = -1.0 - (-2.0) = +1.0 dB
        min(+6, +1.0) = +1.0 dB
        """
        gain = calculate_normalization_gain(integrated_lufs=-20.0, true_peak_dbtp=-2.0, target_lufs=-14.0)
        self.assertEqual(gain, 1.0)

    def test_gain_formula_clamps(self):
        """Test clamping between -12 dB and +6 dB."""
        # Extremely quiet track: input_i = -35 dB, true_peak = -10 dB -> clamped to +6.0
        gain_max = calculate_normalization_gain(integrated_lufs=-35.0, true_peak_dbtp=-10.0, target_lufs=-14.0)
        self.assertEqual(gain_max, 6.0)

        # Extremely loud track: input_i = -1 dB, true_peak = +1 dB -> clamped to -12.0
        gain_min = calculate_normalization_gain(integrated_lufs=-1.0, true_peak_dbtp=1.0, target_lufs=-14.0)
        self.assertEqual(gain_min, -12.0)

    def test_gain_formula_missing_data(self):
        """Test missing data returns 0.0 dB."""
        self.assertEqual(calculate_normalization_gain(None, -1.0), 0.0)
        self.assertEqual(calculate_normalization_gain(-14.0, None), 0.0)
        self.assertEqual(calculate_normalization_gain(None, None), 0.0)

    def test_hash_computation_and_dedupe(self):
        """Test SHA-256 calculation and content hash deduplication."""
        with tempfile.TemporaryDirectory() as td:
            f1 = Path(td) / "audio1.bin"
            f2 = Path(td) / "audio2.bin"
            f3 = Path(td) / "audio3.bin"

            content_a = b"Audio stream test content 12345"
            content_b = b"Different audio stream content"

            f1.write_bytes(content_a)
            f2.write_bytes(content_a)
            f3.write_bytes(content_b)

            h1 = compute_content_hash(f1)
            h2 = compute_content_hash(f2)
            h3 = compute_content_hash(f3)

            self.assertEqual(h1, h2, "Identical content must produce identical hash")
            self.assertNotEqual(h1, h3, "Different content must produce different hash")

    def test_remux_correctness_bit_identical(self):
        """
        Acceptance test: proves remux is bit-identical by comparing
        decoded audio md5 ('ffmpeg -i X -f md5 -') for source vs remuxed output.
        """
        with tempfile.TemporaryDirectory() as td:
            # 1. Test Opus remux bit-identity
            src_opus = Path(td) / "src.opus"
            dst_opus = Path(td) / "dst.opus"
            subprocess.run([
                self.ffmpeg, "-y",
                "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
                "-c:a", "libopus", "-b:a", "128k",
                str(src_opus)
            ], check=True, capture_output=True)

            remux_audio(src_opus, dst_opus)

            md5_src_opus = subprocess.run([self.ffmpeg, "-i", str(src_opus), "-f", "md5", "-"], capture_output=True, text=True).stdout.strip()
            md5_dst_opus = subprocess.run([self.ffmpeg, "-i", str(dst_opus), "-f", "md5", "-"], capture_output=True, text=True).stdout.strip()
            self.assertEqual(md5_src_opus, md5_dst_opus, "Decoded audio of remuxed Opus must be bit-identical to source")

            # 2. Test AAC remux bit-identity
            src_aac = Path(td) / "src.m4a"
            dst_aac = Path(td) / "dst.m4a"
            subprocess.run([
                self.ffmpeg, "-y",
                "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
                "-c:a", "aac", "-b:a", "128k",
                str(src_aac)
            ], check=True, capture_output=True)

            remux_audio(src_aac, dst_aac)

            md5_src_aac = subprocess.run([self.ffmpeg, "-i", str(src_aac), "-f", "md5", "-"], capture_output=True, text=True).stdout.strip()
            md5_dst_aac = subprocess.run([self.ffmpeg, "-i", str(dst_aac), "-f", "md5", "-"], capture_output=True, text=True).stdout.strip()
            self.assertEqual(md5_src_aac, md5_dst_aac, "Decoded audio of remuxed AAC must be bit-identical to source")

    def test_mutagen_tagging(self):
        """Test native mutagen tagging for Opus, M4A, and MP3."""
        with tempfile.TemporaryDirectory() as td:
            # Create a 1x1 test image
            art_file = Path(td) / "art.jpg"
            art_file.write_bytes(
                b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
            )

            # 1. Opus
            f_opus = Path(td) / "tag_test.opus"
            subprocess.run([self.ffmpeg, "-y", "-f", "lavfi", "-i", "sine=d=1", "-c:a", "libopus", str(f_opus)], check=True, capture_output=True)
            tag_opus(f_opus, title="Opus Track", artist="Artist O", album="Album O", artwork_path=art_file)
            tag_o = OggOpus(str(f_opus))
            self.assertEqual(tag_o["title"], ["Opus Track"])
            self.assertEqual(tag_o["artist"], ["Artist O"])
            self.assertTrue(len(tag_o.get("metadata_block_picture", [])) > 0)

            # 2. M4A
            f_m4a = Path(td) / "tag_test.m4a"
            subprocess.run([self.ffmpeg, "-y", "-f", "lavfi", "-i", "sine=d=1", "-c:a", "aac", str(f_m4a)], check=True, capture_output=True)
            tag_m4a(f_m4a, title="M4A Track", artist="Artist M", album="Album M", artwork_path=art_file)
            tag_m = MP4(str(f_m4a))
            self.assertEqual(tag_m["\xa9nam"], ["M4A Track"])
            self.assertEqual(tag_m["\xa9ART"], ["Artist M"])
            self.assertTrue(len(tag_m.get("covr", [])) > 0)

            # 3. MP3
            f_mp3 = Path(td) / "tag_test.mp3"
            subprocess.run([self.ffmpeg, "-y", "-f", "lavfi", "-i", "sine=d=1", "-c:a", "libmp3lame", str(f_mp3)], check=True, capture_output=True)
            tag_mp3(f_mp3, title="MP3 Track", artist="Artist P", album="Album P", artwork_path=art_file)
            tag_p = MP3(str(f_mp3))
            self.assertEqual(str(tag_p.tags["TIT2"]), "MP3 Track")
            self.assertEqual(str(tag_p.tags["TPE1"]), "Artist P")

    def test_process_audio_source_end_to_end(self):
        """Test full source-agnostic audio processing pipeline."""
        with tempfile.TemporaryDirectory() as td:
            source = Path(td) / "source.opus"
            output_dir = Path(td) / "output"
            subprocess.run([
                self.ffmpeg, "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-c:a", "libopus", "-b:a", "128k",
                str(source)
            ], check=True, capture_output=True)

            res = process_audio_source(
                source_file=source,
                output_dir=output_dir,
                song_id="test-uuid-1234",
                title="Song Test",
                artist="Artist Test",
                export_mp3_compat=True,
                preferred_platform="android"
            )

            self.assertEqual(res["song_id"], "test-uuid-1234")
            self.assertTrue(len(res["content_hash"]) == 64)
            self.assertIn("opus", res["variants"])
            self.assertIn("aac", res["variants"])
            self.assertIn("mp3", res["variants"])
            self.assertEqual(res["primary_key"], "opus")
            self.assertTrue(res["variants"]["opus"]["remuxed"])
            self.assertFalse(res["variants"]["mp3"]["remuxed"])


if __name__ == "__main__":
    unittest.main()
