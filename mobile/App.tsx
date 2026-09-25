import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MusicProvider, useMusic } from './src/context/MusicContext';
import { THEME } from './src/theme/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { MiniPlayer } from './src/components/MiniPlayer';
import { FullPlayerModal } from './src/components/FullPlayerModal';
import { DownloadModal } from './src/components/DownloadModal';
import { QueueModal } from './src/components/QueueModal';
import { PlaylistModal } from './src/components/PlaylistModal';
import { Song } from './src/types';

type ScreenTab = 'home' | 'library' | 'stats' | 'settings';

function MainNavigator() {
  const { user, isGuest } = useAuth();
  const { currentSong } = useMusic();

  const [activeTab, setActiveTab] = useState<ScreenTab>('home');
  const [fullPlayerVisible, setFullPlayerVisible] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [targetSongForPlaylist, setTargetSongForPlaylist] = useState<Song | null>(null);

  // If not logged in and not guest, show AuthScreen
  if (!user && !isGuest) {
    return <AuthScreen />;
  }

  const handleOpenPlaylistModal = (song: Song) => {
    setTargetSongForPlaylist(song);
    setPlaylistModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#08090D" />

      {/* Screen Views */}
      <View style={styles.screenArea}>
        {activeTab === 'home' && (
          <HomeScreen
            onOpenDownload={() => setDownloadModalVisible(true)}
            onOpenPlaylistModal={handleOpenPlaylistModal}
            onNavigateToLibrary={() => setActiveTab('library')}
            onNavigateToStats={() => setActiveTab('stats')}
          />
        )}
        {activeTab === 'library' && (
          <LibraryScreen
            onOpenDownload={() => setDownloadModalVisible(true)}
            onOpenPlaylistModal={handleOpenPlaylistModal}
          />
        )}
        {activeTab === 'stats' && <StatsScreen onBack={() => setActiveTab('home')} />}
        {activeTab === 'settings' && (
          <SettingsScreen onOpenAuth={() => setAuthModalVisible(true)} />
        )}
      </View>

      {/* Floating MiniPlayer (Visible whenever a song is loaded) */}
      {currentSong && <MiniPlayer onPress={() => setFullPlayerVisible(true)} />}

      {/* Glassmorphic Bottom Navigation Bar */}
      <View style={styles.bottomNavWrapper}>
        <LinearGradient
          colors={['rgba(15, 17, 26, 0.94)', 'rgba(8, 9, 13, 0.98)']}
          style={styles.bottomNav}
        >
          {/* Home Tab */}
          <TouchableOpacity
            onPress={() => setActiveTab('home')}
            style={styles.navItem}
          >
            <Ionicons
              name={activeTab === 'home' ? 'home' : 'home-outline'}
              size={24}
              color={activeTab === 'home' ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.navLabel,
                activeTab === 'home' && { color: THEME.colors.spotifyGreen },
              ]}
            >
              Home
            </Text>
          </TouchableOpacity>

          {/* Library Tab */}
          <TouchableOpacity
            onPress={() => setActiveTab('library')}
            style={styles.navItem}
          >
            <Ionicons
              name={activeTab === 'library' ? 'library' : 'library-outline'}
              size={24}
              color={activeTab === 'library' ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.navLabel,
                activeTab === 'library' && { color: THEME.colors.spotifyGreen },
              ]}
            >
              Library
            </Text>
          </TouchableOpacity>

          {/* Center Action: Paste / Download Track */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setDownloadModalVisible(true)}
            style={styles.centerDownloadBtnWrapper}
          >
            <LinearGradient
              colors={[THEME.colors.spotifyGreenLight, THEME.colors.spotifyGreen]}
              style={styles.centerDownloadBtn}
            >
              <Ionicons name="add" size={28} color="#08090D" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Stats Tab */}
          <TouchableOpacity
            onPress={() => setActiveTab('stats')}
            style={styles.navItem}
          >
            <Ionicons
              name={activeTab === 'stats' ? 'stats-chart' : 'stats-chart-outline'}
              size={22}
              color={activeTab === 'stats' ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.navLabel,
                activeTab === 'stats' && { color: THEME.colors.spotifyGreen },
              ]}
            >
              Stats
            </Text>
          </TouchableOpacity>

          {/* Settings Tab */}
          <TouchableOpacity
            onPress={() => setActiveTab('settings')}
            style={styles.navItem}
          >
            <Ionicons
              name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
              size={22}
              color={activeTab === 'settings' ? THEME.colors.spotifyGreen : THEME.colors.textMuted}
            />
            <Text
              style={[
                styles.navLabel,
                activeTab === 'settings' && { color: THEME.colors.spotifyGreen },
              ]}
            >
              Settings
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Full Screen Player Modal */}
      <FullPlayerModal
        visible={fullPlayerVisible}
        onClose={() => setFullPlayerVisible(false)}
        onOpenQueue={() => {
          setFullPlayerVisible(false);
          setQueueModalVisible(true);
        }}
        onOpenPlaylistModal={() => {
          if (currentSong) {
            handleOpenPlaylistModal(currentSong);
          }
        }}
      />

      {/* YouTube Downloader Modal */}
      <DownloadModal
        visible={downloadModalVisible}
        onClose={() => setDownloadModalVisible(false)}
      />

      {/* Queue Modal */}
      <QueueModal
        visible={queueModalVisible}
        onClose={() => setQueueModalVisible(false)}
      />

      {/* Playlist Modal */}
      <PlaylistModal
        visible={playlistModalVisible}
        onClose={() => {
          setPlaylistModalVisible(false);
          setTargetSongForPlaylist(null);
        }}
        targetSong={targetSongForPlaylist}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MusicProvider>
          <MainNavigator />
        </MusicProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090D',
  },
  screenArea: {
    flex: 1,
  },
  bottomNavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    paddingBottom: Platform.OS === 'ios' ? 26 : 12,
    paddingHorizontal: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  centerDownloadBtnWrapper: {
    top: -14,
    shadowColor: THEME.colors.spotifyGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  centerDownloadBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
