import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';

interface MiniPlayerProps {
  onPress: () => void;
}

const { width } = Dimensions.get('window');

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onPress }) => {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    nextSong,
    positionMillis,
    durationMillis,
  } = useMusic();

  if (!currentSong) return null;

  const progress = durationMillis > 0 ? positionMillis / durationMillis : 0;
  const progressPercent = `${Math.min(100, Math.max(0, progress * 100))}%`;

  return (
    <View style={styles.outerContainer}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        <GlassCard
          glow={isPlaying ? 'spotify' : 'none'}
          style={styles.card}
          borderRadius={THEME.borderRadius.lg}
        >
          {/* Glowing Playback Progress Bar */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: progressPercent as any }]} />
          </View>

          <View style={styles.contentRow}>
            {/* Artwork */}
            <View style={styles.artContainer}>
              {currentSong.localArtworkUri || currentSong.artwork_url ? (
                <Image
                  source={{ uri: currentSong.localArtworkUri || currentSong.artwork_url }}
                  style={styles.art}
                />
              ) : (
                <View style={styles.artPlaceholder}>
                  <Ionicons name="musical-notes" size={20} color={THEME.colors.textMuted} />
                </View>
              )}
            </View>

            {/* Song Meta */}
            <View style={styles.metaContainer}>
              <Text numberOfLines={1} style={styles.title}>
                {currentSong.title}
              </Text>
              <View style={styles.subRow}>
                <Text numberOfLines={1} style={styles.artist}>
                  {currentSong.artist}
                </Text>
                {currentSong.play_count > 0 && (
                  <>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.playCount}>{currentSong.play_count} plays</Text>
                  </>
                )}
              </View>
            </View>

            {/* Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={togglePlay}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.playButton}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={24}
                  color={THEME.colors.spotifyGreen}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={nextSong}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.nextButton}
              >
                <Ionicons name="play-forward" size={22} color={THEME.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 84, // Sits right above bottom tab navigation
    left: 12,
    right: 12,
    zIndex: 99,
  },
  card: {
    padding: 0,
    backgroundColor: 'rgba(18, 20, 29, 0.88)',
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.spotifyGreen,
    shadowColor: THEME.colors.spotifyGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  artContainer: {
    width: 46,
    height: 46,
    borderRadius: THEME.borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: THEME.colors.backgroundTertiary,
  },
  art: {
    width: '100%',
    height: '100%',
  },
  artPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  artist: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    maxWidth: '75%',
  },
  dot: {
    marginHorizontal: 4,
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  playCount: {
    fontSize: 11,
    color: THEME.colors.amberGlow,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playButton: {
    padding: 6,
  },
  nextButton: {
    padding: 6,
  },
});
