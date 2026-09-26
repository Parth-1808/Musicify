import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME } from '../theme/theme';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { UserQuota } from '../types';
import { ApiService } from '../services/apiService';
import { useAuth } from '../context/AuthContext';

interface VipPaywallModalProps {
  visible: boolean;
  onClose: () => void;
  quota: UserQuota | null;
  onRefreshQuota: () => Promise<void>;
}

export const VipPaywallModal: React.FC<VipPaywallModalProps> = ({
  visible,
  onClose,
  quota,
  onRefreshQuota,
}) => {
  const { user } = useAuth();
  const [redeemCode, setRedeemCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [copied, setCopied] = useState(false);

  const referralCode = quota?.referral_code || 'MUSIFY';
  const usedSongs = quota?.used_songs ?? 0;
  const totalQuota = quota?.total_quota ?? 25;
  const isVip = quota?.is_vip || quota?.has_unlimited_access;

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Copy Failed', 'Please select and copy the code manually.');
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on Musify for ultra-high-fidelity 320kbps music streaming! Use my referral code ${referralCode} to get 5 free bonus songs! Download: https://github.com/Parth-1808/Musicify`,
      });
    } catch {
      // User cancelled share
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      Alert.alert('Missing Code', 'Please enter a 6-character referral code.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Sign In Required', 'Please sign in to redeem a referral code.');
      return;
    }

    try {
      setIsRedeeming(true);
      const res = await ApiService.applyReferralCode(user.id, redeemCode.trim());
      if (res.success) {
        Alert.alert('Bonus Unlocked!', res.message || '+5 free songs added to your library!');
        setRedeemCode('');
        await onRefreshQuota();
      } else {
        Alert.alert('Referral Error', res.error || 'Could not apply referral code.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to redeem referral code.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handlePayVip = async () => {
    // Standard Indian NPCI UPI scheme: opens PhonePe, Paytm, GPay directly!
    const upiUrl = `upi://pay?pa=musify@upi&pn=Musify%20Audio&am=25&cu=INR&tn=Musify%20VIP%20Access`;

    try {
      const supported = await Linking.canOpenURL(upiUrl);
      if (supported) {
        await Linking.openURL(upiUrl);
      } else {
        Alert.alert(
          'UPI App Not Found',
          'Please ensure PhonePe, Paytm, or Google Pay is installed to complete VIP activation.'
        );
      }
    } catch {
      Alert.alert(
        'Musify VIP Pass (₹25/mo)',
        'UPI intent triggered. If payment was completed, your account will update automatically.'
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={styles.vipBadge}>
                <Ionicons name="sparkles" size={12} color="#000" />
                <Text style={styles.vipBadgeText}>VIP ACCESS</Text>
              </View>
              {quota?.paywall_enabled ? (
                <View style={styles.quotaPill}>
                  <Text style={styles.quotaPillText}>
                    {usedSongs} / {totalQuota} Songs Used
                  </Text>
                </View>
              ) : (
                <View style={styles.betaPill}>
                  <Text style={styles.betaPillText}>Free Beta Active</Text>
                </View>
              )}
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={THEME.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Title & Banner */}
            <Text style={styles.title}>Musify VIP Pass</Text>
            <Text style={styles.subtitle}>
              Free for first 25 songs per user. Unlock unlimited cloud library sync or invite friends for bonus songs.
            </Text>

            {/* Quota Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Library Song Quota</Text>
                <Text style={styles.progressValue}>
                  {isVip ? 'Unlimited' : `${usedSongs} / ${totalQuota} Tracks`}
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <LinearGradient
                  colors={isVip ? ['#FFD700', '#FFA500'] : ['#00F0FF', '#7000FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressBarFill,
                    {
                      width: isVip
                        ? '100%'
                        : `${Math.min(100, (usedSongs / Math.max(1, totalQuota)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.quotaHint}>
                {isVip
                  ? '👑 You have active VIP status with unlimited tracks.'
                  : `Free for first 25 songs per user. ${Math.max(0, totalQuota - usedSongs)} slots remaining.`}
              </Text>
            </View>

            {/* Upgrade Card (₹25/mo) */}
            <GlassCard glow="cyan" style={styles.vipCard} borderRadius={THEME.borderRadius.lg}>
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planTitle}>Unlimited VIP Pass</Text>
                  <Text style={styles.planPrice}>₹25 <Text style={styles.planPeriod}>/ month</Text></Text>
                </View>
                <View style={styles.crownCircle}>
                  <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
                </View>
              </View>

              <View style={styles.perksList}>
                <View style={styles.perkItem}>
                  <Ionicons name="infinite" size={16} color={THEME.colors.cyanNeon} />
                  <Text style={styles.perkText}>Unlimited Cloud Tracks & Playlists</Text>
                </View>
                <View style={styles.perkItem}>
                  <Ionicons name="musical-notes" size={16} color={THEME.colors.cyanNeon} />
                  <Text style={styles.perkText}>Ultra 320kbps Studio Master Playback</Text>
                </View>
                <View style={styles.perkItem}>
                  <Ionicons name="download" size={16} color={THEME.colors.cyanNeon} />
                  <Text style={styles.perkText}>High-Speed On-Device Offline Caching</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.payButton} onPress={handlePayVip}>
                <LinearGradient
                  colors={['#00F0FF', '#7000FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.payGradient}
                >
                  <Ionicons name="flash" size={18} color="#000" />
                  <Text style={styles.payBtnText}>Unlock for ₹25 (PhonePe / Paytm / UPI)</Text>
                </LinearGradient>
              </TouchableOpacity>
            </GlassCard>

            {/* Referral Card (+5 Songs per Friend) */}
            <GlassCard glow="cyan" style={styles.referralCard} borderRadius={THEME.borderRadius.lg}>
              <View style={styles.referralHeader}>
                <View style={styles.giftIcon}>
                  <Ionicons name="gift" size={20} color="#FFD700" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.referralTitle}>Refer Friends (+5 Songs Free)</Text>
                  <Text style={styles.referralSubtitle}>
                    Share your code. Each friend who signs up gives you +5 more free songs!
                  </Text>
                </View>
              </View>

              {/* Code Pill */}
              <View style={styles.codeContainer}>
                <Text style={styles.codeText}>{referralCode}</Text>
                <View style={styles.codeActions}>
                  <TouchableOpacity style={styles.codeBtn} onPress={handleCopyCode}>
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={copied ? '#00FF66' : '#fff'}
                    />
                    <Text style={[styles.codeBtnText, copied && { color: '#00FF66' }]}>
                      {copied ? 'Copied' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.codeBtn, styles.shareBtn]} onPress={handleShare}>
                    <Ionicons name="share-social-outline" size={16} color="#000" />
                    <Text style={[styles.codeBtnText, { color: '#000' }]}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Referral Analytics Pill */}
              <View style={styles.statsPillRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{quota?.total_referrals ?? 0}</Text>
                  <Text style={styles.statLabel}>Friends Joined</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: '#FFD700' }]}>
                    {quota?.vip_conversions ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>VIP Upgrades</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: THEME.colors.cyanNeon }]}>
                    +{(quota?.total_referrals ?? 0) * 5}
                  </Text>
                  <Text style={styles.statLabel}>Bonus Songs</Text>
                </View>
              </View>
            </GlassCard>

            {/* Redeem Friend's Code Section */}
            {!quota?.referred_by && (
              <View style={styles.redeemSection}>
                <Text style={styles.redeemTitle}>Have an Invite Code?</Text>
                <View style={styles.redeemRow}>
                  <TextInput
                    style={styles.redeemInput}
                    placeholder="Enter 6-char code"
                    placeholderTextColor={THEME.colors.textMuted}
                    value={redeemCode}
                    onChangeText={setRedeemCode}
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                  <TouchableOpacity
                    style={styles.redeemBtn}
                    onPress={handleRedeem}
                    disabled={isRedeeming}
                  >
                    {isRedeeming ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.redeemBtnText}>Redeem</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#0A0E17',
    borderRadius: THEME.borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.25)',
    padding: 20,
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  vipBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  quotaPill: {
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.3)',
  },
  quotaPillText: {
    color: THEME.colors.cyanNeon,
    fontSize: 11,
    fontWeight: '700',
  },
  betaPill: {
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
  },
  betaPillText: {
    color: '#00FF66',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  progressContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '800',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  quotaHint: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 6,
  },
  vipCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.35)',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.cyanNeon,
  },
  planPeriod: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    fontWeight: '500',
  },
  crownCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  perksList: {
    gap: 8,
    marginBottom: 16,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perkText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  payButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  payGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 8,
  },
  payBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  referralCard: {
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  giftIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  referralTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  referralSubtitle: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    lineHeight: 15,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    marginBottom: 12,
  },
  codeText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFD700',
    letterSpacing: 2,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  shareBtn: {
    backgroundColor: '#FFD700',
  },
  codeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  statsPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  statBox: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  redeemSection: {
    marginTop: 4,
  },
  redeemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    marginBottom: 8,
  },
  redeemRow: {
    flexDirection: 'row',
    gap: 8,
  },
  redeemInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  redeemBtn: {
    backgroundColor: THEME.colors.cyanNeon,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redeemBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
  },
});
