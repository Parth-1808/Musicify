import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Dimensions,
  Switch,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMusic } from '../context/MusicContext';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme/theme';
import { GlassCard } from '../components/GlassCard';
import { SongListItem } from '../components/SongListItem';
import { Song } from '../types';

interface HomeScreenProps {
  onOpenDownload: () => void;
  onOpenPlaylistModal: (song: Song) => void;
  onNavigateToLibrary: () => void;
  onNavigateToStats: () => void;
}

const { width } = Dimensions.get('window');

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpenDownload,
  onOpenPlaylistModal,
  onNavigateToLibrary,
  onNavigateToStats,
}) => {
  const { user, isGuest } = useAuth();
  const {
    songs,
    offlineSongs,
    playlists,
    favorites,
    playSong,
    currentSong,
    isPlaying,
    refreshSongs,
    isLoading,
    isOfflineMode,
    toggleOfflineMode,
  } = useMusic();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshSongs();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Sort by play count for "Most Listened"
  const topListenedSongs = [...songs]
    .filter((s) => (s.play_count || 0) > 0)
    .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
    .slice(0, 6);

  // Recently added
  const recentSongs = [...songs].slice(0, 8);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={THEME.colors.spotifyGreen}
        />
      }
    >
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.userName}>
            {user?.email ? user.email.split('@')[0] : isGuest ? 'Music Lover (Guest)' : 'Welcome'}
          </Text>
        </View>

        <TouchableOpacity onPress={onNavigateToStats} style={styles.statsBadge}>
          <Ionicons name="bar-chart" size={18} color={THEME.colors.spotifyGreen} />
          <Text style={styles.statsBadgeText}>Stats</Text>
        </TouchableOpacity>
      </View>

      {/* Sleek Offline Mode Toggle Switch Bar */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={toggleOfflineMode}
        style={styles.offlineToggleContainer}
      >
        <GlassCard
          glow={isOfflineMode ? 'spotify' : 'none'}
          style={styles.offlineCard}
          borderRadius={THEME.borderRadius.md}
        >
          <View style={styles.offlineRow}>
            <View style={[styles.offlineIconBox, isOfflineMode && styles.offlineIconBoxActive]}>
              <Ionicons
                name={isOfflineMode ? 'cloud-offline' : 'cloud-done-outline'}
                size={20}
                color={isOfflineMode ? THEME.colors.spotifyGreen : THEME.colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.offlineTitle}>
                  {isOfflineMode ? 'Offline Mode Active' : 'Offline Mode'}
                </Text>
                {isOfflineMode && (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>LOCAL ONLY</Text>
                  </View>
                )}
              </View>
              <Text style={styles.offlineSub}>
                {isOfflineMode
                  ? 'Playing local storage only (works with internet off)'
                  : 'Play local downloaded songs when offline'}
              </Text>
            </View>
            <Switch
              value={isOfflineMode}
              onValueChange={toggleOfflineMode}
              trackColor={{ false: 'rgba(255, 255, 255, 0.12)', true: THEME.colors.spotifyGreenGlow }}
              thumbColor={isOfflineMode ? THEME.colors.spotifyGreen : '#8E94A5'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>
        </GlassCard>
      </TouchableOpacity>

      {/* Quick YouTube Downloader Action Banner */}
      <TouchableOpacity activeOpacity={0.85} onPress={onOpenDownload}>
        <GlassCard glow="spotify" style={styles.downloadBanner} borderRadius={THEME.borderRadius.lg}>
          <LinearGradient
            colors={['rgba(29, 185, 84, 0.25)', 'rgba(0, 242, 254, 0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerGradient}
          >
            <View style={styles.bannerContent}>
              <View style={styles.bannerIconBox}>
                <Ionicons name="logo-youtube" size={28} color="#FF0000" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.bannerTitle}>Download in 320kbps Hi-Fi</Text>
                <Text style={styles.bannerSub}>
                  Paste any YouTube music link to extract higher quality than Spotify
                </Text>
              </View>
              <View style={styles.bannerActionBtn}>
                <Ionicons name="arrow-down" size={18} color="#08090D" />
              </View>
            </View>
          </LinearGradient>
        </GlassCard>
      </TouchableOpacity>

      {/* Quick Filter Shortcuts */}
      <View style={styles.shortcutsRow}>
        <TouchableOpacity
          onPress={onNavigateToLibrary}
          style={styles.shortcutPill}
        >
          <Ionicons name="disc" size={16} color={THEME.colors.spotifyGreen} />
          <Text style={styles.shortcutText}>{songs.length} Tracks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNavigateToLibrary}
          style={[styles.shortcutPill, { backgroundColor: 'rgba(29, 185, 84, 0.15)' }]}
        >
          <Ionicons name="cloud-offline" size={16} color={THEME.colors.spotifyGreen} />
          <Text style={[styles.shortcutText, { color: THEME.colors.spotifyGreen }]}>
            {offlineSongs.length} Offline
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNavigateToLibrary}
          style={styles.shortcutPill}
        >
          <Ionicons name="heart" size={16} color={THEME.colors.pinkNeon} />
          <Text style={styles.shortcutText}>{favorites.length} Liked</Text>
        </TouchableOpacity>
      </View>

      {/* Most Listened Section (Tracking Play Counts!) */}
      {topListenedSongs.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flame" size={20} color={THEME.colors.amberGlow} />
              <Text style={styles.sectionTitle}>Most Listened</Text>
            </View>
            <TouchableOpacity onPress={onNavigateToStats}>
              <Text style={styles.seeAllText}>View Stats</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {topListenedSongs.map((song) => (
              <TouchableOpacity
                key={song.id}
                activeOpacity={0.8}
                onPress={() => playSong(song, songs)}
                style={styles.topCard}
              >
                <GlassCard style={styles.topGlassCard} borderRadius={THEME.borderRadius.md}>
                  <Image
                    source={{ uri: song.localArtworkUri || song.artwork_url }}
                    style={styles.topCardImage}
                  />
                  <View style={styles.topPlayCountPill}>
                    <Ionicons name="play" size={10} color="#08090D" />
                    <Text style={styles.topPlayCountText}>{song.play_count} plays</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.topCardTitle}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.topCardArtist}>
                    {song.artist}
                  </Text>
                </GlassCard>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recently Added Section / Offline Tracks */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {isOfflineMode ? 'Downloaded Offline Tracks' : 'Recently Added'}
          </Text>
          <TouchableOpacity onPress={onNavigateToLibrary}>
            <Text style={styles.seeAllText}>See all ({songs.length})</Text>
          </TouchableOpacity>
        </View>

        {songs.length === 0 ? (
          <GlassCard style={styles.emptyCard} borderRadius={THEME.borderRadius.lg}>
            <Ionicons
              name={isOfflineMode ? 'cloud-offline-outline' : 'musical-notes'}
              size={48}
              color={THEME.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {isOfflineMode ? 'No Downloaded Songs' : 'Your library is empty'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isOfflineMode
                ? 'Turn off offline mode or download songs using the three-dots (⋮) menu to listen offline without internet.'
                : 'Tap the banner above to paste your first YouTube music link!'}
            </Text>
          </GlassCard>
        ) : (
          <View>
            {recentSongs.map((song) => (
              <SongListItem
                key={song.id}
                song={song}
                isActive={currentSong?.id === song.id}
                isPlaying={isPlaying}
                onPress={() => playSong(song, songs)}
                onAddToPlaylist={() => onOpenPlaylistModal(song)}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 150, // Space for floating MiniPlayer & bottom bar
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    gap: 6,
  },
  statsBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  downloadBanner: {
    marginBottom: 20,
    overflow: 'hidden',
  },
  bannerGradient: {
    padding: 16,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  bannerSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  bannerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.spotifyGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  shortcutsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  shortcutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.full,
    gap: 6,
  },
  shortcutText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  seeAllText: {
    fontSize: 13,
    color: THEME.colors.spotifyGreen,
    fontWeight: '700',
  },
  horizontalScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  topCard: {
    width: 140,
    marginRight: 14,
  },
  topGlassCard: {
    padding: 10,
  },
  topCardImage: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  topPlayCountPill: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.amberGlow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  topPlayCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#08090D',
  },
  topCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 8,
  },
  topCardArtist: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  offlineToggleContainer: {
    marginBottom: 16,
  },
  offlineCard: {
    padding: 12,
  },
  offlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineIconBoxActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.18)',
  },
  offlineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  activePill: {
    backgroundColor: THEME.colors.spotifyGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#08090D',
  },
  offlineSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
});
