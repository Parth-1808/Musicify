import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme/theme';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';

interface AuthScreenProps {
  onSuccess?: () => void;
  onClose?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onClose }) => {
  const { signIn, signUp, isConfigured } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      if (isSignUp) {
        const res = await signUp(email.trim(), password.trim());
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          Alert.alert(
            'Account Created',
            'Your Musify account is ready. Cloud synchronization is now enabled.'
          );
          if (onSuccess) onSuccess();
        }
      } else {
        const res = await signIn(email.trim(), password.trim());
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          if (onSuccess) onSuccess();
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <LinearGradient
        colors={['#131624', '#08090D', '#030405']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={THEME.colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Logo & Brand */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlow}>
            <LinearGradient
              colors={[THEME.colors.spotifyGreenLight, THEME.colors.spotifyGreen]}
              style={styles.logoCircle}
            >
              <Ionicons name="headset" size={42} color="#08090D" />
            </LinearGradient>
          </View>
          <Text style={styles.brandTitle}>Musify</Text>
          <View style={styles.brandBadge}>
            <Ionicons name="sparkles" size={12} color={THEME.colors.spotifyGreen} />
            <Text style={styles.brandBadgeText}>ULTRA HI-FI CLOUD</Text>
          </View>
        </View>

        {/* Auth Glass Card */}
        <GlassCard glow="spotify" style={styles.authCard} borderRadius={THEME.borderRadius.xl}>
          <Text style={styles.authTitle}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={THEME.colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <Text style={styles.inputLabel}>Email</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={18} color={THEME.colors.textMuted} />
            <TextInput
              placeholder="you@domain.com"
              placeholderTextColor={THEME.colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={THEME.colors.textMuted} />
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={THEME.colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          <GlassButton
            title={isSignUp ? 'Create Account' : 'Sign In'}
            onPress={handleSubmit}
            loading={loading}
            variant="primary"
            size="lg"
            style={{ marginTop: 12 }}
          />

          {/* Toggle between Login and Sign Up */}
          <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.toggleRow}>
            <Text style={styles.toggleSub}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <Text style={styles.toggleAction}> {isSignUp ? 'Sign In' : 'Sign Up'}</Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090D',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 8,
    marginBottom: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoGlow: {
    shadowColor: THEME.colors.spotifyGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.8,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    marginTop: 6,
  },
  brandBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
    letterSpacing: 0.8,
  },
  authCard: {
    padding: 24,
    backgroundColor: 'rgba(16, 18, 28, 0.90)',
    marginTop: 18,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  authSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.danger,
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.glassBorder,
    borderRadius: THEME.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    marginLeft: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  toggleSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  toggleAction: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.spotifyGreen,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.colors.glassBorder,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
});
