import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMusic } from '../context/MusicContext';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme/theme';
import { GlassCard } from '../components/GlassCard';
import { ApiService } from '../services/apiService';
import { Song, TopListener } from '../types';

interface StatsScreenProps {
  onBack: () => void;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({ onBack }) => {
  const { songs, offlineSongs, favorites, playSong, toggleFavorite } = useMusic();
  const { user } = useAuth();

  const [globalTracks, setGlobalTracks] = useState<Song[]>([]);
  const [topListeners, setTopListeners] = useState<TopListener[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(true);

  // Aggregate user's local stats
  const totalPlays = songs.reduce((acc, s) => acc + (s.play_count || 0), 0);
  const totalDurationSecs = songs.reduce(
    (acc, s) => acc + (s.play_count || 0) * (s.duration || 180),
    0
  );
  const totalHours = (totalDurationSecs / 3600).toFixed(1);

  useEffect(() => {
    loadLeaderboardData();
  }, [totalPlays]);

  const loadLeaderboardData = async () => {
    try {
      setLoadingGlobal(true);
      const [tracks, listeners] = await Promise.all([
        ApiService.fetchGlobalTopTracks(20),
        ApiService.fetchTopListeners(user?.id, user?.email, totalPlays),
      ]);
      setGlobalTracks(tracks);
      setTopListeners(listeners);
    } catch (e) {
      console.warn('Leaderboard fetch note:', e);
    } finally {
      setLoadingGlobal(false);
    }
  };

  const numberOneListener = topListeners[0];

  const getRankBadgeStyle = (index: number) => {
    if (index === 0) {
      return {
        bg: 'rgba(255, 184, 0, 0.25)',
        border: THEME.colors.amberGlow,
        text: THEME.colors.amberGlow,
        label: '#1',
      };
    }
    if (index === 1) {
      return {
        bg: 'rgba(192, 192, 192, 0.25)',
        border: '#C0C0C0',
        text: '#F0F0F0',
        label: '#2',
      };
    }
    if (index === 2) {
      return {
        bg: 'rgba(205, 127, 50, 0.25)',
        border: '#CD7F32',
        text: '#E59866',
        label: '#3',
      };
    }
    return {
      bg: 'rgba(255, 255, 255, 0.05)',
      border: 'rgba(255, 255, 255, 0.12)',
      text: THEME.colors.textMuted,
      label: `#${index + 1}`,
    };
  };

  const formatLikes = (count?: number) => {
    if (count === undefined || count === null || count < 0) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return `${count}`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard & Insights</Text>
        <TouchableOpacity onPress={loadLeaderboardData} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={THEME.colors.spotifyGreen} />
        </TouchableOpacity>
      </View>

      {/* 4 Metric Overview Cards */}
      <View style={styles.overviewGrid}>
        <GlassCard glow="spotify" style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="play" size={22} color={THEME.colors.spotifyGreen} />
          <Text style={styles.statNumber}>{totalPlays}</Text>
          <Text style={styles.statLabel}>Times Listened</Text>
        </GlassCard>

        <GlassCard glow="cyan" style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="time" size={22} color={THEME.colors.cyanNeon} />
          <Text style={styles.statNumber}>{totalHours}h</Text>
          <Text style={styles.statLabel}>Streamed Audio</Text>
        </GlassCard>
      </View>

      <View style={styles.overviewGrid}>
        <GlassCard style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="cloud-offline" size={22} color={THEME.colors.spotifyGreen} />
          <Text style={styles.statNumber}>{offlineSongs.length}</Text>
          <Text style={styles.statLabel}>Offline Ready</Text>
        </GlassCard>

        <GlassCard style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="heart" size={22} color={THEME.colors.pinkNeon} />
          <Text style={styles.statNumber}>{favorites.length}</Text>
          <Text style={styles.statLabel}>Liked Tracks</Text>
        </GlassCard>
      </View>

      {/* #1 Most Top Listener Hero Showcase Card */}
      {numberOneListener && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="trophy" size={20} color={THEME.colors.amberGlow} />
            <Text style={styles.sectionTitle}>#1 Most Top Listener</Text>
            <View style={styles.pillGlobal}>
              <Text style={styles.pillGlobalText}>COMMUNITY CHAMPION</Text>
            </View>
          </View>

          <GlassCard glow="spotify" style={styles.topListenerCard} borderRadius={THEME.borderRadius.xl}>
            <LinearGradient
              colors={['rgba(255, 184, 0, 0.15)', 'rgba(29, 185, 84, 0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.listenerGradient}
            >
              <View style={styles.listenerCardContent}>
                <View style={styles.crownAvatarContainer}>
                  <View style={styles.crownPill}>
                    <Text style={{ fontSize: 18 }}>👑</Text>
                  </View>
                  <View style={styles.listenerAvatarBox}>
                    {numberOneListener.avatarUrl ? (
                      <Image source={{ uri: numberOneListener.avatarUrl }} style={styles.listenerAvatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarInitials}>
                          {numberOneListener.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.listenerMeta}>
                  <View style={styles.badgeRow}>
                    <Text style={styles.listenerBadgeText}>{numberOneListener.badge}</Text>
                    {numberOneListener.isCurrentUser && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>YOU</Text>
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={styles.listenerName}>
                    {numberOneListener.name}
                  </Text>

                  <View style={styles.listenerStatRow}>
                    <View style={styles.listenerStatPill}>
                      <Ionicons name="play" size={12} color={THEME.colors.spotifyGreen} />
                      <Text style={styles.listenerStatPillText}>
                        {numberOneListener.totalPlays} plays
                      </Text>
                    </View>
                    <View style={styles.listenerStatPill}>
                      <Ionicons name="time" size={12} color={THEME.colors.cyanNeon} />
                      <Text style={styles.listenerStatPillText}>
                        {numberOneListener.totalHours}h audio
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </GlassCard>
        </View>
      )}

      {/* Top Listeners Community Leaderboard */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="podium-outline" size={20} color={THEME.colors.cyanNeon} />
          <Text style={styles.sectionTitle}>Top Listeners Leaderboard</Text>
        </View>

        {topListeners.slice(0, 5).map((listener, idx) => {
          const rankStyle = getRankBadgeStyle(idx);
          return (
            <GlassCard
              key={listener.userId}
              style={[
                styles.listenerRowCard,
                listener.isCurrentUser && styles.currentUserRowCard,
              ]}
              borderRadius={THEME.borderRadius.md}
            >
              <View
                style={[
                  styles.rankBox,
                  { backgroundColor: rankStyle.bg, borderColor: rankStyle.border },
                ]}
              >
                <Text style={[styles.rankBoxText, { color: rankStyle.text }]}>
                  {idx + 1}
                </Text>
              </View>

              <View style={styles.listenerRowAvatar}>
                {listener.avatarUrl ? (
                  <Image source={{ uri: listener.avatarUrl }} style={styles.smallAvatar} />
                ) : (
                  <View style={styles.smallAvatarFallback}>
                    <Text style={styles.smallAvatarText}>
                      {listener.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={styles.listenerRowName}>
                    {listener.name}
                  </Text>
                  {listener.isCurrentUser && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>YOU</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.listenerRowBadge}>{listener.badge}</Text>
              </View>

              <View style={styles.listenerCountBox}>
                <Text style={styles.listenerCountNumber}>{listener.totalPlays}</Text>
                <Text style={styles.listenerCountLabel}>plays</Text>
              </View>
            </GlassCard>
          );
        })}
      </View>

      {/* Global Top 20 Streamed Tracks Section */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="flame" size={22} color={THEME.colors.amberGlow} />
          <Text style={styles.sectionTitle}>Top 20 Streamed Tracks</Text>
          <View style={styles.pillCommunity}>
            <Text style={styles.pillCommunityText}>ALL USERS</Text>
          </View>
        </View>

        {loadingGlobal ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={THEME.colors.spotifyGreen} />
          </View>
        ) : globalTracks.length === 0 ? (
          <GlassCard style={styles.emptyCard} borderRadius={THEME.borderRadius.md}>
            <Ionicons name="musical-notes-outline" size={32} color={THEME.colors.textMuted} />
            <Text style={styles.emptyText}>No streamed tracks recorded yet</Text>
          </GlassCard>
        ) : (
          globalTracks.map((song, index) => {
            const rankStyle = getRankBadgeStyle(index);
            const isFav = favorites.includes(song.id) || Boolean(song.is_favorite);

            return (
              <TouchableOpacity
                key={song.id}
                activeOpacity={0.75}
                onPress={() => playSong(song, globalTracks)}
                style={styles.trackRow}
              >
                <View
                  style={[
                    styles.rankBadgeBox,
                    { backgroundColor: rankStyle.bg, borderColor: rankStyle.border },
                  ]}
                >
                  <Text style={[styles.rankBadgeText, { color: rankStyle.text }]}>
                    {index + 1}
                  </Text>
                </View>

                <Image
                  source={{ uri: song.localArtworkUri || song.artwork_url }}
                  style={styles.trackThumb}
                />

                <View style={styles.trackMeta}>
                  <Text numberOfLines={1} style={styles.trackTitle}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.trackArtist}>
                    {song.artist}
                  </Text>
                  <View style={styles.trackSubMetaRow}>
                    <View style={styles.playsPill}>
                      <Ionicons name="play" size={10} color={THEME.colors.amberGlow} />
                      <Text style={styles.playsPillText}>{song.play_count || 0} plays</Text>
                    </View>
                    {song.bitrate && (
                      <View style={styles.bitratePill}>
                        <Text style={styles.bitratePillText}>{song.bitrate.split(' ')[0]}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Like Button with Count below icon */}
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => toggleFavorite(song.id)}
                  style={styles.favBtnCol}
                  accessibilityLabel="Like Track"
                >
                  <Ionicons
                    name={isFav ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isFav ? THEME.colors.pinkNeon : THEME.colors.textMuted}
                  />
                  <Text style={[styles.favCount, isFav && styles.favCountActive]}>
                    {formatLikes(song.likes_count ?? (isFav ? 1 : 0))}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    padding: 6,
  },
  refreshBtn: {
    padding: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    padding: 14,
    alignItems: 'flex-start',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  section: {
    marginTop: 22,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  pillGlobal: {
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.3)',
  },
  pillGlobalText: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.amberGlow,
    letterSpacing: 0.5,
  },
  pillCommunity: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  pillCommunityText: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
    letterSpacing: 0.5,
  },
  topListenerCard: {
    overflow: 'hidden',
  },
  listenerGradient: {
    padding: 16,
  },
  listenerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crownAvatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  crownPill: {
    position: 'absolute',
    top: -12,
    left: '50%',
    marginLeft: -12,
    zIndex: 2,
  },
  listenerAvatarBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: THEME.colors.amberGlow,
    overflow: 'hidden',
    backgroundColor: THEME.colors.backgroundTertiary,
  },
  listenerAvatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: 'rgba(255, 184, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.amberGlow,
  },
  listenerMeta: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  listenerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.amberGlow,
  },
  youBadge: {
    backgroundColor: THEME.colors.spotifyGreen,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  youBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#08090D',
  },
  listenerName: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  listenerStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  listenerStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  listenerStatPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  listenerRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginVertical: 4,
  },
  currentUserRowCard: {
    borderColor: 'rgba(29, 185, 84, 0.4)',
    borderWidth: 1,
    backgroundColor: 'rgba(29, 185, 84, 0.06)',
  },
  rankBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBoxText: {
    fontSize: 12,
    fontWeight: '800',
  },
  listenerRowAvatar: {
    marginLeft: 10,
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  smallAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  listenerRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  listenerRowBadge: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  listenerCountBox: {
    alignItems: 'center',
    minWidth: 44,
  },
  listenerCountNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
  },
  listenerCountLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: THEME.borderRadius.md,
    padding: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  rankBadgeBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  trackThumb: {
    width: 46,
    height: 46,
    borderRadius: 6,
    marginHorizontal: 10,
  },
  trackMeta: {
    flex: 1,
    marginRight: 10,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  trackArtist: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  trackSubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  playsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  playsPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.amberGlow,
  },
  bitratePill: {
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bitratePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.cyanNeon,
  },
  favBtnCol: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  favCount: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  favCountActive: {
    color: THEME.colors.pinkNeon,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 13,
    color: THEME.colors.textMuted,
    marginTop: 8,
  },
});
