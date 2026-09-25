import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME } from '../theme/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  glow?: 'spotify' | 'cyan' | 'purple' | 'none';
  borderRadius?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = THEME.blur.card,
  glow = 'none',
  borderRadius = THEME.borderRadius.lg,
}) => {
  const getGlowBorderColor = () => {
    switch (glow) {
      case 'spotify':
        return THEME.colors.spotifyGreenGlow;
      case 'cyan':
        return 'rgba(0, 242, 254, 0.3)';
      case 'purple':
        return 'rgba(138, 43, 226, 0.3)';
      default:
        return THEME.colors.glassBorder;
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderColor: getGlowBorderColor(),
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : (
        <LinearGradient
          colors={THEME.colors.gradientGlass as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.glassSurface,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 6,
  },
  content: {
    zIndex: 1,
  },
});
