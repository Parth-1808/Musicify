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
        return 'rgba(0, 242, 254, 0.45)';
      case 'purple':
        return 'rgba(138, 43, 226, 0.45)';
      default:
        return THEME.colors.glassBorder;
    }
  };

  const getGlowShadow = () => {
    if (glow === 'spotify') {
      return {
        shadowColor: THEME.colors.spotifyGreen,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
        elevation: 8,
      };
    }
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.45,
      shadowRadius: 22,
      elevation: 7,
    };
  };

  const isWeb = Platform.OS === 'web';

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderColor: getGlowBorderColor(),
          borderTopColor: glow === 'spotify' ? 'rgba(30, 215, 96, 0.7)' : THEME.colors.glassBorderTop,
          borderBottomColor: THEME.colors.glassBorderBottom,
        },
        getGlowShadow(),
        isWeb && ({
          backdropFilter: `blur(${intensity}px) saturate(190%)`,
          WebkitBackdropFilter: `blur(${intensity}px) saturate(190%)`,
        } as any),
        style,
      ]}
    >
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={intensity}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      )}

      {/* Realistic liquid specular sheen gradient */}
      <LinearGradient
        colors={THEME.colors.gradientGlassSheen as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        pointerEvents="none"
      />

      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.glassSurface,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    zIndex: 1,
  },
});
