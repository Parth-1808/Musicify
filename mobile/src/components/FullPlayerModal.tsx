import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';

import { SleepTimerModal } from './SleepTimerModal';

interface FullPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenQueue: () => void;
  onOpenPlaylistModal: () => void;
}

const { width, height } = Dimensions.get('window');

export const FullPlayerModal: React.FC<FullPlayerModalProps> = ({
  visible,
  onClose,
  onOpenQueue,
  onOpenPlaylistModal,
}) => {
  const {
    currentSong,
    isPlaying,
    positionMillis,
    durationMillis,
    togglePlay,
    nextSong,
    prevSong,
    seekTo,
    repeatMode,
    toggleRepeat,
    isShuffle,
    toggleShuffle,
    favorites,
    toggleFavorite,
    downloadSongForOffline,
    removeSongOffline,
    sleepTimerRemainingSeconds,
    isSleepTimerEndOfTrack,
  } = useMusic();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [sleepTimerVisible, setSleepTimerVisible] = useState(false);

  if (!currentSong) return null;

  const isFav = favorites.includes(currentSong.id) || Boolean(currentSong.is_favorite);

  const formatTime = (millis: number) => {
    const totalSecs = Math.max(0, Math.floor(millis / 1000));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatTimerRemaining = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSlidingStart = () => {
    setIsSeeking(true);
  };

  const handleValueChange = (val: number) => {
    setSeekValue(val);
  };

  const handleSlidingComplete = async (val: number) => {
    setIsSeeking(false);
    await seekTo(val);
  };

  const handleToggleOffline = async () => {
    if (currentSong.isOffline) {
      await removeSongOffline(currentSong.id);
      Alert.alert('Removed', 'Removed song from offline storage.');
    } else {
      try {
        setDownloading(true);
        await downloadSongForOffline(currentSong);
        Alert.alert('Saved Offline', 'Song downloaded for offline listening.');
      } catch (e: any) {
        Alert.alert('Download Error', e.message || 'Could not download offline.');
      } finally {
        setDownloading(false);
      }
    }
  };

  const currentPosition = isSeeking ? seekValue : positionMillis;
  const isTimerActive = sleepTimerRemainingSeconds !== null || isSleepTimerEndOfTrack;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Ambient Dark Gradient */}
        <LinearGradient
          colors={['#171926', '#090A0F', '#050608']}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={styles.safeArea}>
          {/* Header Bar */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Ionicons name="chevron-down" size={28} color={THEME.colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerSubtitle}>PLAYING FROM MUSIFY</Text>
              <Text numberOfLines={1} style={styles.headerTitle}>
                {currentSong.album || 'Personal Library'}
              </Text>
            </View>

            <View style={styles.headerRightActions}>
              <TouchableOpacity
                onPress={() => setSleepTimerVisible(true)}
                style={[styles.headerButton, isTimerActive && styles.activeTimerHeaderBtn]}
              >
                <Ionicons
                  name="moon"
                  size={20}
                  color={isTimerActive ? THEME.colors.spotifyGreen : THEME.colors.textPrimary}
                />
                {sleepTimerRemainingSeconds !== null && (
                  <Text style={styles.timerCountdownText}>
                    {formatTimerRemaining(sleepTimerRemainingSeconds)}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={onOpenPlaylistModal} style={styles.headerButton}>
                <Ionicons name="folder-outline" size={22} color={THEME.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Album Artwork Glass Card */}
          <View style={styles.artworkWrapper}>
            <GlassCard
              glow={isPlaying ? 'spotify' : 'none'}
              style={styles.artworkCard}
              borderRadius={THEME.borderRadius.xl}
            >
              {currentSong.localArtworkUri || currentSong.artwork_url ? (
                <Image
                  source={{ uri: currentSong.localArtworkUri || currentSong.artwork_url }}
                  style={styles.artworkImage}
                />
              ) : (
                <View style={styles.artworkPlaceholder}>
                  <Ionicons name="musical-notes" size={80} color={THEME.colors.textMuted} />
                </View>
              )}
            </GlassCard>
          </View>

          {/* Track Details & Favorite */}
          <View style={styles.trackDetailsContainer}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.songTitle}>
                {currentSong.title}
              </Text>
              <Text numberOfLines={1} style={styles.songArtist}>
                {currentSong.artist}
              </Text>

              {/* Status Tags */}
              <View style={styles.tagRow}>
                <View style={styles.badgePlayCount}>
                  <Ionicons name="sparkles" size={12} color={THEME.colors.amberGlow} />
                  <Text style={styles.badgeTextPlayCount}>
                    {currentSong.play_count || 0} {currentSong.play_count === 1 ? 'play' : 'plays'}
                  </Text>
                </View>

                <View style={styles.badgeQuality}>
                  <Text style={styles.badgeTextQuality}>
                    {currentSong.bitrate || '320kbps Hi-Fi'}
                  </Text>
                </View>

                {currentSong.isOffline && (
                  <View style={styles.badgeOffline}>
                    <Ionicons name="checkmark-circle" size={12} color={THEME.colors.spotifyGreen} />
                    <Text style={styles.badgeTextOffline}>Offline Ready</Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              onPress={() => toggleFavorite(currentSong.id)}
              style={styles.favButton}
            >
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={28}
                color={isFav ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Progress Slider */}
          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={durationMillis || 1}
              value={currentPosition}
              minimumTrackTintColor={THEME.colors.spotifyGreen}
              maximumTrackTintColor="rgba(255, 255, 255, 0.15)"
              thumbTintColor="#FFFFFF"
              onSlidingStart={handleSlidingStart}
              onValueChange={handleValueChange}
              onSlidingComplete={handleSlidingComplete}
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentPosition)}</Text>
              <Text style={styles.timeText}>{formatTime(durationMillis)}</Text>
            </View>
          </View>

          {/* Primary Playback Controls */}
          <View style={styles.controlsContainer}>
            {/* Shuffle */}
            <TouchableOpacity onPress={toggleShuffle} style={styles.secondaryControl}>
              <Ionicons
                name="shuffle"
                size={24}
                color={isShuffle ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
              />
            </TouchableOpacity>

            {/* Previous Track */}
            <TouchableOpacity onPress={prevSong} style={styles.mainControl}>
              <Ionicons name="play-skip-back" size={32} color={THEME.colors.textPrimary} />
            </TouchableOpacity>

            {/* Play / Pause Giant Button */}
            <TouchableOpacity activeOpacity={0.8} onPress={togglePlay} style={styles.playPauseGlow}>
              <LinearGradient
                colors={[THEME.colors.spotifyGreenLight, THEME.colors.spotifyGreen]}
                style={styles.playPauseButton}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={36}
                  color="#08090D"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              </LinearGradient>
            </TouchableOpacity>

            {/* Next Track */}
            <TouchableOpacity onPress={nextSong} style={styles.mainControl}>
              <Ionicons name="play-skip-forward" size={32} color={THEME.colors.textPrimary} />
            </TouchableOpacity>

            {/* Repeat Mode */}
            <TouchableOpacity onPress={toggleRepeat} style={styles.secondaryControl}>
              <MaterialCommunityIcons
                name={repeatMode === 'one' ? 'repeat-once' : 'repeat'}
                size={24}
                color={repeatMode !== 'off' ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Bottom Utility Bar (Queue, Sleep Timer & Offline Download) */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              onPress={handleToggleOffline}
              disabled={downloading}
              style={styles.bottomBarItem}
            >
              {downloading ? (
                <ActivityIndicator size="small" color={THEME.colors.spotifyGreen} />
              ) : (
                <Ionicons
                  name={currentSong.isOffline ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
                  size={22}
                  color={currentSong.isOffline ? THEME.colors.spotifyGreen : THEME.colors.textSecondary}
                />
              )}
              <Text
                style={[
                  styles.bottomBarText,
                  currentSong.isOffline && { color: THEME.colors.spotifyGreen },
                ]}
              >
                {currentSong.isOffline ? 'Downloaded' : 'Save Offline'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSleepTimerVisible(true)} style={styles.bottomBarItem}>
              <Ionicons
                name="moon"
                size={22}
                color={isTimerActive ? THEME.colors.spotifyGreen : THEME.colors.textSecondary}
              />
              <Text
                style={[
                  styles.bottomBarText,
                  isTimerActive && { color: THEME.colors.spotifyGreen },
                ]}
              >
                {isTimerActive
                  ? isSleepTimerEndOfTrack
                    ? 'End of Track'
                    : formatTimerRemaining(sleepTimerRemainingSeconds || 0)
                  : 'Sleep Timer'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onOpenQueue} style={styles.bottomBarItem}>
              <Ionicons name="list" size={22} color={THEME.colors.textSecondary} />
              <Text style={styles.bottomBarText}>Up Next</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Sleep Timer Bottom Sheet Modal */}
        <SleepTimerModal
          visible={sleepTimerVisible}
          onClose={() => setSleepTimerVisible(false)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#08090D',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  headerButton: {
    padding: 8,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeTimerHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    borderRadius: THEME.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  timerCountdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  headerTitleContainer: {
    alignItems: 'center',
    maxWidth: '70%',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  artworkWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  artworkCard: {
    width: width - 56,
    height: width - 56,
    maxHeight: 340,
    maxWidth: 340,
    padding: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    borderRadius: THEME.borderRadius.xl,
    resizeMode: 'cover',
  },
  artworkPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackDetailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  songTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 16,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  badgePlayCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  badgeTextPlayCount: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.amberGlow,
  },
  badgeQuality: {
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeTextQuality: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.cyanNeon,
  },
  badgeOffline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  badgeTextOffline: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  favButton: {
    padding: 8,
  },
  sliderContainer: {
    marginVertical: 6,
  },
  slider: {
    width: '100%',
    height: 38,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  timeText: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    fontWeight: '500',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginVertical: 10,
  },
  secondaryControl: {
    padding: 10,
  },
  mainControl: {
    padding: 10,
  },
  playPauseGlow: {
    shadowColor: THEME.colors.spotifyGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  playPauseButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.glassBorder,
    marginBottom: Platform.OS === 'ios' ? 0 : 12,
  },
  bottomBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
  },
  bottomBarText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
});
