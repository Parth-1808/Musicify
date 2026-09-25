import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { Song, Playlist } from '../types';

interface PlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  targetSong?: Song | null;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  visible,
  onClose,
  targetSong,
}) => {
  const { playlists, createPlaylist, addSongToPlaylist, showToast } = useMusic();

  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const handleCreate = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for the new playlist.');
      return;
    }

    const created = await createPlaylist(newPlaylistName.trim());
    if (created && targetSong) {
      await addSongToPlaylist(created.id, targetSong.id);
    }
    setNewPlaylistName('');
    setIsCreating(false);
    onClose();
  };

  const handleSelectPlaylist = async (playlist: Playlist) => {
    if (!targetSong) return;
    await addSongToPlaylist(playlist.id, targetSong.id);
    onClose();
  };

  const renderPlaylistItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => handleSelectPlaylist(item)}
      style={styles.playlistRow}
    >
      <View style={styles.playlistIcon}>
        <Ionicons name="folder-outline" size={20} color={THEME.colors.spotifyGreen} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={styles.playlistName}>{item.name}</Text>
        <Text style={styles.playlistCount}>
          {item.song_count || item.songs?.length || 0} {item.song_count === 1 ? 'track' : 'tracks'}
        </Text>
      </View>
      <View style={styles.addPill}>
        <Ionicons name="add" size={18} color={THEME.colors.spotifyGreen} />
        <Text style={styles.addPillText}>Add</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <GlassCard style={styles.card} borderRadius={THEME.borderRadius.xl}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Which playlist?</Text>
                {targetSong ? (
                  <Text numberOfLines={1} style={styles.headerSub}>
                    Choose where to add "{targetSong.title}"
                  </Text>
                ) : (
                  <Text style={styles.headerSub}>Select or create a playlist</Text>
                )}
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={THEME.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Create New Playlist Input */}
            {isCreating ? (
              <View style={styles.createBox}>
                <TextInput
                  placeholder="Enter playlist name..."
                  placeholderTextColor={THEME.colors.textMuted}
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  style={styles.createInput}
                  autoFocus
                />
                <View style={styles.createButtonsRow}>
                  <TouchableOpacity
                    onPress={() => setIsCreating(false)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <GlassButton
                    title="Create & Add"
                    onPress={handleCreate}
                    variant="primary"
                    size="sm"
                  />
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.createNewBtn}
                onPress={() => setIsCreating(true)}
              >
                <Ionicons name="add-circle" size={22} color={THEME.colors.spotifyGreen} />
                <Text style={styles.createNewText}>Create New Playlist</Text>
              </TouchableOpacity>
            )}

            {/* Existing Playlists */}
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              renderItem={renderPlaylistItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                !isCreating ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={40} color={THEME.colors.textMuted} />
                    <Text style={styles.emptyTitle}>No Playlists Yet</Text>
                    <Text style={styles.emptyText}>Tap 'Create New Playlist' above to start your first collection.</Text>
                  </View>
                ) : null
              }
            />
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
  container: {
    maxHeight: '80%',
  },
  card: {
    padding: 20,
    backgroundColor: 'rgba(12, 14, 22, 0.96)',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  header: {
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
    color: THEME.colors.spotifyGreen,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  createNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.md,
    marginBottom: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  createNewText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  createBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.colors.glassBorder,
  },
  createInput: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.glassBorderHighlight,
    paddingVertical: 8,
    marginBottom: 10,
  },
  createButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.md,
    marginVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  playlistIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistName: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  playlistCount: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.borderRadius.full,
    gap: 3,
  },
  addPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 10,
  },
  emptyText: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
});
