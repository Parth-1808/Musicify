"""
Unit Tests and Benchmarks for ML & Spectral Audio Restoration (Phase 5)
"""

import tempfile
import unittest
import subprocess
from pathlib import Path
import numpy as np

from server.ml_restoration import (
    should_apply_ml_restoration,
    extend_high_frequencies,
    reduce_compression_deringing,
    restore_low_bitrate_audio,
    compute_spectral_energy,
)
from server.audio_pipeline import get_ffmpeg_binary


class TestMLRestoration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = get_ffmpeg_binary()

    def test_guardrails_opt_in_only(self):
        """Test that ML restoration is strictly disabled by default."""
        probe = {"codec": "opus", "bitrate_kbps": 96}
        should, reason = should_apply_ml_restoration(probe, enable_ml_restoration=False)
        self.assertFalse(should)
        self.assertIn("disabled by default", reason.lower())

    def test_guardrails_bypass_high_bitrate_opus(self):
        """Test that Opus sources >= 160kbps are strictly bypassed."""
        for kbps in [160, 192, 256]:
            probe = {"codec": "opus", "bitrate_kbps": kbps}
            should, reason = should_apply_ml_restoration(probe, enable_ml_restoration=True)
            self.assertFalse(should, f"Opus at {kbps}kbps must be bypassed")
            self.assertIn("bypassed", reason.lower())

    def test_guardrails_bypass_high_bitrate_aac(self):
        """Test that AAC sources >= 256kbps are strictly bypassed."""
        probe = {"codec": "aac", "bitrate_kbps": 256}
        should, reason = should_apply_ml_restoration(probe, enable_ml_restoration=True)
        self.assertFalse(should)
        self.assertIn("bypassed", reason.lower())

    def test_guardrails_qualify_low_bitrate(self):
        """Test that low-bitrate sources (<128kbps) correctly qualify when enabled."""
        for kbps in [64, 96, 112]:
            probe = {"codec": "opus", "bitrate_kbps": kbps}
            should, reason = should_apply_ml_restoration(probe, enable_ml_restoration=True)
            self.assertTrue(should, f"Source at {kbps}kbps should qualify")
            self.assertIn("qualifies", reason.lower())

    def test_spectral_bandwidth_extension_math(self):
        """Test high-frequency harmonic synthesis on bandlimited test audio."""
        sr = 48000
        t = np.linspace(0, 1.0, sr, endpoint=False)
        # Create bandlimited audio containing only 1kHz and 8kHz tones (zero energy above 10kHz)
        audio = 0.5 * np.sin(2 * np.pi * 1000 * t) + 0.3 * np.sin(2 * np.pi * 8000 * t)

        pre_hf = compute_spectral_energy(audio, sr, 12000.0, 18000.0)
        restored = extend_high_frequencies(audio, sr, cutoff_hz=10000.0, target_hf_hz=18000.0)
        post_hf = compute_spectral_energy(restored, sr, 12000.0, 18000.0)

        # Spectral energy in 12kHz-18kHz must increase noticeably
        self.assertGreater(post_hf, pre_hf)
        self.assertGreater(post_hf - pre_hf, 5.0, "HF extension should add >5dB in missing octave")
        # Output must be bounded without digital clipping
        self.assertLessEqual(np.max(np.abs(restored)), 1.0)

    def test_deringing_preserves_shape(self):
        """Test that de-ringing filter preserves audio shape and dimensions."""
        sr = 48000
        audio = np.random.randn(2, sr // 2).astype(np.float32) * 0.1
        derung = reduce_compression_deringing(audio, sr, deringing_amount=0.30)
        self.assertEqual(derung.shape, audio.shape)
        self.assertFalse(np.isnan(derung).any())

    def test_restore_low_bitrate_audio_end_to_end_benchmark(self):
        """
        Acceptance test: Runs full restoration on a synthetic lowpass-filtered Opus track.
        Validates performance, latency, RTF, and high-frequency improvement.
        """
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "low_quality_source.opus"
            dst = Path(td) / "restored_output.opus"

            # Generate synthetic 96k lowpass audio (cut off at 10kHz)
            subprocess.run([
                self.ffmpeg, "-y",
                "-f", "lavfi", "-i", "sine=frequency=4000:duration=2",
                "-af", "lowpass=f=10000",
                "-c:a", "libopus", "-b:a", "96k",
                str(src)
            ], check=True, capture_output=True)

            probe = {"codec": "opus", "bitrate_kbps": 96}
            metrics = restore_low_bitrate_audio(src, dst, probe)

            self.assertTrue(dst.exists())
            self.assertGreater(dst.stat().st_size, 0)
            self.assertTrue(metrics["restored"])
            # Performance checks
            self.assertGreater(metrics["real_time_factor"], 5.0, "Processing must be at least 5x faster than real time")
            self.assertLess(metrics["latency_ms"], 1000.0, "Latency for 2s audio must be <1000ms")
            # Quality checks
            self.assertGreater(metrics["hf_bandwidth_gain_db"], 1.0, "High-frequency air gain must be positive")


if __name__ == "__main__":
    unittest.main()
