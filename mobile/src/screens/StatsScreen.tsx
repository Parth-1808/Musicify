import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from '../components/GlassCard';

interface StatsScreenProps {
  onBack: () => void;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({ onBack }) => {
  const { songs, offlineSongs, favorites, playSong } = useMusic();

  // Aggregate stats
  const totalPlays = songs.reduce((acc, s) => acc + (s.play_count || 0), 0);
  
  // Total listening time (seconds)
  const totalDurationSecs = songs.reduce(
    (acc, s) => acc + (s.play_count || 0) * (s.duration || 180),
    0
  );
  const totalHours = (totalDurationSecs / 3600).toFixed(1);

  // Sorted leaderboard
  const leaderboard = [...songs]
    .filter((s) => (s.play_count || 0) > 0)
    .sort((a, b) => (b.play_count || 0) - (a.play_count || 0));

  const topTrack = leaderboard[0];

  const getRankStyle = (index: number) => {
    if (index === 0) return { bg: 'rgba(255, 184, 0, 0.2)', border: THEME.colors.amberGlow, text: THEME.colors.amberGlow };
    if (index === 1) return { bg: 'rgba(192, 192, 192, 0.2)', border: '#C0C0C0', text: '#E0E0E0' };
    if (index === 2) return { bg: 'rgba(205, 127, 50, 0.2)', border: '#CD7F32', text: '#CD7F32' };
    return { bg: 'rgba(255, 255, 255, 0.05)', border: THEME.colors.glassBorder, text: THEME.colors.textMuted };
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Listening Insights</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Hero Overview Grid */}
      <View style={styles.overviewGrid}>
        <GlassCard glow="spotify" style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="play" size={24} color={THEME.colors.spotifyGreen} />
          <Text style={styles.statNumber}>{totalPlays}</Text>
          <Text style={styles.statLabel}>Total Times Listened</Text>
        </GlassCard>

        <GlassCard glow="cyan" style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="time" size={24} color={THEME.colors.cyanNeon} />
          <Text style={styles.statNumber}>{totalHours}h</Text>
          <Text style={styles.statLabel}>Streamed Audio Time</Text>
        </GlassCard>
      </View>

      <View style={styles.overviewGrid}>
        <GlassCard style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="cloud-offline" size={24} color={THEME.colors.spotifyGreen} />
          <Text style={styles.statNumber}>{offlineSongs.length}</Text>
          <Text style={styles.statLabel}>Offline Downloaded</Text>
        </GlassCard>

        <GlassCard style={styles.statCard} borderRadius={THEME.borderRadius.lg}>
          <Ionicons name="heart" size={24} color={THEME.colors.pinkNeon} />
          <Text style={styles.statNumber}>{favorites.length}</Text>
          <Text style={styles.statLabel}>Favorite Tracks</Text>
        </GlassCard>
      </View>

      {/* #1 Most Played Hero Card */}
      {topTrack && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="trophy-outline" size={20} color={THEME.colors.amberGlow} />
            <Text style={styles.sectionTitle}>Top Streamed Track</Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => playSong(topTrack, songs)}>
            <GlassCard glow="spotify" style={styles.topTrackCard} borderRadius={THEME.borderRadius.xl}>
              <Image
                source={{ uri: topTrack.localArtworkUri || topTrack.artwork_url }}
                style={styles.topTrackImage}
              />
              <View style={styles.topTrackMeta}>
                <View style={styles.topTrackTag}>
                  <Text style={styles.topTrackTagText}>MOST STREAMED</Text>
                </View>
                <Text numberOfLines={1} style={styles.topTrackTitle}>
                  {topTrack.title}
                </Text>
                <Text numberOfLines={1} style={styles.topTrackArtist}>
                  {topTrack.artist}
                </Text>
                <View style={styles.playsHighlight}>
                  <Ionicons name="sparkles" size={15} color={THEME.colors.amberGlow} />
                  <Text style={styles.playsHighlightText}>
                    {topTrack.play_count} total plays
                  </Text>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        </View>
      )}

      {/* Leaderboard List */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="podium-outline" size={20} color={THEME.colors.spotifyGreen} />
          <Text style={styles.sectionTitle}>Leaderboard: Times Listened</Text>
        </View>

        {leaderboard.length === 0 ? (
          <GlassCard style={styles.emptyCard} borderRadius={THEME.borderRadius.md}>
            <Ionicons name="stats-chart" size={36} color={THEME.colors.textMuted} />
            <Text style={styles.emptyText}>
              Start listening to tracks for 30+ seconds to see your statistics!
            </Text>
          </GlassCard>
        ) : (
          leaderboard.slice(0, 10).map((song, idx) => {
            const maxPlays = leaderboard[0]?.play_count || 1;
            const percentage = Math.min(100, Math.max(10, ((song.play_count || 0) / maxPlays) * 100));
            const rankStyle = getRankStyle(idx);

            return (
              <TouchableOpacity
                key={song.id}
                activeOpacity={0.7}
                onPress={() => playSong(song, leaderboard)}
                style={styles.leaderboardRow}
              >
                <View
                  style={[
                    styles.rankBadgeBox,
                    { backgroundColor: rankStyle.bg, borderColor: rankStyle.border },
                  ]}
                >
                  <Text style={[styles.rankBadgeText, { color: rankStyle.text }]}>
                    {idx + 1}
                  </Text>
                </View>
                <Image
                  source={{ uri: song.localArtworkUri || song.artwork_url }}
                  style={styles.leaderboardThumb}
                />
                <View style={styles.leaderboardMeta}>
                  <Text numberOfLines={1} style={styles.leaderboardTitle}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.leaderboardArtist}>
                    {song.artist}
                  </Text>

                  {/* Visual frequency bar */}
                  <View style={styles.statBarBg}>
                    <View style={[styles.statBarFill, { width: `${percentage}%` as any }]} />
                  </View>
                </View>

                <View style={styles.countBox}>
                  <Text style={styles.countNumber}>{song.play_count}</Text>
                  <Text style={styles.countLabel}>plays</Text>
                </View>
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
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    alignItems: 'flex-start',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginTop: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  topTrackCard: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
  },
  topTrackImage: {
    width: 90,
    height: 90,
    borderRadius: THEME.borderRadius.md,
  },
  topTrackMeta: {
    flex: 1,
    marginLeft: 14,
  },
  topTrackTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(29, 185, 84, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  topTrackTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
    letterSpacing: 0.8,
  },
  topTrackTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  topTrackArtist: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  playsHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  playsHighlightText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.amberGlow,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  leaderboardRow: {
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
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  leaderboardThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginHorizontal: 8,
  },
  leaderboardMeta: {
    flex: 1,
    marginRight: 10,
  },
  leaderboardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  leaderboardArtist: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  statBarBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.spotifyGreen,
    borderRadius: 2,
  },
  countBox: {
    alignItems: 'center',
    minWidth: 40,
  },
  countNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
  },
  countLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
});
