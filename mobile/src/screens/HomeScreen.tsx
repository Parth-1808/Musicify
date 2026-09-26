import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMusic } from '../context/MusicContext';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme/theme';
import { GlassCard } from '../components/GlassCard';
import { SongListItem } from '../components/SongListItem';
import { ApiService } from '../services/apiService';
import { Song, TopListener } from '../types';

interface HomeScreenProps {
  onOpenDownload: () => void;
  onOpenPlaylistModal: (song: Song) => void;
  onNavigateToLibrary: () => void;
  onNavigateToStats: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpenDownload,
  onOpenPlaylistModal,
  onNavigateToLibrary,
  onNavigateToStats,
}) => {
  const { user } = useAuth();
  const {
    songs,
    offlineSongs,
    cloudSongs,
    favorites,
    playSong,
    currentSong,
    isPlaying,
    refreshSongs,
    isOfflineMode,
    toggleOfflineMode,
  } = useMusic();

  const [refreshing, setRefreshing] = useState(false);
  const [globalTopTracks, setGlobalTopTracks] = useState<Song[]>([]);
  const [topListener, setTopListener] = useState<TopListener | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshSongs(), loadHighlights()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadHighlights();
  }, [songs.length]);

  const loadHighlights = async () => {
    try {
      const [tracks, listeners] = await Promise.all([
        ApiService.fetchGlobalTopTracks(20),
        ApiService.fetchTopListeners(user?.id, user?.email),
      ]);
      setGlobalTopTracks(tracks);
      if (listeners && listeners.length > 0) {
        setTopListener(listeners[0]);
      }
    } catch {}
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formatLikes = (count?: number) => {
    if (count === undefined || count === null || count < 0) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return `${count}`;
  };

  const getRankBadgeStyle = (index: number) => {
    if (index === 0) return { bg: 'rgba(255, 184, 0, 0.25)', border: THEME.colors.amberGlow, text: THEME.colors.amberGlow };
    if (index === 1) return { bg: 'rgba(192, 192, 192, 0.25)', border: '#C0C0C0', text: '#F0F0F0' };
    if (index === 2) return { bg: 'rgba(205, 127, 50, 0.25)', border: '#CD7F32', text: '#E59866' };
    return { bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.12)', text: THEME.colors.textMuted };
  };

  // Recent songs from active pool (online: cloud only; offline: offline only)
  const recentSongs = [...songs].slice(0, 10);

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
            {user?.email ? user.email.split('@')[0] : 'Music Lover'}
          </Text>
        </View>

        <TouchableOpacity onPress={onNavigateToStats} style={styles.statsBadge}>
          <Ionicons name="bar-chart" size={17} color={THEME.colors.spotifyGreen} />
          <Text style={styles.statsBadgeText}>Stats</Text>
        </TouchableOpacity>
      </View>

      {/* Online / Offline Mode Toggle Card */}
      <TouchableOpacity
        activeOpacity={0.88}
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
                color={isOfflineMode ? THEME.colors.spotifyGreen : THEME.colors.cyanNeon}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.offlineTitle}>
                  {isOfflineMode ? 'Offline Mode' : 'Online Mode'}
                </Text>
                <View
                  style={[
                    styles.modePill,
                    isOfflineMode ? styles.modePillOffline : styles.modePillOnline,
                  ]}
                >
                  <Text
                    style={[
                      styles.modePillText,
                      isOfflineMode ? styles.modePillTextOffline : styles.modePillTextOnline,
                    ]}
                  >
                    {isOfflineMode ? 'OFFLINE ONLY' : 'CLOUD ONLY'}
                  </Text>
                </View>
              </View>
              <Text style={styles.offlineSub}>
                {isOfflineMode ? 'Showing device downloads only' : 'Showing cloud library only'}
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

      {/* YouTube Downloader Action Banner */}
      <TouchableOpacity activeOpacity={0.85} onPress={onOpenDownload}>
        <GlassCard glow="spotify" style={styles.downloadBanner} borderRadius={THEME.borderRadius.lg}>
          <LinearGradient
            colors={['rgba(29, 185, 84, 0.22)', 'rgba(0, 242, 254, 0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerGradient}
          >
            <View style={styles.bannerContent}>
              <View style={styles.bannerIconBox}>
                <Ionicons name="logo-youtube" size={26} color="#FF0000" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.bannerTitle}>Download in 320kbps</Text>
                <Text style={styles.bannerSub}>Studio Master Audio</Text>
              </View>
              <View style={styles.bannerActionBtn}>
                <Ionicons name="arrow-down" size={17} color="#08090D" />
              </View>
            </View>
          </LinearGradient>
        </GlassCard>
      </TouchableOpacity>

      {/* #1 Top Listener Spotlight Banner */}
      {topListener && (
        <TouchableOpacity activeOpacity={0.85} onPress={onNavigateToStats}>
          <GlassCard style={styles.championCard} borderRadius={THEME.borderRadius.md}>
            <View style={styles.championRow}>
              <Text style={{ fontSize: 18, marginRight: 8 }}>👑</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.championHeading}>#1 Top Listener</Text>
                  <View style={styles.championBadge}>
                    <Text style={styles.championBadgeText}>{topListener.badge}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.championName}>
                  {topListener.name} • {topListener.totalPlays} plays
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.colors.textMuted} />
            </View>
          </GlassCard>
        </TouchableOpacity>
      )}

      {/* Quick Filter Shortcuts */}
      <View style={styles.shortcutsRow}>
        <TouchableOpacity
          onPress={onNavigateToLibrary}
          style={styles.shortcutPill}
        >
          <Ionicons name="disc" size={15} color={THEME.colors.spotifyGreen} />
          <Text style={styles.shortcutText}>{isOfflineMode ? offlineSongs.length : cloudSongs.length} {isOfflineMode ? 'Offline' : 'Cloud'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNavigateToLibrary}
          style={[styles.shortcutPill, isOfflineMode && { backgroundColor: 'rgba(29, 185, 84, 0.15)' }]}
        >
          <Ionicons name="cloud-offline" size={15} color={THEME.colors.spotifyGreen} />
          <Text style={[styles.shortcutText, isOfflineMode && { color: THEME.colors.spotifyGreen }]}>
            {offlineSongs.length} Local
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNavigateToLibrary}
          style={styles.shortcutPill}
        >
          <Ionicons name="heart" size={15} color={THEME.colors.pinkNeon} />
          <Text style={styles.shortcutText}>{favorites.length} Liked</Text>
        </TouchableOpacity>
      </View>

      {/* Global Top 20 Streamed Tracks Section */}
      {globalTopTracks.length > 0 && !isOfflineMode && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flame" size={19} color={THEME.colors.amberGlow} />
              <Text style={styles.sectionTitle}>Top 20 Streamed Tracks</Text>
            </View>
            <TouchableOpacity onPress={onNavigateToStats}>
              <Text style={styles.seeAllText}>All 20</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {globalTopTracks.slice(0, 10).map((song, index) => {
              const rankStyle = getRankBadgeStyle(index);
              const isFav = favorites.includes(song.id) || Boolean(song.is_favorite);

              return (
                <TouchableOpacity
                  key={song.id}
                  activeOpacity={0.8}
                  onPress={() => playSong(song, globalTopTracks)}
                  style={styles.topCard}
                >
                  <GlassCard style={styles.topGlassCard} borderRadius={THEME.borderRadius.md}>
                    <View style={styles.imageWrapper}>
                      <Image
                        source={{ uri: song.localArtworkUri || song.artwork_url }}
                        style={styles.topCardImage}
                      />
                      <View style={[styles.rankOverlay, { backgroundColor: rankStyle.bg, borderColor: rankStyle.border }]}>
                        <Text style={[styles.rankOverlayText, { color: rankStyle.text }]}>
                          #{index + 1}
                        </Text>
                      </View>
                    </View>

                    <Text numberOfLines={1} style={styles.topCardTitle}>
                      {song.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.topCardArtist}>
                      {song.artist}
                    </Text>

                    <View style={styles.topCardFooter}>
                      <View style={styles.topPlayCountPill}>
                        <Ionicons name="play" size={9} color={THEME.colors.amberGlow} />
                        <Text style={styles.topPlayCountText}>{song.play_count || 0}</Text>
                      </View>

                      <View style={styles.topLikeCountPill}>
                        <Ionicons
                          name={isFav ? 'heart' : 'heart-outline'}
                          size={11}
                          color={isFav ? THEME.colors.pinkNeon : THEME.colors.textMuted}
                        />
                        <Text style={[styles.topLikeCountText, isFav && { color: THEME.colors.pinkNeon }]}>
                          {formatLikes(song.likes_count ?? (isFav ? 1 : 0))}
                        </Text>
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Active Tracks Section (Filtered: Cloud Only or Offline Only) */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {isOfflineMode ? 'Offline Tracks' : 'Cloud Library'}
          </Text>
          <TouchableOpacity onPress={onNavigateToLibrary}>
            <Text style={styles.seeAllText}>See all ({songs.length})</Text>
          </TouchableOpacity>
        </View>

        {songs.length === 0 ? (
          <GlassCard style={styles.emptyCard} borderRadius={THEME.borderRadius.lg}>
            <Ionicons
              name={isOfflineMode ? 'cloud-offline-outline' : 'musical-notes'}
              size={42}
              color={THEME.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {isOfflineMode ? 'No Offline Downloads' : 'Cloud Library Empty'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isOfflineMode
                ? 'Download songs from cloud library to listen without internet'
                : 'Paste YouTube music links to add tracks'}
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
    paddingBottom: 150,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greetingText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  statsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  offlineToggleContainer: {
    marginBottom: 12,
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
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineIconBoxActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
  },
  offlineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  modePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  modePillOnline: {
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    borderColor: 'rgba(0, 242, 254, 0.3)',
  },
  modePillOffline: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    borderColor: 'rgba(29, 185, 84, 0.35)',
  },
  modePillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modePillTextOnline: {
    color: THEME.colors.cyanNeon,
  },
  modePillTextOffline: {
    color: THEME.colors.spotifyGreen,
  },
  offlineSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  downloadBanner: {
    marginBottom: 12,
    overflow: 'hidden',
  },
  bannerGradient: {
    padding: 14,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  bannerSub: {
    fontSize: 12,
    color: THEME.colors.spotifyGreen,
    fontWeight: '600',
    marginTop: 1,
  },
  bannerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.colors.spotifyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  championCard: {
    padding: 12,
    marginBottom: 12,
  },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  championHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.amberGlow,
    letterSpacing: 0.5,
  },
  championBadge: {
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  championBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.amberGlow,
  },
  championName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  shortcutPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  horizontalScroll: {
    marginLeft: -4,
  },
  topCard: {
    width: 140,
    marginRight: 12,
  },
  topGlassCard: {
    padding: 10,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: 120,
    borderRadius: THEME.borderRadius.sm,
    overflow: 'hidden',
    marginBottom: 8,
  },
  topCardImage: {
    width: '100%',
    height: '100%',
  },
  rankOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  rankOverlayText: {
    fontSize: 10,
    fontWeight: '800',
  },
  topCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  topCardArtist: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  topCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  topPlayCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  topPlayCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.amberGlow,
  },
  topLikeCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  topLikeCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
