import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';
import { Song } from '../types';

interface QueueModalProps {
  visible: boolean;
  onClose: () => void;
}

export const QueueModal: React.FC<QueueModalProps> = ({ visible, onClose }) => {
  const { queue, queueIndex, currentSong, playSong, removeFromQueue, clearQueue } = useMusic();

  const renderQueueItem = ({ item, index }: { item: Song; index: number }) => {
    const isCurrent = index === queueIndex;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => playSong(item, queue)}
        style={[styles.itemRow, isCurrent && styles.activeItemRow]}
      >
        <Text style={[styles.indexText, isCurrent && styles.activeIndexText]}>
          {index + 1}
        </Text>

        <Image
          source={{ uri: item.localArtworkUri || item.artwork_url }}
          style={styles.itemArtwork}
        />

        <View style={styles.itemMeta}>
          <Text numberOfLines={1} style={[styles.itemTitle, isCurrent && styles.activeItemTitle]}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={styles.itemArtist}>
            {item.artist}
          </Text>
        </View>

        {isCurrent ? (
          <Ionicons name="volume-high" size={20} color={THEME.colors.spotifyGreen} />
        ) : (
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => removeFromQueue(index)}
          >
            <Feather name="x" size={18} color={THEME.colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <GlassCard style={styles.card} borderRadius={THEME.borderRadius.xl}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Playback Queue</Text>
                <Text style={styles.headerSub}>{queue.length} songs queued</Text>
              </View>

              <View style={styles.headerActions}>
                {queue.length > 1 && (
                  <TouchableOpacity onPress={clearQueue} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear Queue</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color={THEME.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Queue List */}
            <FlatList
              data={queue}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              renderItem={renderQueueItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={48} color={THEME.colors.textMuted} />
                  <Text style={styles.emptyText}>Queue is empty</Text>
                </View>
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
    maxHeight: '85%',
  },
  card: {
    padding: 20,
    backgroundColor: 'rgba(12, 14, 22, 0.95)',
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
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearBtnText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    paddingBottom: 24,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.md,
    marginVertical: 2,
  },
  activeItemRow: {
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
  },
  indexText: {
    width: 24,
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  activeIndexText: {
    color: THEME.colors.spotifyGreen,
  },
  itemArtwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  itemMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  activeItemTitle: {
    color: THEME.colors.spotifyGreen,
    fontWeight: '700',
  },
  itemArtist: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: THEME.colors.textMuted,
    marginTop: 12,
  },
});
