import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME } from '../theme/theme';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'sm' | 'md' | 'lg';
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  size = 'md',
}) => {
  const getGradientColors = (): readonly [string, string, ...string[]] => {
    switch (variant) {
      case 'primary':
        return [THEME.colors.spotifyGreenLight, THEME.colors.spotifyGreen];
      case 'accent':
        return [THEME.colors.purpleNeon, THEME.colors.cyanNeon];
      case 'danger':
        return [THEME.colors.danger, '#C82333'];
      case 'secondary':
      default:
        return ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.04)'];
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 14 };
      case 'lg':
        return { paddingVertical: 16, paddingHorizontal: 28 };
      case 'md':
      default:
        return { paddingVertical: 12, paddingHorizontal: 20 };
    }
  };

  const isOutline = variant === 'secondary';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.buttonWrapper,
        isOutline && styles.outlineBorder,
        disabled && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, getPadding()]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'secondary' ? '#fff' : '#000'} size="small" />
        ) : (
          <View style={styles.contentRow}>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text
              style={[
                styles.text,
                size === 'sm' && styles.textSm,
                size === 'lg' && styles.textLg,
                variant === 'secondary' ? styles.textSecondary : styles.textDark,
                (variant === 'accent' || variant === 'danger') && styles.textWhite,
                textStyle,
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  buttonWrapper: {
    borderRadius: THEME.borderRadius.full,
    overflow: 'hidden',
  },
  outlineBorder: {
    borderWidth: 1,
    borderColor: THEME.colors.glassBorderHighlight,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.borderRadius.full,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textSm: {
    fontSize: 13,
  },
  textLg: {
    fontSize: 17,
  },
  textDark: {
    color: '#08090D',
  },
  textWhite: {
    color: '#FFFFFF',
  },
  textSecondary: {
    color: THEME.colors.textPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
