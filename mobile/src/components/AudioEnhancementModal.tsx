import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import {
  EQ_FREQUENCIES,
  EQ_BAND_LABELS,
  EQ_PRESETS,
  EQPresetName,
  shouldApplyOnDeviceRestoration,
} from '../services/dspEngine';

interface AudioEnhancementModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AudioEnhancementModal: React.FC<AudioEnhancementModalProps> = ({
  visible,
  onClose,
}) => {
  const {
    currentSong,
    dspSettings,
    updateDSPSettings,
    setEQBand,
    applyEQPreset,
    resetDSPToDefaults,
    currentNormalizationInfo,
  } = useMusic();

  const [activeTab, setActiveTab] = useState<'enhancement' | 'equalizer'>('enhancement');

  const {
    enhancementEnabled,
    normalizationEnabled,
    spatialWidth,
    clarityAir,
    neuralRestorationEnabled,
    eqBands,
    eqPreset,
  } = dspSettings;

  const currentGainDb = currentNormalizationInfo.normGain?.gainDb ?? 0.0;
  const songLufs = currentSong?.integrated_lufs ?? currentNormalizationInfo.songLufs;
  const truePeak = currentSong?.true_peak_dbtp ?? currentNormalizationInfo.songTruePeak;
  const isClamped = currentNormalizationInfo.normGain?.isClamped ?? false;

  const restorationStatus = shouldApplyOnDeviceRestoration(
    currentSong?.source_bitrate_kbps,
    currentSong?.source_codec,
    neuralRestorationEnabled && enhancementEnabled
  );

  const getWidthDescription = (w: number) => {
    const pct = Math.round(w * 100);
    if (pct <= 102) return `${pct}% (Standard Stereo)`;
    if (pct <= 118) return `${pct}% (Subtle Enhance - Default)`;
    return `${pct}% (Expanded Soundstage)`;
  };

  const getAirDescription = (db: number) => {
    if (db <= 0.2) return 'Off (Dry Signal)';
    if (db <= 2.5) return `+${db.toFixed(1)} dB (Subtle Air - Default)`;
    if (db <= 4.5) return `+${db.toFixed(1)} dB (Bright Sparkle)`;
    return `+${db.toFixed(1)} dB (Maximum Brilliance)`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#131722', '#0A0C13']}
            style={styles.gradientSurface}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconBadge}>
                  <MaterialCommunityIcons name="equalizer-outline" size={22} color={THEME.colors.cyanNeon} />
                </View>
                <View>
                  <Text style={styles.title}>Audio Enhancement & DSP</Text>
                  <Text style={styles.subtitle}>Real-Time 32-bit Floating-Point Engine</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={resetDSPToDefaults}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={16} color={THEME.colors.textSecondary} />
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={22} color={THEME.colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Segmented Tab Bar */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'enhancement' && styles.tabButtonActive]}
                onPress={() => setActiveTab('enhancement')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="sparkles"
                  size={16}
                  color={activeTab === 'enhancement' ? THEME.colors.cyanNeon : THEME.colors.textMuted}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'enhancement' && styles.tabButtonTextActive,
                  ]}
                >
                  Enhancement & Normalization
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'equalizer' && styles.tabButtonActive]}
                onPress={() => setActiveTab('equalizer')}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="tune-vertical"
                  size={18}
                  color={activeTab === 'equalizer' ? THEME.colors.cyanNeon : THEME.colors.textMuted}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'equalizer' && styles.tabButtonTextActive,
                  ]}
                >
                  10-Band EQ
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollContent}
              contentContainerStyle={styles.scrollContentContainer}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === 'enhancement' ? (
                <>
                  {/* Master DSP Toggle Card */}
                  <View style={styles.card}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardTextContainer}>
                        <View style={styles.cardTitleRow}>
                          <Ionicons name="power" size={18} color={enhancementEnabled ? THEME.colors.spotifyGreen : THEME.colors.textMuted} />
                          <Text style={styles.cardTitle}>Master Audio Enhancement</Text>
                        </View>
                        <Text style={styles.cardDescription}>
                          Enable real-time stereo widening, harmonic excitation, and EQ chain.
                        </Text>
                      </View>
                      <Switch
                        value={enhancementEnabled}
                        onValueChange={(val) => updateDSPSettings({ enhancementEnabled: val })}
                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.colors.spotifyGreenLight }}
                        thumbColor={Platform.OS === 'ios' ? '#fff' : enhancementEnabled ? '#fff' : '#888'}
                      />
                    </View>
                  </View>

                  {/* Loudness Normalization Card */}
                  <View style={[styles.card, !enhancementEnabled && styles.cardDisabled]}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardTextContainer}>
                        <View style={styles.cardTitleRow}>
                          <Ionicons name="volume-medium" size={18} color={THEME.colors.cyanNeon} />
                          <Text style={styles.cardTitle}>Loudness Normalization (EBU R128)</Text>
                        </View>
                        <Text style={styles.cardDescription}>
                          Standardizes volume to -14 LUFS to eliminate sudden volume jumps between tracks with smooth 100ms fade.
                        </Text>
                      </View>
                      <Switch
                        value={normalizationEnabled}
                        disabled={!enhancementEnabled}
                        onValueChange={(val) => updateDSPSettings({ normalizationEnabled: val })}
                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.colors.cyanNeon }}
                        thumbColor={Platform.OS === 'ios' ? '#fff' : normalizationEnabled ? '#fff' : '#888'}
                      />
                    </View>

                    {/* Live Loudness Metrics Badge */}
                    <View style={styles.metricsContainer}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Target Loudness</Text>
                        <Text style={styles.metricValue}>-14.0 LUFS</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Current Track</Text>
                        <Text style={styles.metricValue}>
                          {songLufs != null ? `${songLufs.toFixed(1)} LUFS` : 'Nominal'}
                        </Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Live Gain Offset</Text>
                        <Text
                          style={[
                            styles.metricValue,
                            { color: normalizationEnabled && enhancementEnabled ? THEME.colors.spotifyGreenLight : THEME.colors.textMuted },
                          ]}
                        >
                          {normalizationEnabled && enhancementEnabled
                            ? currentGainDb > 0
                              ? `+${currentGainDb.toFixed(2)} dB`
                              : `${currentGainDb.toFixed(2)} dB`
                            : '0.00 dB (Bypass)'}
                        </Text>
                      </View>
                    </View>

                    {isClamped && normalizationEnabled && enhancementEnabled && (
                      <View style={styles.clampedNotice}>
                        <Ionicons name="shield-checkmark" size={14} color={THEME.colors.amberGlow} />
                        <Text style={styles.clampedNoticeText}>
                          True-Peak guard active (-1.0 dBTP ceiling preserved).
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Spatial Width Slider Card */}
                  <View style={[styles.card, !enhancementEnabled && styles.cardDisabled]}>
                    <View style={styles.sliderHeader}>
                      <View style={styles.cardTitleRow}>
                        <MaterialCommunityIcons name="surround-sound" size={18} color={THEME.colors.purpleNeon} />
                        <Text style={styles.cardTitle}>Spatial Stereo Width</Text>
                      </View>
                      <Text style={styles.sliderValueText}>{getWidthDescription(spatialWidth)}</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                      Mid/Side matrix widening. Mid channel is 100% untouched for full mono compatibility.
                    </Text>

                    <View style={styles.sliderWrapper}>
                      <Text style={styles.sliderMinMax}>100%</Text>
                      <Slider
                        style={styles.slider}
                        minimumValue={1.0}
                        maximumValue={1.3}
                        step={0.01}
                        value={spatialWidth}
                        disabled={!enhancementEnabled}
                        minimumTrackTintColor={THEME.colors.purpleNeon}
                        maximumTrackTintColor="rgba(255,255,255,0.15)"
                        thumbTintColor={THEME.colors.cyanNeon}
                        onValueChange={(val) => updateDSPSettings({ spatialWidth: Number(val.toFixed(2)) })}
                      />
                      <Text style={styles.sliderMinMax}>130%</Text>
                    </View>
                  </View>

                  {/* Clarity / Air Harmonic Exciter Card */}
                  <View style={[styles.card, !enhancementEnabled && styles.cardDisabled]}>
                    <View style={styles.sliderHeader}>
                      <View style={styles.cardTitleRow}>
                        <Feather name="wind" size={18} color={THEME.colors.cyanNeon} />
                        <Text style={styles.cardTitle}>Clarity & Air (Harmonic Exciter)</Text>
                      </View>
                      <Text style={styles.sliderValueText}>{getAirDescription(clarityAir)}</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                      Bandpass non-linear polynomial saturation above 4kHz. Restores natural high-frequency brilliance without harshness.
                    </Text>

                    <View style={styles.sliderWrapper}>
                      <Text style={styles.sliderMinMax}>0 dB</Text>
                      <Slider
                        style={styles.slider}
                        minimumValue={0.0}
                        maximumValue={6.0}
                        step={0.2}
                        value={clarityAir}
                        disabled={!enhancementEnabled}
                        minimumTrackTintColor={THEME.colors.cyanNeon}
                        maximumTrackTintColor="rgba(255,255,255,0.15)"
                        thumbTintColor={THEME.colors.cyanNeon}
                        onValueChange={(val) => updateDSPSettings({ clarityAir: Number(val.toFixed(1)) })}
                      />
                      <Text style={styles.sliderMinMax}>+6 dB</Text>
                    </View>
                  </View>

                  {/* Low-Bitrate Neural Restoration Card (Phase 5 - Opt-In) */}
                  <View style={[styles.card, !enhancementEnabled && styles.cardDisabled]}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardTextContainer}>
                        <View style={styles.cardTitleRow}>
                          <MaterialCommunityIcons
                            name="brain"
                            size={18}
                            color={restorationStatus.shouldRestore ? THEME.colors.cyanNeon : THEME.colors.textMuted}
                          />
                          <Text style={styles.cardTitle}>Low-Bitrate Neural Restoration</Text>
                        </View>
                        <Text style={styles.cardDescription}>
                          Reconstructs lost high-frequency air (&gt;12kHz) and reduces pre-echo compression artifacts for sources &lt;128kbps.
                        </Text>
                      </View>
                      <Switch
                        value={neuralRestorationEnabled}
                        disabled={!enhancementEnabled}
                        onValueChange={(val) => updateDSPSettings({ neuralRestorationEnabled: val })}
                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.colors.cyanNeon }}
                        thumbColor={Platform.OS === 'ios' ? '#fff' : neuralRestorationEnabled ? '#fff' : '#888'}
                      />
                    </View>

                    {/* Status Badge */}
                    <View style={styles.metricsContainer}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Restoration Engine</Text>
                        <Text
                          style={[
                            styles.metricValue,
                            restorationStatus.shouldRestore
                              ? { color: THEME.colors.cyanNeon }
                              : { color: THEME.colors.textMuted },
                          ]}
                        >
                          {restorationStatus.reason}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Peak Limiter Architecture Note */}
                  <View style={styles.footerNote}>
                    <Ionicons name="lock-closed" size={14} color={THEME.colors.textMuted} />
                    <Text style={styles.footerNoteText}>
                      Lookahead Peak Limiter active at -0.5 dBTP (0.5ms attack / 50ms release) to ensure bit-perfect clip prevention.
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  {/* Equalizer Presets Row */}
                  <View style={styles.card}>
                    <Text style={styles.sectionHeading}>EQ Presets</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.presetsRow}
                    >
                      {(['Musify Signature', 'Flat', 'Bass Boost', 'Vocal', 'Electronic', 'Rock', 'Acoustic'] as EQPresetName[]).map((pName) => {
                        const isSelected = eqPreset === pName;
                        return (
                          <TouchableOpacity
                            key={pName}
                            style={[
                              styles.presetChip,
                              isSelected && styles.presetChipActive,
                            ]}
                            onPress={() => applyEQPreset(pName)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.presetChipText,
                                isSelected && styles.presetChipTextActive,
                              ]}
                            >
                              {pName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* 10-Band Sliders Card */}
                  <View style={[styles.card, !enhancementEnabled && styles.cardDisabled]}>
                    <View style={styles.eqHeader}>
                      <Text style={styles.sectionHeading}>10-Band Parametric Peaking Filters</Text>
                      <Text style={styles.eqPresetIndicator}>
                        Preset: <Text style={{ color: THEME.colors.cyanNeon, fontWeight: '700' }}>{eqPreset}</Text>
                      </Text>
                    </View>
                    <Text style={styles.cardDescription}>
                      High-precision peaking biquad filters with Q=1.414. Range: -12.0 dB to +12.0 dB.
                    </Text>

                    {/* 10 Vertical/Horizontal Band Sliders */}
                    <View style={styles.eqBandsList}>
                      {EQ_FREQUENCIES.map((freq, index) => {
                        const bandGain = eqBands[index] ?? 0.0;
                        const label = EQ_BAND_LABELS[index];
                        return (
                          <View key={freq} style={styles.bandRow}>
                            <View style={styles.bandLabelCol}>
                              <Text style={styles.bandFreqText}>{label}</Text>
                              <Text
                                style={[
                                  styles.bandGainText,
                                  bandGain > 0
                                    ? { color: THEME.colors.spotifyGreenLight }
                                    : bandGain < 0
                                    ? { color: THEME.colors.pinkNeon }
                                    : { color: THEME.colors.textMuted },
                                ]}
                              >
                                {bandGain > 0 ? `+${bandGain.toFixed(1)}` : bandGain.toFixed(1)} dB
                              </Text>
                            </View>

                            <Slider
                              style={styles.bandSlider}
                              minimumValue={-12.0}
                              maximumValue={12.0}
                              step={0.5}
                              value={bandGain}
                              disabled={!enhancementEnabled}
                              minimumTrackTintColor={
                                bandGain >= 0 ? THEME.colors.cyanNeon : THEME.colors.pinkNeon
                              }
                              maximumTrackTintColor="rgba(255,255,255,0.12)"
                              thumbTintColor={THEME.colors.textPrimary}
                              onValueChange={(val) => setEQBand(index, val)}
                            />

                            <TouchableOpacity
                              style={styles.bandZeroBtn}
                              onPress={() => setEQBand(index, 0.0)}
                              activeOpacity={0.6}
                            >
                              <Text style={styles.bandZeroText}>0</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  gradientSurface: {
    flex: 1,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
  },
  title: {
    color: THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  resetButtonText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  tabButtonText: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardDisabled: {
    opacity: 0.45,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  cardDescription: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  metricsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  metricLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  clampedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clampedNoticeText: {
    color: THEME.colors.amberGlow,
    fontSize: 11,
    fontWeight: '500',
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderValueText: {
    color: THEME.colors.cyanNeon,
    fontSize: 12,
    fontWeight: '700',
  },
  sliderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  slider: {
    flex: 1,
    height: 36,
  },
  sliderMinMax: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    width: 36,
    textAlign: 'center',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  footerNoteText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  sectionHeading: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(0, 242, 254, 0.15)',
    borderColor: THEME.colors.cyanNeon,
  },
  presetChipText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: THEME.colors.cyanNeon,
    fontWeight: '700',
  },
  eqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eqPresetIndicator: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
  eqBandsList: {
    marginTop: 14,
    gap: 8,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bandLabelCol: {
    width: 60,
  },
  bandFreqText: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  bandGainText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  bandSlider: {
    flex: 1,
    height: 32,
  },
  bandZeroBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandZeroText: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
});
