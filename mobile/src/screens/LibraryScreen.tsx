import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { SongListItem } from '../components/SongListItem';
import { GlassCard } from '../components/GlassCard';
import { Song, Playlist } from '../types';

interface LibraryScreenProps {
  onOpenDownload: () => void;
  onOpenPlaylistModal: (song: Song) => void;
}

type TabType = 'all' | 'offline' | 'favorites' | 'playlists';

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  onOpenDownload,
  onOpenPlaylistModal,
}) => {
  const {
    songs,
    offlineSongs,
    playlists,
    favorites,
    currentSong,
    isPlaying,
    playSong,
    deletePlaylist,
    removeSongFromPlaylist,
    isOfflineMode,
    toggleOfflineMode,
  } = useMusic();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // Filter songs based on active tab & search query
  const getFilteredSongs = (): Song[] => {
    let list: Song[] = [];
    if (isOfflineMode || activeTab === 'offline') {
      list = offlineSongs;
    } else if (activeTab === 'all') {
      list = songs;
    } else if (activeTab === 'favorites') {
      list = songs.filter((s) => favorites.includes(s.id) || s.is_favorite);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
      );
    }

    return list;
  };

  const filteredSongs = getFilteredSongs();

  const handleDeletePlaylist = (playlist: Playlist) => {
    Alert.alert(
      'Delete Playlist',
      `Delete "${playlist.name}"? Songs will remain in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePlaylist(playlist.id);
            if (selectedPlaylist?.id === playlist.id) {
              setSelectedPlaylist(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Your Library</Text>
          <Text style={styles.subTitle}>
            {isOfflineMode ? 'Offline Mode (Local only)' : `${songs.length} total tracks`}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleOfflineMode}
            style={[styles.offlineHeaderPill, isOfflineMode && styles.offlineHeaderPillActive]}
          >
            <Ionicons
              name={isOfflineMode ? 'cloud-offline' : 'cloud-done-outline'}
              size={15}
              color={isOfflineMode ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.offlineHeaderPillText,
                isOfflineMode && styles.offlineHeaderPillTextActive,
              ]}
            >
              {isOfflineMode ? 'Offline' : 'Online'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onOpenDownload} style={styles.addBtn}>
            <Ionicons name="add" size={24} color={THEME.colors.spotifyGreen} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <Feather name="search" size={18} color={THEME.colors.textMuted} />
        <TextInput
          placeholder="Search songs, artists..."
          placeholderTextColor={THEME.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={THEME.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          onPress={() => {
            setActiveTab('all');
            setSelectedPlaylist(null);
          }}
          style={[styles.tabPill, activeTab === 'all' && styles.activeTabPill]}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All ({songs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setActiveTab('offline');
            setSelectedPlaylist(null);
          }}
          style={[styles.tabPill, activeTab === 'offline' && styles.activeTabPill]}
        >
          <Ionicons
            name="arrow-down-circle"
            size={14}
            color={activeTab === 'offline' ? '#08090D' : THEME.colors.spotifyGreen}
          />
          <Text style={[styles.tabText, activeTab === 'offline' && styles.activeTabText]}>
            Offline ({offlineSongs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setActiveTab('favorites');
            setSelectedPlaylist(null);
          }}
          style={[styles.tabPill, activeTab === 'favorites' && styles.activeTabPill]}
        >
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.activeTabText]}>
            Favorites ({favorites.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setActiveTab('playlists');
            setSelectedPlaylist(null);
          }}
          style={[styles.tabPill, activeTab === 'playlists' && styles.activeTabPill]}
        >
          <Text style={[styles.tabText, activeTab === 'playlists' && styles.activeTabText]}>
            Playlists ({playlists.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Playlist Detail View */}
      {selectedPlaylist ? (
        <View style={{ flex: 1 }}>
          <View style={styles.playlistDetailHeader}>
            <TouchableOpacity
              onPress={() => setSelectedPlaylist(null)}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color={THEME.colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.playlistDetailTitle}>{selectedPlaylist.name}</Text>
              <Text style={styles.playlistDetailSub}>
                {selectedPlaylist.songs?.length || 0} songs
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleDeletePlaylist(selectedPlaylist)}
              style={styles.deletePlBtn}
            >
              <Ionicons name="trash-outline" size={20} color={THEME.colors.danger} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={selectedPlaylist.songs || []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SongListItem
                song={item}
                isActive={currentSong?.id === item.id}
                isPlaying={isPlaying}
                onPress={() => playSong(item, selectedPlaylist.songs)}
                onAddToPlaylist={() => onOpenPlaylistModal(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>This playlist has no songs yet.</Text>
              </View>
            }
          />
        </View>
      ) : activeTab === 'playlists' ? (
        /* Playlists Grid / List */
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSelectedPlaylist(item)}
              style={styles.playlistCard}
            >
              <GlassCard style={styles.playlistGlass} borderRadius={THEME.borderRadius.md}>
                <View style={styles.playlistIconContainer}>
                  <Ionicons name="musical-notes" size={28} color={THEME.colors.spotifyGreen} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.playlistCardName}>{item.name}</Text>
                  <Text style={styles.playlistCardCount}>
                    {item.song_count || item.songs?.length || 0} tracks
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
              </GlassCard>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={THEME.colors.textMuted} />
              <Text style={styles.emptyTitle}>No Playlists Yet</Text>
              <Text style={styles.emptyText}>
                Use the "..." menu on any song to create or add to a playlist!
              </Text>
            </View>
          }
        />
      ) : (
        /* Song List for All / Offline / Favorites */
        <FlatList
          data={filteredSongs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongListItem
              song={item}
              isActive={currentSong?.id === item.id}
              isPlaying={isPlaying}
              onPress={() => playSong(item, filteredSongs)}
              onAddToPlaylist={() => onOpenPlaylistModal(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={
                  activeTab === 'offline'
                    ? 'cloud-offline-outline'
                    : activeTab === 'favorites'
                    ? 'heart-outline'
                    : 'musical-notes-outline'
                }
                size={48}
                color={THEME.colors.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {isOfflineMode || activeTab === 'offline'
                  ? 'No Downloaded Songs Yet'
                  : activeTab === 'favorites'
                  ? 'No Favorites Yet'
                  : 'No Songs Found'}
              </Text>
              <Text style={styles.emptyText}>
                {isOfflineMode || activeTab === 'offline'
                  ? 'Tap the three dots (⋮) on any song and select "Download Song" to save it for offline listening.'
                  : 'Paste a YouTube video link to add high-fidelity audio to your cloud library.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    paddingTop: 54,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  subTitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offlineHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 5,
  },
  offlineHeaderPillActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.18)',
    borderColor: THEME.colors.spotifyGreen,
  },
  offlineHeaderPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  offlineHeaderPillTextActive: {
    color: THEME.colors.spotifyGreen,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.glassBorder,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    marginLeft: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
    gap: 4,
  },
  activeTabPill: {
    backgroundColor: THEME.colors.spotifyGreen,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  activeTabText: {
    color: '#08090D',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 150,
  },
  playlistCard: {
    marginVertical: 4,
  },
  playlistGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  playlistIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  playlistCardCount: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  playlistDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  playlistDetailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  playlistDetailSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  deletePlBtn: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 14,
  },
  emptyText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
