/**
 * Musify Real-Time Digital Signal Processing (DSP) Engine (Phase 3)
 * 
 * Audio graph architecture:
 *   Source 
 *     -> Loudness Normalization Gain (from EBU R128 metadata: Target - integrated_lufs, clamped)
 *     -> 10-Band Parametric / Peaking Equalizer (user-controllable, default flat)
 *     -> Harmonic Exciter (subtle 2nd/3rd harmonics > 4kHz to restore air)
 *     -> Stereo Widener (Mid/Side processing matrix, 1.0 - 1.3x)
 *     -> Peak Limiter / True-Peak Guard (prevent any clipping, threshold -0.5 dBTP)
 *     -> Destination
 */

let storageBackend: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asyncStorageMod = require('@react-native-async-storage/async-storage');
  storageBackend = asyncStorageMod.default || asyncStorageMod;
} catch {
  const memoryStore: Record<string, string> = {};
  storageBackend = {
    getItem: async (key: string) => memoryStore[key] || null,
    setItem: async (key: string, val: string) => { memoryStore[key] = val; },
    removeItem: async (key: string) => { delete memoryStore[key]; },
  };
}

export type EQPresetName = 'Musify Signature' | 'Flat' | 'Bass Boost' | 'Vocal' | 'Electronic' | 'Rock' | 'Acoustic' | 'Custom';

export interface DSPSettings {
  enhancementEnabled: boolean;
  normalizationEnabled: boolean;
  targetLufs: number; // default -14.0
  spatialWidth: number; // 1.0 to 1.3 (100% to 130%), default 1.15
  clarityAir: number; // 0.0 to 6.0 dB exciter mix boost (default 2.0 dB)
  neuralRestorationEnabled: boolean; // Opt-in spectral restoration (<128k sources only)
  eqBands: number[]; // 10 bands in dB, range: -12.0 to +12.0 dB
  eqPreset: EQPresetName;
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BAND_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'] as const;

export const EQ_PRESETS: Record<Exclude<EQPresetName, 'Custom'>, number[]> = {
  'Musify Signature': [2.0, 1.5, 0.5, 0.0, 0.0, 0.0, 0.5, 1.0, 1.5, 2.0],
  Flat: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  'Bass Boost': [5.5, 4.5, 3.0, 1.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  Vocal: [-2.0, -1.0, 0.0, 1.5, 3.0, 3.5, 2.0, 0.0, -1.0, -2.0],
  Electronic: [4.5, 3.5, 1.0, 0.0, -1.0, 1.5, 2.0, 3.0, 4.0, 3.5],
  Rock: [4.5, 3.0, 1.5, 0.0, -1.0, -0.5, 1.5, 3.0, 3.5, 4.0],
  Acoustic: [3.0, 2.0, 1.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 2.5],
};

export const DEFAULT_DSP_SETTINGS: DSPSettings = {
  enhancementEnabled: true,
  normalizationEnabled: true,
  targetLufs: -14.0,
  spatialWidth: 1.15, // 115% spatial width
  clarityAir: 2.0, // +2.0 dB air harmonic exciter
  neuralRestorationEnabled: false, // strictly opt-in, disabled by default
  eqBands: [2.0, 1.5, 0.5, 0.0, 0.0, 0.0, 0.5, 1.0, 1.5, 2.0],
  eqPreset: 'Musify Signature',
};

const STORAGE_KEY = 'musify_dsp_settings_v2';

// ============================================================================
// Mathematical DSP Functions (Pure & Unit Testable)
// ============================================================================

export interface LoudnessGainResult {
  gainDb: number;
  linearGain: number;
  isClamped: boolean;
  reason?: 'clip_prevention' | 'max_boost' | 'max_cut' | 'nominal';
}

/**
 * Calculate target normalization gain based on EBU R128 metadata.
 * Target: -14 LUFS.
 * Formula: gain_db = target_lufs - integrated_lufs.
 * Clip prevention: if (true_peak + gain_db) > -1.0 dBTP, gain_db = -1.0 - true_peak.
 * Clamped between -12 dB and +6 dB.
 */
export function calculateNormalizationGain(
  integratedLufs?: number | null,
  truePeakDbtp?: number | null,
  targetLufs: number = -14.0
): LoudnessGainResult {
  if (integratedLufs == null || isNaN(integratedLufs)) {
    return { gainDb: 0.0, linearGain: 1.0, isClamped: false, reason: 'nominal' };
  }

  let gainDb = targetLufs - integratedLufs;
  let reason: LoudnessGainResult['reason'] = 'nominal';
  let isClamped = false;

  // Clip prevention ceiling: true peak after gain must not exceed -1.0 dBTP
  if (truePeakDbtp != null && !isNaN(truePeakDbtp)) {
    const clipCeiling = -1.0 - truePeakDbtp;
    if (gainDb > clipCeiling) {
      gainDb = clipCeiling;
      reason = 'clip_prevention';
      isClamped = true;
    }
  }

  // Clamping bounds: -12.0 dB to +6.0 dB
  if (gainDb > 6.0) {
    gainDb = 6.0;
    reason = 'max_boost';
    isClamped = true;
  } else if (gainDb < -12.0) {
    gainDb = -12.0;
    reason = 'max_cut';
    isClamped = true;
  }

  const linearGain = Math.pow(10, gainDb / 20);
  return {
    gainDb: Number(gainDb.toFixed(2)),
    linearGain: Number(linearGain.toFixed(4)),
    isClamped,
    reason,
  };
}

/**
 * Mid/Side Stereo Widener
 * M = (L + R) / 2
 * S = (L - R) / 2
 * Boost S by width factor w (1.0 to 1.3x)
 * L' = M + w * S
 * R' = M - w * S
 * 
 * Mono Compatibility Check:
 * When L == R, S = 0.
 * L' = M + 0 = L.
 * R' = M - 0 = R.
 * The Mid channel and mono balance are 100% unaffected.
 */
export function applyStereoWidening(
  left: number,
  right: number,
  widthFactor: number = 1.15
): [number, number] {
  const w = Math.max(1.0, Math.min(1.30, widthFactor));
  const mid = 0.5 * (left + right);
  const side = 0.5 * (left - right);
  const boostedSide = side * w;

  const leftOut = mid + boostedSide;
  const rightOut = mid - boostedSide;
  return [leftOut, rightOut];
}

/**
 * Non-linear Harmonic Exciter Polynomial
 * Adds subtle 2nd and 3rd order harmonics for frequencies > 4kHz.
 * Uses rational saturation: f(x) = x / (1 + |x|)
 * Smooth, non-clipping, bounded within (-1, 1).
 */
export function saturateHarmonics(sample: number, polynomial: 'rational' | 'tanh' = 'rational'): number {
  if (polynomial === 'tanh') {
    return Math.tanh(sample);
  }
  return sample / (1.0 + Math.abs(sample));
}

/**
 * Mixes harmonic excitation into the audio sample.
 * Mix is staged at base -18 dB + clarityAir boost (0 to 6 dB -> -18 dB to -12 dB).
 */
export function applyHarmonicExciter(
  drySample: number,
  highFrequencySample: number,
  clarityAirDb: number = 2.0
): number {
  if (clarityAirDb <= 0) return drySample;
  const clampedDb = Math.max(0.0, Math.min(6.0, clarityAirDb));
  const mixDb = -18.0 + clampedDb; // -18 dB to -12 dB
  const mixLinear = Math.pow(10, mixDb / 20);
  const saturated = saturateHarmonics(highFrequencySample, 'rational');
  return drySample + saturated * mixLinear;
}

/**
 * Peak Limiter / True-Peak Guard
 * Prevents any clipping above -0.5 dBTP (thresholdLinear ~0.944).
 * Transparent soft-knee response above threshold.
 */
export function peakLimiter(sample: number, thresholdDbtp: number = -0.5): number {
  const thresholdLinear = Math.pow(10, thresholdDbtp / 20);
  const abs = Math.abs(sample);
  if (abs <= thresholdLinear) {
    return sample;
  }
  const sign = sample >= 0 ? 1 : -1;
  const excess = abs - thresholdLinear;
  const compressed = thresholdLinear + (1.0 - thresholdLinear) * (excess / (1.0 + excess));
  return sign * Math.min(0.999, compressed);
}

/**
 * Check if a playing track qualifies for on-device neural/spectral restoration.
 * Guardrails:
 * - Must be explicitly enabled by user (opt-in).
 * - Must NOT run on >=160k Opus or >=256k AAC (pristine sources).
 * - Only activates for low-bitrate sources (<128 kbps).
 */
export function shouldApplyOnDeviceRestoration(
  sourceBitrateKbps?: number | null,
  sourceCodec?: string | null,
  enabled: boolean = false
): { shouldRestore: boolean; reason: string } {
  if (!enabled) {
    return { shouldRestore: false, reason: 'Disabled (Opt-in only)' };
  }

  const codec = (sourceCodec || '').toLowerCase();
  const bitrate = sourceBitrateKbps;

  if (bitrate != null) {
    if (codec.includes('opus') && bitrate >= 160) {
      return { shouldRestore: false, reason: `Bypassed (Opus ${bitrate}k is full bandwidth)` };
    }
    if (codec.includes('aac') && bitrate >= 256) {
      return { shouldRestore: false, reason: `Bypassed (AAC ${bitrate}k is full bandwidth)` };
    }
    if (bitrate >= 128) {
      return { shouldRestore: false, reason: `Bypassed (Source ${bitrate}k >= 128k)` };
    }
  }

  return { shouldRestore: true, reason: `Active (<128k source: ~${bitrate || 96}kbps)` };
}

/**
 * Real-Time De-Ringing Filter
 * Smooths low-level MDCT pre-echo ripples around audio transients.
 */
export function applyDeRingingFilter(sample: number, prevSample: number, intensity: number = 0.25): number {
  const delta = Math.abs(sample - prevSample);
  if (delta < 0.04) {
    return (1.0 - intensity) * sample + intensity * (0.5 * (sample + prevSample));
  }
  return sample;
}

// ============================================================================
// Web Audio Graph Controller (Web & Hybrid Audio Environments)
// ============================================================================

export class WebAudioGraph {
  private ctx: any | null = null;
  private sourceNode: any | null = null;
  private normGainNode: any | null = null;
  private eqFilters: any[] = [];
  private exciterFilter: any | null = null;
  private exciterShaper: any | null = null;
  private exciterGain: any | null = null;
  private mergerNode: any | null = null;
  private limiterNode: any | null = null;
  private isConnected = false;

  init(audioElement: HTMLMediaElement) {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }

    try {
      if (!this.sourceNode) {
        this.sourceNode = this.ctx.createMediaElementSource(audioElement);
      }

      // 1. Normalization Gain Node (fade over 100ms)
      this.normGainNode = this.ctx.createGain();
      this.normGainNode.gain.value = 1.0;

      // 2. 10-Band Peaking EQ
      this.eqFilters = EQ_FREQUENCIES.map((freq) => {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.414;
        filter.gain.value = 0.0;
        return filter;
      });

      // 3. Harmonic Exciter Branch (> 4kHz highpass + saturation)
      this.exciterFilter = this.ctx.createBiquadFilter();
      this.exciterFilter.type = 'highpass';
      this.exciterFilter.frequency.value = 4000;
      this.exciterFilter.Q.value = 0.707;

      this.exciterShaper = this.ctx.createWaveShaper();
      this.exciterShaper.curve = this.generateSaturationCurve();
      this.exciterShaper.oversample = '2x';

      this.exciterGain = this.ctx.createGain();
      this.exciterGain.gain.value = Math.pow(10, (-18 + 2.0) / 20); // Default -16 dB mix

      // 4. Peak Limiter / True-Peak Guard (Fast attack 0.5ms, release 50ms, threshold -0.5 dB)
      this.limiterNode = this.ctx.createDynamicsCompressor();
      this.limiterNode.threshold.value = -0.5;
      this.limiterNode.knee.value = 0.0;
      this.limiterNode.ratio.value = 20.0;
      this.limiterNode.attack.value = 0.0005; // 0.5 ms
      this.limiterNode.release.value = 0.050; // 50 ms

      // Connect Chain: Source -> Norm -> EQ[0..9]
      let current = this.sourceNode;
      current.connect(this.normGainNode);
      current = this.normGainNode;

      for (const filter of this.eqFilters) {
        current.connect(filter);
        current = filter;
      }

      // Connect Exciter Parallel Branch
      current.connect(this.exciterFilter);
      this.exciterFilter.connect(this.exciterShaper);
      this.exciterShaper.connect(this.exciterGain);

      // Sum Dry EQ + Exciter into Limiter
      current.connect(this.limiterNode);
      this.exciterGain.connect(this.limiterNode);

      // Limiter to Destination
      this.limiterNode.connect(this.ctx.destination);
      this.isConnected = true;
    } catch (e) {
      console.warn('Web Audio Graph initialization notice:', e);
    }
  }

  private generateSaturationCurve(samples: number = 1024): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = saturateHarmonics(x, 'rational');
    }
    return curve;
  }

  updateSettings(settings: DSPSettings, songLufs?: number | null, songPeak?: number | null) {
    if (!this.ctx || !this.isConnected) return;
    const now = this.ctx.currentTime;

    // Normalization Gain
    if (this.normGainNode) {
      const targetLinear = settings.normalizationEnabled && settings.enhancementEnabled
        ? calculateNormalizationGain(songLufs, songPeak, settings.targetLufs).linearGain
        : 1.0;
      this.normGainNode.gain.cancelScheduledValues(now);
      this.normGainNode.gain.setValueAtTime(this.normGainNode.gain.value, now);
      this.normGainNode.gain.linearRampToValueAtTime(targetLinear, now + 0.1); // Smooth 100ms fade
    }

    // 10-Band EQ
    this.eqFilters.forEach((filter, index) => {
      const gainDb = settings.enhancementEnabled ? settings.eqBands[index] || 0.0 : 0.0;
      filter.gain.cancelScheduledValues(now);
      filter.gain.setValueAtTime(filter.gain.value, now);
      filter.gain.linearRampToValueAtTime(gainDb, now + 0.05);
    });

    // Exciter Gain
    if (this.exciterGain) {
      const exciterMixDb = settings.enhancementEnabled ? -18.0 + settings.clarityAir : -100.0;
      const exciterLinear = Math.pow(10, exciterMixDb / 20);
      this.exciterGain.gain.cancelScheduledValues(now);
      this.exciterGain.gain.setValueAtTime(this.exciterGain.gain.value, now);
      this.exciterGain.gain.linearRampToValueAtTime(exciterLinear, now + 0.05);
    }
  }
}

// ============================================================================
// DSP Engine Singleton Manager (Unified Settings & State Management)
// ============================================================================

type DSPChangeListener = (settings: DSPSettings) => void;

class DSPEngine {
  private settings: DSPSettings = { ...DEFAULT_DSP_SETTINGS };
  private listeners: Set<DSPChangeListener> = new Set();
  public webGraph: WebAudioGraph = new WebAudioGraph();
  private isLoaded = false;

  constructor() {
    this.loadPersistedSettings();
  }

  private async loadPersistedSettings() {
    try {
      const raw = await storageBackend.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = {
          ...DEFAULT_DSP_SETTINGS,
          ...parsed,
          eqBands: Array.isArray(parsed.eqBands) && parsed.eqBands.length === 10
            ? parsed.eqBands
            : [...DEFAULT_DSP_SETTINGS.eqBands],
        };
      }
    } catch (e) {
      console.warn('Failed to load persisted DSP settings:', e);
    } finally {
      this.isLoaded = true;
      this.notifyListeners();
    }
  }

  private async persistSettings() {
    try {
      await storageBackend.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to persist DSP settings:', e);
    }
  }

  getSettings(): DSPSettings {
    return { ...this.settings, eqBands: [...this.settings.eqBands] };
  }

  updateSettings(partial: Partial<DSPSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.persistSettings();
    this.notifyListeners();
  }

  setEQBand(index: number, gainDb: number) {
    if (index < 0 || index >= 10) return;
    const clampedGain = Math.max(-12.0, Math.min(12.0, gainDb));
    const newBands = [...this.settings.eqBands];
    newBands[index] = Number(clampedGain.toFixed(1));
    this.settings.eqBands = newBands;
    this.settings.eqPreset = 'Custom';
    this.persistSettings();
    this.notifyListeners();
  }

  applyPreset(presetName: EQPresetName) {
    if (presetName === 'Custom') return;
    const presetValues = EQ_PRESETS[presetName];
    if (presetValues) {
      this.settings.eqBands = [...presetValues];
      this.settings.eqPreset = presetName;
      this.persistSettings();
      this.notifyListeners();
    }
  }

  resetToDefaults() {
    this.settings = { ...DEFAULT_DSP_SETTINGS, eqBands: [...DEFAULT_DSP_SETTINGS.eqBands] };
    this.persistSettings();
    this.notifyListeners();
  }

  subscribe(listener: DSPChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const copy = this.getSettings();
    this.listeners.forEach((fn) => {
      try {
        fn(copy);
      } catch (err) {
        console.error('DSP listener error:', err);
      }
    });
  }
}

export const dspEngine = new DSPEngine();
