import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';
import { SLEEP_TIMER_OPTIONS, SleepTimerOption } from '../types';

interface SleepTimerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({ visible, onClose }) => {
  const {
    sleepTimerRemainingSeconds,
    isSleepTimerEndOfTrack,
    setSleepTimer,
    cancelSleepTimer,
  } = useMusic();

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}:${remSecs < 10 ? '0' : ''}${remSecs}`;
  };

  const handleSelectOption = (opt: SleepTimerOption) => {
    setSleepTimer(opt.minutes, opt.isEndOfTrack);
    onClose();
  };

  const handleTurnOff = () => {
    cancelSleepTimer();
    onClose();
  };

  const isTimerActive = sleepTimerRemainingSeconds !== null || isSleepTimerEndOfTrack;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <GlassCard style={styles.card} borderRadius={THEME.borderRadius.xl}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="moon" size={22} color={THEME.colors.spotifyGreen} />
                <Text style={styles.headerTitle}>Sleep Timer</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={THEME.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Active Timer Indicator */}
            {isTimerActive && (
              <View style={styles.activeBanner}>
                <Ionicons name="time-outline" size={18} color={THEME.colors.spotifyGreen} />
                <Text style={styles.activeBannerText}>
                  {isSleepTimerEndOfTrack
                    ? 'Audio stops at the end of track'
                    : `Stopping in ${formatCountdown(sleepTimerRemainingSeconds || 0)}`}
                </Text>
                <TouchableOpacity onPress={handleTurnOff} style={styles.turnOffBtn}>
                  <Text style={styles.turnOffText}>Turn Off</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Options List */}
            <FlatList
              data={SLEEP_TIMER_OPTIONS}
              keyExtractor={(item) => item.label}
              renderItem={({ item }) => {
                const isSelected = item.isEndOfTrack
                  ? isSleepTimerEndOfTrack
                  : sleepTimerRemainingSeconds !== null &&
                    Math.ceil((sleepTimerRemainingSeconds || 0) / 60) === item.minutes;

                return (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleSelectOption(item)}
                    style={[styles.optionRow, isSelected && styles.selectedOptionRow]}
                  >
                    <View style={styles.optionLeft}>
                      <Ionicons
                        name={item.isEndOfTrack ? 'play-skip-forward-outline' : 'timer-outline'}
                        size={20}
                        color={isSelected ? THEME.colors.spotifyGreen : THEME.colors.textSecondary}
                      />
                      <Text style={[styles.optionText, isSelected && styles.selectedOptionText]}>
                        {item.label}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={THEME.colors.spotifyGreen} />
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ paddingBottom: 16 }}
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
    maxHeight: '75%',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  activeBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  turnOffBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  turnOffText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  selectedOptionRow: {
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
    borderRadius: THEME.borderRadius.md,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  selectedOptionText: {
    color: THEME.colors.spotifyGreen,
    fontWeight: '700',
  },
});
