import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';

export const GlassToast: React.FC = () => {
  const { toastMessage, toastIcon } = useMusic();

  if (!toastMessage) return null;

  return (
    <View style={styles.toastContainer} pointerEvents="none">
      <GlassCard glow="spotify" style={styles.toastCard} borderRadius={THEME.borderRadius.full}>
        <View style={styles.toastContent}>
          <Ionicons
            name={toastIcon as any || 'checkmark-circle'}
            size={18}
            color={THEME.colors.spotifyGreen}
          />
          <Text numberOfLines={1} style={styles.toastText}>
            {toastMessage}
          </Text>
        </View>
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    zIndex: 99999,
    alignItems: 'center',
  },
  toastCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(12, 14, 22, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.4)',
    shadowColor: THEME.colors.spotifyGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
});
