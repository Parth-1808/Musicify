import test from 'node:test';
import assert from 'node:assert';
import {
  calculateNormalizationGain,
  applyStereoWidening,
  saturateHarmonics,
  applyHarmonicExciter,
  peakLimiter,
  EQ_PRESETS,
  EQ_FREQUENCIES,
  shouldApplyOnDeviceRestoration,
  applyDeRingingFilter,
} from '../dspEngine.ts';

test('Loudness Normalization Gain - Nominal quiet track', () => {
  // Target: -14 LUFS, Input: -18 LUFS, True Peak: -6 dBTP
  // Expected: -14 - (-18) = +4 dB
  const res = calculateNormalizationGain(-18.0, -6.0, -14.0);
  assert.strictEqual(res.gainDb, 4.0);
  assert.strictEqual(res.isClamped, false);
  assert.strictEqual(res.reason, 'nominal');
  // 10^(4/20) ~ 1.5849
  assert.ok(Math.abs(res.linearGain - 1.5849) < 0.001);
});

test('Loudness Normalization Gain - Clip prevention ceiling', () => {
  // Target: -14 LUFS, Input: -20 LUFS (wants +6 dB), True Peak: -2 dBTP
  // Clip ceiling: -1.0 - (-2.0) = +1.0 dB
  const res = calculateNormalizationGain(-20.0, -2.0, -14.0);
  assert.strictEqual(res.gainDb, 1.0);
  assert.strictEqual(res.isClamped, true);
  assert.strictEqual(res.reason, 'clip_prevention');
});

test('Loudness Normalization Gain - Clamping bounds (-12 dB to +6 dB)', () => {
  // Extremely quiet track (-35 LUFS) clamped to +6.0 dB
  const quietRes = calculateNormalizationGain(-35.0, -10.0, -14.0);
  assert.strictEqual(quietRes.gainDb, 6.0);
  assert.strictEqual(quietRes.isClamped, true);
  assert.strictEqual(quietRes.reason, 'max_boost');

  // Extremely loud track (-1 LUFS) clamped to -12.0 dB
  const loudRes = calculateNormalizationGain(-1.0, 1.0, -14.0);
  assert.strictEqual(loudRes.gainDb, -12.0);
  assert.strictEqual(loudRes.isClamped, true);
  assert.strictEqual(loudRes.reason, 'max_cut');
});

test('Loudness Normalization Gain - Real measured song (-8.86 LUFS)', () => {
  // Input: -8.86 LUFS, True Peak: +1.52 dBTP
  // gain_db = -14 - (-8.86) = -5.14 dB
  const res = calculateNormalizationGain(-8.86, 1.52, -14.0);
  assert.strictEqual(res.gainDb, -5.14);
  assert.strictEqual(res.isClamped, false);
});

test('Loudness Normalization Gain - Missing / null metadata fallback', () => {
  const resNull = calculateNormalizationGain(null, null);
  assert.strictEqual(resNull.gainDb, 0.0);
  assert.strictEqual(resNull.linearGain, 1.0);
  assert.strictEqual(resNull.isClamped, false);

  const resNan = calculateNormalizationGain(NaN, NaN);
  assert.strictEqual(resNan.gainDb, 0.0);
  assert.strictEqual(resNan.linearGain, 1.0);
});

test('Stereo Widener - 100% Mono compatibility guarantee', () => {
  // When Left == Right (mono signal), Mid = L, Side = 0.
  // Any width boost must produce 0 on Side and leave L and R completely unaltered.
  const [lOut, rOut] = applyStereoWidening(0.75, 0.75, 1.30);
  assert.strictEqual(lOut, 0.75);
  assert.strictEqual(rOut, 0.75);
});

test('Stereo Widener - Stereo Side boosting with width factor 1.20x', () => {
  // Pure anti-phase stereo: Left = 1.0, Right = -1.0
  // Mid = 0.0, Side = 1.0
  // Boosted Side = 1.20
  // Left' = 1.20, Right' = -1.20
  const [lOut, rOut] = applyStereoWidening(1.0, -1.0, 1.20);
  assert.strictEqual(lOut, 1.20);
  assert.strictEqual(rOut, -1.20);
});

test('Stereo Widener - Width factor clamping (1.0 to 1.3)', () => {
  // Width below 1.0 is clamped to 1.0 (normal)
  const [l1, r1] = applyStereoWidening(1.0, 0.0, 0.5);
  const [lExpected1, rExpected1] = applyStereoWidening(1.0, 0.0, 1.0);
  assert.strictEqual(l1, lExpected1);
  assert.strictEqual(r1, rExpected1);

  // Width above 1.3 is clamped to 1.3
  const [l2, r2] = applyStereoWidening(1.0, 0.0, 2.0);
  const [lExpected2, rExpected2] = applyStereoWidening(1.0, 0.0, 1.3);
  assert.strictEqual(l2, lExpected2);
  assert.strictEqual(r2, rExpected2);
});

test('Harmonic Exciter - Saturation curve properties', () => {
  // Zero input produces zero output
  assert.strictEqual(saturateHarmonics(0), 0);

  // Strictly bounded within (-1, 1)
  assert.ok(Math.abs(saturateHarmonics(10.0)) < 1.0);
  assert.ok(Math.abs(saturateHarmonics(-10.0)) < 1.0);

  // Odd symmetry: f(-x) == -f(x)
  assert.strictEqual(saturateHarmonics(0.5), -saturateHarmonics(-0.5));
});

test('Harmonic Exciter - Mix staging relative to dry signal', () => {
  const dry = 0.8;
  const hf = 0.4;

  // Off (0 dB) returns dry
  assert.strictEqual(applyHarmonicExciter(dry, hf, 0.0), dry);

  // Subtle mix (e.g. +2.0 dB air -> effective -16 dB mix ~ 0.158x)
  const wet = applyHarmonicExciter(dry, hf, 2.0);
  assert.ok(wet > dry);
  assert.ok(wet < dry + 0.1); // subtle enhancement without clipping
});

test('Peak Limiter - Sub-threshold transparent pass-through', () => {
  // -0.5 dBTP is ~0.944. A sample at 0.50 should pass completely unaltered.
  const sample = 0.50;
  assert.strictEqual(peakLimiter(sample, -0.5), sample);
  assert.strictEqual(peakLimiter(-sample, -0.5), -sample);
});

test('Peak Limiter - High peak soft-knee saturation below 1.0', () => {
  // Overshooting signal at 1.50 must be compressed below 1.0
  const limited = peakLimiter(1.50, -0.5);
  assert.ok(limited < 1.0);
  assert.ok(limited > 0.944);

  const limitedNeg = peakLimiter(-1.50, -0.5);
  assert.ok(limitedNeg > -1.0);
  assert.ok(limitedNeg < -0.944);
});

test('EQ Presets - Verify 10 frequency bands and valid gain ranges', () => {
  assert.strictEqual(EQ_FREQUENCIES.length, 10);
  assert.deepStrictEqual([...EQ_FREQUENCIES], [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);

  for (const [name, bands] of Object.entries(EQ_PRESETS)) {
    assert.strictEqual(bands.length, 10, `Preset ${name} must have 10 bands`);
    for (const gain of bands) {
      assert.ok(gain >= -12.0 && gain <= 12.0, `Band gain ${gain} in preset ${name} must be within [-12, +12]`);
    }
  }
});

test('EQ Presets - Verify Musify Signature universal profile', () => {
  assert.ok(EQ_PRESETS['Musify Signature']);
  assert.strictEqual(EQ_PRESETS['Musify Signature'].length, 10);
  assert.strictEqual(EQ_PRESETS['Musify Signature'][0], 2.0); // 32Hz
  assert.strictEqual(EQ_PRESETS['Musify Signature'][9], 2.0); // 16kHz
});

test('On-Device Neural Restoration - Guardrails (Disabled by default / Opt-in)', () => {
  const disabled = shouldApplyOnDeviceRestoration(96, 'opus', false);
  assert.strictEqual(disabled.shouldRestore, false);
  assert.ok(disabled.reason.includes('Disabled'));
});

test('On-Device Neural Restoration - Guardrails (Bypass high-bitrate sources)', () => {
  // Opus >= 160k must be bypassed
  const opusHigh = shouldApplyOnDeviceRestoration(160, 'opus', true);
  assert.strictEqual(opusHigh.shouldRestore, false);
  assert.ok(opusHigh.reason.includes('Bypassed'));

  // AAC >= 256k must be bypassed
  const aacHigh = shouldApplyOnDeviceRestoration(256, 'aac', true);
  assert.strictEqual(aacHigh.shouldRestore, false);
  assert.ok(aacHigh.reason.includes('Bypassed'));

  // Generic >= 128k must be bypassed
  const mp3High = shouldApplyOnDeviceRestoration(192, 'mp3', true);
  assert.strictEqual(mp3High.shouldRestore, false);
  assert.ok(mp3High.reason.includes('Bypassed'));
});

test('On-Device Neural Restoration - Qualify low-bitrate sources (<128k)', () => {
  const lowOpus = shouldApplyOnDeviceRestoration(96, 'opus', true);
  assert.strictEqual(lowOpus.shouldRestore, true);
  assert.ok(lowOpus.reason.includes('Active'));
});

test('On-Device De-Ringing Filter - Suppresses low-level ripple and preserves transients', () => {
  // Low-amplitude ripple should be smoothed
  const smoothed = applyDeRingingFilter(0.10, 0.12, 0.3);
  assert.ok(smoothed > 0.10 && smoothed < 0.12);

  // Sharp transient edge should pass unattenuated
  const sharpTransient = applyDeRingingFilter(0.80, 0.10, 0.3);
  assert.strictEqual(sharpTransient, 0.80);
});
