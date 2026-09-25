import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useMusic } from '../context/MusicContext';
import { THEME } from '../theme/theme';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { getSupabaseConfig, getBackendUrl } from '../config/supabase';
import { StorageService } from '../services/storageService';

interface SettingsScreenProps {
  onOpenAuth: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onOpenAuth }) => {
  const { user, isGuest, signOut, isConfigured } = useAuth();
  const { refreshSongs } = useMusic();

  const [storageUsage, setStorageUsage] = useState({ totalMB: '0.0' });
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'online' | 'offline'>('idle');

  useEffect(() => {
    loadStorageUsage();
    checkBackendHealth();
  }, []);

  const loadStorageUsage = async () => {
    const usage = await StorageService.getStorageUsage();
    setStorageUsage({ totalMB: usage.totalMB });
  };

  const checkBackendHealth = async () => {
    try {
      setTestingBackend(true);
      const url = getBackendUrl();
      const res = await fetch(`${url}/api/health`, { method: 'GET' });
      if (res.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch {
      setBackendStatus('offline');
    } finally {
      setTestingBackend(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Offline Music Cache',
      'This will remove all downloaded music files from this phone storage. Tracks in Supabase Cloud will remain intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            const songs = await StorageService.getOfflineSongs();
            for (const s of songs) {
              await StorageService.removeSongOffline(s.id);
            }
            await loadStorageUsage();
            await refreshSongs();
            Alert.alert('Cache Cleared', 'Offline storage freed up.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      {/* Account Profile Card */}
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color={THEME.colors.spotifyGreen} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.accountEmail}>
              {user?.email || (isGuest ? 'Guest Mode' : 'Not Signed In')}
            </Text>
            <Text style={styles.accountStatus}>
              {user ? 'Authenticated via Supabase' : 'Offline / Local listening mode'}
            </Text>
          </View>
        </View>

        <View style={styles.accountActionRow}>
          {user ? (
            <GlassButton
              title="Sign Out"
              onPress={signOut}
              variant="danger"
              size="sm"
              icon={<Ionicons name="log-out-outline" size={16} color="#fff" />}
            />
          ) : (
            <GlassButton
              title="Sign In / Sign Up"
              onPress={onOpenAuth}
              variant="primary"
              size="sm"
              icon={<Ionicons name="log-in-outline" size={16} color="#08090D" />}
            />
          )}
        </View>
      </GlassCard>

      {/* Cloud & Service Architecture Status */}
      <Text style={styles.sectionHeader}>CLOUD & SERVICES STATUS</Text>
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        {/* Supabase Status */}
        <View style={styles.statusItemRow}>
          <View style={styles.statusIconBox}>
            <Ionicons name="cloud-done-outline" size={20} color={THEME.colors.spotifyGreen} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.statusTitle}>Supabase Cloud</Text>
            <Text style={styles.statusSub}>
              {isConfigured ? 'Active & Synced (.env configured)' : 'Using Local Storage Engine'}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: isConfigured ? 'rgba(29, 185, 84, 0.15)' : 'rgba(255, 69, 58, 0.15)' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConfigured ? THEME.colors.spotifyGreen : THEME.colors.danger },
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                { color: isConfigured ? THEME.colors.spotifyGreen : THEME.colors.danger },
              ]}
            >
              {isConfigured ? 'Connected' : 'Offline'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Audio Engine Status */}
        <View style={styles.statusItemRow}>
          <View style={styles.statusIconBox}>
            <Ionicons name="hardware-chip-outline" size={20} color={THEME.colors.cyanNeon} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.statusTitle}>Audio Extractor Engine</Text>
            <Text style={styles.statusSub}>
              {backendStatus === 'online'
                ? '320kbps Studio Master (Online)'
                : backendStatus === 'offline'
                ? 'Connecting to server...'
                : 'Checking audio engine...'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBadge}
            onPress={checkBackendHealth}
            disabled={testingBackend}
          >
            {testingBackend ? (
              <ActivityIndicator size="small" color={THEME.colors.spotifyGreen} />
            ) : (
              <Ionicons
                name="refresh"
                size={16}
                color={backendStatus === 'online' ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      </GlassCard>

      {/* Audio Quality Specifications */}
      <Text style={styles.sectionHeader}>AUDIO FIDELITY</Text>
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.goldIconBox}>
            <Ionicons name="diamond" size={20} color={THEME.colors.amberGlow} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: THEME.colors.textPrimary }}>
              320 kbps Ultra Studio Master
            </Text>
            <Text style={{ fontSize: 12, color: THEME.colors.textSecondary, marginTop: 3 }}>
              48kHz CBR Master encoded with full dynamic range. Exceeds standard Spotify (160k) with audiophile fidelity.
            </Text>
          </View>
        </View>
      </GlassCard>

      {/* Local Storage & Cache */}
      <Text style={styles.sectionHeader}>DEVICE STORAGE & OFFLINE CACHE</Text>
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        <View style={styles.storageUsageRow}>
          <View>
            <Text style={styles.storageTitle}>Offline Music Storage</Text>
            <Text style={styles.storageSub}>Cached audio tracks and cover artwork</Text>
          </View>
          <Text style={styles.storageValue}>{storageUsage.totalMB} MB</Text>
        </View>

        <TouchableOpacity onPress={handleClearCache} style={styles.clearCacheBtn}>
          <Ionicons name="trash-outline" size={17} color={THEME.colors.danger} />
          <Text style={styles.clearCacheText}>Clear Offline Music Cache</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* App Info Footer */}
      <View style={styles.appInfoContainer}>
        <Text style={styles.appInfoTitle}>Musify Ultra Hi-Fi</Text>
        <Text style={styles.appInfoSub}>Version 1.0.0 • Cloud & Offline Audio Player</Text>
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
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    letterSpacing: 1.2,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    padding: 16,
    backgroundColor: THEME.colors.glassSurface,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  accountStatus: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  accountActionRow: {
    marginTop: 14,
    alignItems: 'flex-start',
  },
  statusItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  statusSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  refreshBadge: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  storageUsageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  storageSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  storageValue: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
  },
  clearCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.25)',
  },
  clearCacheText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.danger,
  },
  appInfoContainer: {
    alignItems: 'center',
    marginTop: 36,
    marginBottom: 20,
  },
  appInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  appInfoSub: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 3,
  },
});
