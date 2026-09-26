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
import { LinearGradient } from 'expo-linear-gradient';
import { QUALITY_OPTIONS, Song } from '../types';
import { THEME } from '../theme/theme';
import { ApiService } from '../services/apiService';
import { NativeExtractor } from '../services/nativeExtractor';
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
  const { songs, refreshSongs, playSong, showToast } = useMusic();

  const [url, setUrl] = useState('');
  const selectedQuality = QUALITY_OPTIONS[0];

  // Preview state
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<any | null>(null);

  // Offline toggle state (Default FALSE: keep in Cloud only, do not download offline unless requested)
  const [downloadOffline, setDownloadOffline] = useState(false);

  // Download & filler progress state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStep, setDownloadStep] = useState<string>('');

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && (text.includes('youtube.com') || text.includes('youtu.be') || /^[a-zA-Z0-9_-]{11}$/.test(text.trim()))) {
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
      console.warn('Preview notice:', e);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      Alert.alert('Missing URL', 'Please paste a YouTube video URL.');
      return;
    }

    // 1. DUPLICATE CHECK: Prevent re-downloading if song is already in user's tracks
    const videoId = NativeExtractor.extractVideoId(url.trim());
    const existingSong = songs.find((s) => {
      if (videoId && (s.id === videoId || s.source_id === videoId)) return true;
      if (s.source_url && videoId && s.source_url.includes(videoId)) return true;
      if (
        previewInfo?.title &&
        s.title.toLowerCase().trim() === previewInfo.title.toLowerCase().trim()
      ) {
        return true;
      }
      return false;
    });

    if (existingSong) {
      Alert.alert(
        'Already in Your Tracks',
        `"${existingSong.title}" is already in your library. No need to download it again!`,
        [
          { text: 'Close', style: 'cancel', onPress: resetAndClose },
          {
            text: 'Play Now',
            onPress: async () => {
              resetAndClose();
              await playSong(existingSong);
            },
          },
        ]
      );
      return;
    }

    // 2. Start Download with animated Filler Progress Bar
    try {
      setIsDownloading(true);
      setDownloadProgress(0.1);
      setDownloadStep('Resolving YouTube audio stream...');

      const result = await ApiService.downloadYouTubeAudio({
        url: url.trim(),
        quality: selectedQuality.id,
        userId: user?.id,
        uploadToSupabase: true,
        saveOffline: downloadOffline,
        onProgress: (progress, stepText) => {
          setDownloadProgress(progress);
          setDownloadStep(stepText);
        },
      });

      if (!result.success || !result.song) {
        throw new Error('Audio extraction failed.');
      }

      const savedSong = result.song;

      setDownloadProgress(1.0);
      setDownloadStep('Syncing library...');
      await refreshSongs();

      if (downloadOffline) {
        showToast(`Downloaded "${savedSong.title}" Offline`, 'download-done');
      } else {
        showToast(`Saved "${savedSong.title}" to Cloud Library`, 'cloud-done');
      }

      Alert.alert(
        downloadOffline ? 'Downloaded Offline' : 'Saved to Cloud Library',
        downloadOffline
          ? `"${savedSong.title}" is downloaded and stored on your device for offline playback.`
          : `"${savedSong.title}" is saved in your Cloud Library. You can stream it anytime or download it offline from the 3-dots (⋮) menu.`,
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
              await playSong(savedSong);
            },
          },
        ]
      );

      if (onSuccess) onSuccess(savedSong);
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Please check network connection.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStep('');
    }
  };

  const resetAndClose = () => {
    setUrl('');
    setPreviewInfo(null);
    setIsDownloading(false);
    setDownloadProgress(0);
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
                          {previewInfo.duration ? `${Math.floor(previewInfo.duration / 60)}:${(previewInfo.duration % 60).toString().padStart(2, '0')}` : 'Studio Audio'}
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
                    <Text style={styles.badgePillGoldText}>320K OPUS / M4A</Text>
                  </View>
                </View>
                <Text style={styles.qualityDesc}>
                  Bit-perfect studio audio encoded at 48kHz with full dynamic range. Matches and exceeds Spotify Premium 320k.
                </Text>
              </View>

              {/* Offline vs Cloud Storage Toggle */}
              <View style={styles.offlineToggleRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons
                      name={downloadOffline ? 'download' : 'cloud-outline'}
                      size={18}
                      color={downloadOffline ? THEME.colors.spotifyGreen : THEME.colors.textSecondary}
                    />
                    <Text style={styles.offlineToggleTitle}>
                      {downloadOffline ? 'Download Offline (Phone Storage)' : 'Cloud Library Only'}
                    </Text>
                  </View>
                  <Text style={styles.offlineToggleDesc}>
                    {downloadOffline
                      ? 'Downloads physical audio file to phone storage for playback without internet.'
                      : 'Saves to your library for instant streaming without taking up device storage.'}
                  </Text>
                </View>
                <Switch
                  value={downloadOffline}
                  onValueChange={setDownloadOffline}
                  trackColor={{ false: 'rgba(255, 255, 255, 0.1)', true: 'rgba(29, 185, 84, 0.4)' }}
                  thumbColor={downloadOffline ? THEME.colors.spotifyGreen : '#888'}
                />
              </View>

              {/* Download Filler Progress Bar */}
              {isDownloading && (
                <View style={styles.fillerContainer}>
                  <View style={styles.fillerHeader}>
                    <View style={styles.fillerStepRow}>
                      <MaterialCommunityIcons
                        name="lightning-bolt"
                        size={18}
                        color={THEME.colors.spotifyGreen}
                      />
                      <Text style={styles.fillerStepText} numberOfLines={1}>
                        {downloadStep}
                      </Text>
                    </View>
                    <Text style={styles.fillerPercentText}>
                      {Math.round(downloadProgress * 100)}%
                    </Text>
                  </View>

                  {/* Animated Progress Track */}
                  <View style={styles.fillerTrack}>
                    <LinearGradient
                      colors={['#1DB954', '#00F5D4', '#7928CA']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.fillerBar,
                        { width: `${Math.max(6, Math.min(100, downloadProgress * 100))}%` },
                      ]}
                    />
                  </View>
                </View>
              )}

              {/* Action Button */}
              <GlassButton
                title={
                  isDownloading
                    ? downloadOffline
                      ? 'Downloading Track...'
                      : 'Saving to Cloud...'
                    : downloadOffline
                    ? 'Download to Device'
                    : 'Save to Cloud Library'
                }
                onPress={handleDownload}
                loading={isDownloading}
                variant="primary"
                size="lg"
                icon={
                  <Ionicons
                    name={downloadOffline ? 'download' : 'cloud-upload-outline'}
                    size={20}
                    color="#08090D"
                  />
                }
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
  qualityCardSingle: {
    backgroundColor: 'rgba(29, 185, 84, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.4)',
    borderTopColor: 'rgba(30, 215, 96, 0.65)',
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    marginBottom: 14,
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
  offlineToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    marginBottom: 14,
  },
  offlineToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  offlineToggleDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  fillerContainer: {
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    marginBottom: 14,
  },
  fillerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fillerStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  fillerStepText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  fillerPercentText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
    marginLeft: 8,
  },
  fillerTrack: {
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fillerBar: {
    height: '100%',
    borderRadius: 5,
  },
});
