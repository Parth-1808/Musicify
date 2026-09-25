import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { Song } from '../types';
import { THEME } from '../theme/theme';
import { useMusic } from '../context/MusicContext';
import { GlassCard } from './GlassCard';

interface SongListItemProps {
  song: Song;
  onPress: () => void;
  isActive?: boolean;
  isPlaying?: boolean;
  onAddToPlaylist?: (song: Song) => void;
}

export const SongListItem: React.FC<SongListItemProps> = ({
  song,
  onPress,
  isActive = false,
  isPlaying = false,
  onAddToPlaylist,
}) => {
  const {
    toggleFavorite,
    favorites,
    playNext,
    addToQueue,
    downloadSongForOffline,
    removeSongOffline,
    deleteSongEverywhere,
  } = useMusic();

  const [menuVisible, setMenuVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isFav = favorites.includes(song.id) || Boolean(song.is_favorite);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await downloadSongForOffline(song);
      Alert.alert('Saved Offline', `"${song.title}" is now available offline.`);
    } catch (e: any) {
      Alert.alert('Download Error', e.message || 'Failed to download offline.');
    } finally {
      setDownloading(false);
      setMenuVisible(false);
    }
  };

  const handleRemoveOffline = async () => {
    await removeSongOffline(song.id);
    Alert.alert('Removed', 'Removed from offline storage.');
    setMenuVisible(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Song',
      `Are you sure you want to delete "${song.title}"? This will remove it from both cloud and local storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setMenuVisible(false);
            await deleteSongEverywhere(song.id);
          },
        },
      ]
    );
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={[styles.container, isActive && styles.activeContainer]}
      >
        {/* Cover Thumbnail */}
        <View style={styles.thumbnailContainer}>
          {song.localArtworkUri || song.artwork_url ? (
            <Image
              source={{ uri: song.localArtworkUri || song.artwork_url }}
              style={styles.thumbnail}
            />
          ) : (
            <View style={styles.placeholderThumbnail}>
              <Ionicons name="musical-notes" size={20} color={THEME.colors.textMuted} />
            </View>
          )}

          {/* Active Sound Indicator Overlay */}
          {isActive && (
            <View style={styles.playingOverlay}>
              <Ionicons
                name={isPlaying ? 'volume-high' : 'pause'}
                size={18}
                color={THEME.colors.spotifyGreen}
              />
            </View>
          )}
        </View>

        {/* Track Metadata */}
        <View style={styles.infoContainer}>
          <Text
            numberOfLines={1}
            style={[styles.title, isActive && styles.activeTitle]}
          >
            {song.title}
          </Text>

          <View style={styles.metaRow}>
            <Text numberOfLines={1} style={styles.artist}>
              {song.artist}
            </Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.duration}>
              {formatDuration(song.duration)}
            </Text>
          </View>

          {/* Badges: Times Listened, Offline Status, Bitrate */}
          <View style={styles.badgesRow}>
            {/* Play Count Badge */}
            <View style={styles.playCountBadge}>
              <Ionicons name="play" size={10} color={THEME.colors.amberGlow} />
              <Text style={styles.playCountText}>
                {song.play_count || 0} {song.play_count === 1 ? 'play' : 'plays'}
              </Text>
            </View>

            {/* Offline Saved Indicator */}
            {song.isOffline && (
              <View style={styles.offlineBadge}>
                <Ionicons name="arrow-down-circle" size={11} color={THEME.colors.spotifyGreen} />
                <Text style={styles.offlineBadgeText}>Offline</Text>
              </View>
            )}

            {/* Quality Tag */}
            {song.bitrate && (
              <View style={styles.bitrateBadge}>
                <Text style={styles.bitrateText}>{song.bitrate.split(' ')[0]}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Favorite Icon */}
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => toggleFavorite(song.id)}
          style={styles.favButton}
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={20}
            color={isFav ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
          />
        </TouchableOpacity>

        {/* More Actions Menu Button */}
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setMenuVisible(true)}
          style={styles.moreButton}
        >
          <Feather name="more-vertical" size={20} color={THEME.colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Action Sheet Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.modalContent}>
            <GlassCard style={styles.actionSheetCard}>
              <View style={styles.actionSheetHeader}>
                <Image
                  source={{ uri: song.localArtworkUri || song.artwork_url }}
                  style={styles.actionSheetThumb}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text numberOfLines={1} style={styles.actionSheetTitle}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.actionSheetArtist}>
                    {song.artist}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Play Next */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  playNext(song);
                  setMenuVisible(false);
                }}
              >
                <MaterialCommunityIcons
                  name="playlist-play"
                  size={22}
                  color={THEME.colors.textPrimary}
                />
                <Text style={styles.menuItemText}>Play Next</Text>
              </TouchableOpacity>

              {/* Add to Queue */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  addToQueue(song);
                  setMenuVisible(false);
                }}
              >
                <MaterialCommunityIcons
                  name="playlist-plus"
                  size={22}
                  color={THEME.colors.textPrimary}
                />
                <Text style={styles.menuItemText}>Add to Queue</Text>
              </TouchableOpacity>

              {/* Add to Playlist */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  if (onAddToPlaylist) onAddToPlaylist(song);
                }}
              >
                <Ionicons name="folder-outline" size={20} color={THEME.colors.textPrimary} />
                <Text style={styles.menuItemText}>Add to Playlist</Text>
              </TouchableOpacity>

              {/* Download / Remove Offline */}
              {song.isOffline ? (
                <TouchableOpacity style={styles.menuItem} onPress={handleRemoveOffline}>
                  <Ionicons name="trash-outline" size={20} color={THEME.colors.textSecondary} />
                  <Text style={styles.menuItemText}>Remove Offline Cache</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color={THEME.colors.spotifyGreen} />
                  ) : (
                    <Ionicons
                      name="arrow-down-circle-outline"
                      size={20}
                      color={THEME.colors.spotifyGreen}
                    />
                  )}
                  <Text style={[styles.menuItemText, { color: THEME.colors.spotifyGreen }]}>
                    {downloading ? 'Downloading...' : 'Save for Offline Playback'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.divider} />

              {/* Delete Song */}
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Ionicons name="trash" size={20} color={THEME.colors.danger} />
                <Text style={[styles.menuItemText, { color: THEME.colors.danger }]}>
                  Delete Song (Cloud & Local)
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.md,
    marginVertical: 3,
  },
  activeContainer: {
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderColor: 'rgba(29, 185, 84, 0.3)',
    borderWidth: 1,
  },
  thumbnailContainer: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: THEME.borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: THEME.colors.backgroundTertiary,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderThumbnail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginBottom: 3,
  },
  activeTitle: {
    color: THEME.colors.spotifyGreen,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  artist: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    maxWidth: '70%',
  },
  dot: {
    marginHorizontal: 5,
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  duration: {
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  playCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  playCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.amberGlow,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.spotifyGreen,
  },
  bitrateBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bitrateText: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.colors.cyanNeon,
  },
  favButton: {
    padding: 8,
  },
  moreButton: {
    padding: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    padding: 16,
  },
  actionSheetCard: {
    padding: 16,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionSheetThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  actionSheetArtist: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.glassBorder,
    marginVertical: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  menuItemText: {
    fontSize: 15,
    color: THEME.colors.textPrimary,
    fontWeight: '500',
  },
});
