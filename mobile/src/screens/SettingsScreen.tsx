import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
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
import {
  getSupabaseConfig,
  getBackendUrl,
  setBackendUrl,
} from '../config/supabase';
import { StorageService } from '../services/storageService';

interface SettingsScreenProps {
  onOpenAuth: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onOpenAuth }) => {
  const { user, isGuest, signOut, updateCredentials, isConfigured } = useAuth();
  const { refreshSongs } = useMusic();

  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [backendUrl, setBackendUrlState] = useState('');
  const [storageUsage, setStorageUsage] = useState({ totalMB: '0.0' });
  const [savingSupabase, setSavingSupabase] = useState(false);
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'online' | 'offline'>('idle');

  useEffect(() => {
    const config = getSupabaseConfig();
    setSupabaseUrl(config.url);
    setSupabaseAnonKey(config.anon);
    setBackendUrlState(getBackendUrl());

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

  const handleSaveSupabase = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      Alert.alert('Incomplete', 'Please provide both Supabase URL and Anon Key.');
      return;
    }

    try {
      setSavingSupabase(true);
      const success = await updateCredentials(supabaseUrl.trim(), supabaseAnonKey.trim());
      if (success) {
        Alert.alert('Saved!', 'Supabase credentials saved successfully. Cloud sync is active.');
        await refreshSongs();
      } else {
        Alert.alert('Error', 'Could not initialize Supabase with provided credentials.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingSupabase(false);
    }
  };

  const handleSaveBackend = async () => {
    await setBackendUrl(backendUrl.trim());
    await checkBackendHealth();
    Alert.alert('Saved', 'Backend server URL updated.');
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
              {user?.email || (isGuest ? 'Guest Mode (Demo)' : 'Not Signed In')}
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

      {/* Supabase Cloud Storage & Auth Config */}
      <Text style={styles.sectionHeader}>SUPABASE CLOUD CONFIGURATION</Text>
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        <View style={styles.statusIndicatorRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConfigured ? THEME.colors.spotifyGreen : THEME.colors.danger },
            ]}
          />
          <Text style={styles.statusLabel}>
            {isConfigured ? 'Supabase Connected' : 'Supabase Not Configured (Using Local Storage)'}
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Supabase Project URL</Text>
        <TextInput
          placeholder="https://your-project.supabase.co"
          placeholderTextColor={THEME.colors.textMuted}
          value={supabaseUrl}
          onChangeText={setSupabaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Supabase Anon Key</Text>
        <TextInput
          placeholder="eyJhbGciOiJIUzI1NiIsIn..."
          placeholderTextColor={THEME.colors.textMuted}
          value={supabaseAnonKey}
          onChangeText={setSupabaseAnonKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />

        <GlassButton
          title={savingSupabase ? 'Connecting...' : 'Save & Connect Supabase'}
          onPress={handleSaveSupabase}
          loading={savingSupabase}
          variant="secondary"
          size="md"
          icon={<Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
          style={{ marginTop: 6 }}
        />
      </GlassCard>

      {/* YouTube Downloader Backend Server */}
      <Text style={styles.sectionHeader}>AUDIO EXTRACTION BACKEND</Text>
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        <View style={styles.statusIndicatorRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  backendStatus === 'online'
                    ? THEME.colors.spotifyGreen
                    : backendStatus === 'offline'
                    ? THEME.colors.danger
                    : THEME.colors.amberGlow,
              },
            ]}
          />
          <Text style={styles.statusLabel}>
            Backend Server: {backendStatus.toUpperCase()} (Port 8000)
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Backend API URL</Text>
        <TextInput
          placeholder="http://localhost:8000 or http://192.168.x.x:8000"
          placeholderTextColor={THEME.colors.textMuted}
          value={backendUrl}
          onChangeText={setBackendUrlState}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <GlassButton
            title="Save URL"
            onPress={handleSaveBackend}
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
          />
          <GlassButton
            title={testingBackend ? 'Checking...' : 'Test Connection'}
            onPress={checkBackendHealth}
            loading={testingBackend}
            variant="primary"
            size="sm"
            style={{ flex: 1 }}
          />
        </View>
      </GlassCard>

      {/* Local Storage & Cache */}
      <Text style={styles.sectionHeader}>DEVICE STORAGE & OFFLINE CACHE</Text>
      <GlassCard style={styles.card} borderRadius={THEME.borderRadius.lg}>
        <View style={styles.storageUsageRow}>
          <View>
            <Text style={styles.storageTitle}>Offline Music Storage</Text>
            <Text style={styles.storageSub}>Audio tracks and high-res cover art</Text>
          </View>
          <Text style={styles.storageValue}>{storageUsage.totalMB} MB</Text>
        </View>

        <TouchableOpacity onPress={handleClearCache} style={styles.clearCacheBtn}>
          <Ionicons name="trash-outline" size={18} color={THEME.colors.danger} />
          <Text style={styles.clearCacheText}>Clear Offline Music Cache</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* Quality Badge Info */}
      <GlassCard style={[styles.card, { marginTop: 14 }]} borderRadius={THEME.borderRadius.lg}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MaterialCommunityIcons name="quality-high" size={24} color={THEME.colors.cyanNeon} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary }}>
              Ultra Hi-Fi Sound Engine
            </Text>
            <Text style={{ fontSize: 12, color: THEME.colors.textSecondary, marginTop: 2 }}>
              Musify extracts 320kbps MP3 and Studio Opus audio, exceeding standard Spotify (160k)
              with full frequency fidelity.
            </Text>
          </View>
        </View>
      </GlassCard>
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
  },
  card: {
    padding: 16,
    marginBottom: 16,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmail: {
    fontSize: 16,
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
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.glassBorder,
    color: THEME.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  storageUsageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  storageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  storageSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  storageValue: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.spotifyGreen,
  },
  clearCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    gap: 8,
  },
  clearCacheText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.danger,
  },
});
