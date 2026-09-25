import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { QUALITY_OPTIONS, AudioQualityOption, Song } from '../types';
import { THEME } from '../theme/theme';
import { ApiService } from '../services/apiService';
import { useMusic } from '../context/MusicContext';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';

interface DownloadModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (song: Song) => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { refreshSongs, playSong, showToast } = useMusic();

  const [url, setUrl] = useState('');
  const selectedQuality = QUALITY_OPTIONS[0];

  // Preview state
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<any | null>(null);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStep, setDownloadStep] = useState<string>('');

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
        setUrl(text.trim());
        fetchPreview(text.trim());
      } else {
        Alert.alert('Clipboard Empty', 'Please copy a valid YouTube video link first.');
      }
    } catch {
      Alert.alert('Clipboard Error', 'Could not read from clipboard.');
    }
  };

  const fetchPreview = async (videoUrl: string) => {
    if (!videoUrl) return;
    try {
      setLoadingPreview(true);
      const info = await ApiService.getYouTubeInfo(videoUrl);
      setPreviewInfo(info);
    } catch (e: any) {
      console.warn('Preview error:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      Alert.alert('Missing URL', 'Please paste a YouTube video URL.');
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadStep('Extracting 320kbps Studio Master audio...');

      // 1. Download & convert on backend and upload to Supabase Cloud
      const result = await ApiService.downloadYouTubeAudio({
        url: url.trim(),
        quality: selectedQuality.id,
        userId: user?.id,
        uploadToSupabase: true,
      });

      if (!result.success || !result.song) {
        throw new Error('Audio extraction failed on backend.');
      }

      const downloadedSong = result.song;

      setDownloadStep('Syncing to Cloud Library...');
      await refreshSongs();
      showToast(`Saved "${downloadedSong.title}" to Cloud`, 'cloud-done');

      Alert.alert(
        'Saved to Cloud Library',
        `"${downloadedSong.title}" is saved in your Cloud Library at 320kbps Studio Master quality.\n\nTo listen offline without internet, tap the 3-dots (⋮) on this track and choose "Download Song".`,
        [
          {
            text: 'Close',
            style: 'cancel',
            onPress: () => {
              resetAndClose();
            },
          },
          {
            text: 'Play Now',
            onPress: async () => {
              resetAndClose();
              await playSong(downloadedSong);
            },
          },
        ]
      );

      if (onSuccess) onSuccess(downloadedSong);
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Check backend server connection.');
    } finally {
      setIsDownloading(false);
      setDownloadStep('');
    }
  };

  const resetAndClose = () => {
    setUrl('');
    setPreviewInfo(null);
    setIsDownloading(false);
    setDownloadStep('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={resetAndClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <GlassCard style={styles.sheetCard} borderRadius={THEME.borderRadius.xl}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.headerTitle}>Add YouTube Track</Text>
                  <Text style={styles.headerSub}>Extract Ultra Hi-Fi audio into your library</Text>
                </View>
                <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color={THEME.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* URL Input Row */}
              <View style={styles.inputWrapper}>
                <Ionicons name="logo-youtube" size={20} color={THEME.colors.danger} />
                <TextInput
                  placeholder="Paste YouTube link (https://...)"
                  placeholderTextColor={THEME.colors.textMuted}
                  value={url}
                  onChangeText={(val) => {
                    setUrl(val);
                    if (val.includes('youtu')) fetchPreview(val);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                />
                <TouchableOpacity onPress={handlePaste} style={styles.pasteBadge}>
                  <Feather name="clipboard" size={14} color={THEME.colors.spotifyGreen} />
                  <Text style={styles.pasteText}>Paste</Text>
                </TouchableOpacity>
              </View>

              {/* Preview Card */}
              {loadingPreview && (
                <View style={styles.previewLoading}>
                  <ActivityIndicator size="small" color={THEME.colors.spotifyGreen} />
                  <Text style={styles.previewLoadingText}>Inspecting YouTube stream...</Text>
                </View>
              )}

              {previewInfo && !loadingPreview && (
                <GlassCard style={styles.previewCard} borderRadius={THEME.borderRadius.md}>
                  <View style={styles.previewRow}>
                    <Image source={{ uri: previewInfo.thumbnail }} style={styles.previewThumb} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text numberOfLines={1} style={styles.previewTitle}>
                        {previewInfo.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.previewArtist}>
                        {previewInfo.artist}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Ionicons name="time-outline" size={12} color={THEME.colors.textMuted} />
                        <Text style={styles.previewDuration}>
                          {previewInfo.duration_formatted}
                        </Text>
                      </View>
                    </View>
                  </View>
                </GlassCard>
              )}

              {/* Single Premium Studio Master Quality Preset */}
              <Text style={styles.sectionLabel}>AUDIO QUALITY PRESET</Text>
              <View style={styles.qualityCardSingle}>
                <View style={styles.qualityHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="diamond" size={17} color={THEME.colors.spotifyGreen} />
                    <Text style={styles.qualityNameSelected}>320 kbps Ultra Studio Master</Text>
                  </View>
                  <View style={styles.badgePillGold}>
                    <Text style={styles.badgePillGoldText}>320K MP3 @ 48kHz</Text>
                  </View>
                </View>
                <Text style={styles.qualityDesc}>
                  High-bitrate studio master audio encoded at 48kHz with full dynamic range. Exceeds standard Spotify Free (160k) and matches Spotify Premium.
                </Text>
              </View>

              {/* Cloud Sync Information Notice */}
              <View style={styles.cloudNoticeRow}>
                <View style={styles.cloudNoticeIconBox}>
                  <Ionicons name="cloud-upload-outline" size={20} color={THEME.colors.spotifyGreen} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cloudNoticeTitle}>Saved to Cloud Library First</Text>
                  <Text style={styles.cloudNoticeSub}>
                    Just like Spotify, tracks are saved to your cloud library to stream on any device. Tap the 3-dots (⋮) anytime to download to local cache.
                  </Text>
                </View>
              </View>

              {/* Download Progress Message */}
              {isDownloading && (
                <View style={styles.downloadProgressCard}>
                  <ActivityIndicator size="small" color={THEME.colors.spotifyGreen} />
                  <Text style={styles.downloadStepText}>{downloadStep}</Text>
                </View>
              )}

              {/* Save to Cloud Action Button */}
              <GlassButton
                title={isDownloading ? 'Saving to Cloud Library...' : 'Save to Cloud Library'}
                onPress={handleDownload}
                loading={isDownloading}
                variant="primary"
                size="lg"
                icon={<Ionicons name="cloud-upload-outline" size={20} color="#08090D" />}
                style={{ marginTop: 14, marginBottom: 20 }}
              />
            </ScrollView>
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '90%',
  },
  sheetCard: {
    padding: 20,
    backgroundColor: 'rgba(12, 14, 22, 0.95)',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  headerSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  textInput: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    marginLeft: 10,
  },
  pasteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  pasteText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  previewLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 10,
  },
  previewLoadingText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  previewCard: {
    padding: 10,
    marginBottom: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  previewArtist: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  previewDuration: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 1.2,
    marginTop: 6,
    marginBottom: 10,
  },
  qualityContainer: {
    gap: 10,
    marginBottom: 16,
  },
  qualityCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: THEME.colors.glassBorder,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
  },
  qualityCardSingle: {
    backgroundColor: 'rgba(29, 185, 84, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.4)',
    borderTopColor: 'rgba(30, 215, 96, 0.65)',
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    marginBottom: 16,
  },
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  qualityNameSelected: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  badgePillGold: {
    backgroundColor: 'rgba(29, 185, 84, 0.25)',
    borderWidth: 1,
    borderColor: THEME.colors.spotifyGreen,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePillGoldText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.spotifyGreenLight,
    letterSpacing: 0.5,
  },
  qualityDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
  cloudNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginBottom: 12,
  },
  cloudNoticeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  cloudNoticeSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  downloadProgressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    padding: 12,
    borderRadius: THEME.borderRadius.md,
    gap: 10,
    marginBottom: 10,
  },
  downloadStepText: {
    fontSize: 13,
    color: THEME.colors.spotifyGreen,
    fontWeight: '600',
  },
});
