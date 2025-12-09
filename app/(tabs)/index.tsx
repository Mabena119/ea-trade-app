import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ImageBackground, Platform, Dimensions, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Play, Square, TrendingUp, Trash2, Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp } from '@/providers/app-provider';
import type { EA } from '@/providers/app-provider';
import colors from '@/constants/colors';

export default function HomeScreen() {
  const { eas, isFirstTime, setIsFirstTime, removeEA, isBotActive, setBotActive, setActiveEA } = useApp();

  // Safely get the primary EA (first one in the list)
  const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
  const otherEAs = Array.isArray(eas) ? eas.slice(1) : []; // All EAs except the first one

  console.log('HomeScreen render - EAs count:', eas?.length || 0, 'Primary EA:', primaryEA?.name || 'none');

  const [logoError, setLogoError] = useState<boolean>(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // STRICT authentication check - runs on every mount
  useEffect(() => {
    const checkAuthenticationStatus = async () => {
      try {
          const emailAuthenticated = await AsyncStorage.getItem('emailAuthenticated');

        // If first time, show start page (don't redirect)
        if (isFirstTime) {
          console.log('First time user - showing start page');
          setIsAuthenticated(true); // Allow start page to render
          setHasCheckedAuth(true);
          return;
        }
        
        // If not authenticated and not first time, redirect to login
          if (!emailAuthenticated || emailAuthenticated !== 'true') {
          console.log('❌ Not authenticated - redirecting to login');
          setIsAuthenticated(false);
            router.replace('/login');
          return;
        }

        // Authenticated
        console.log('✅ Authenticated - checking EA status');
        setIsAuthenticated(true);
        
        // If authenticated but no EAs, redirect to license immediately
        if (eas.length === 0) {
          console.log('Authenticated but no EA added, redirecting to license...');
          // Don't render home screen, go straight to license
            router.replace('/license');
          return; // Stop here, don't set hasCheckedAuth
        }

        setHasCheckedAuth(true);
      } catch (error) {
        console.error('Error checking authentication status:', error);
        // On error, show start page if first time, otherwise redirect to login
        if (isFirstTime) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          router.replace('/login');
        }
      }
    };

    checkAuthenticationStatus();
  }, [isFirstTime, eas.length]); // Re-run when isFirstTime or eas changes

  const getEAImageUrl = useCallback((ea: EA | null): string | null => {
    if (!ea || !ea.userData || !ea.userData.owner) return null;
    const raw = (ea.userData.owner.logo || '').toString().trim();
    if (!raw) return null;
    // If already an absolute URL, return as-is
    if (/^https?:\/\//i.test(raw)) return raw;
    // Otherwise, treat as filename and prefix uploads base URL
    const filename = raw.replace(/^\/+/, '');
    const base = 'https://www.eatrade.io/admin/uploads';
    return `${base}/${filename}`;
  }, []);

  const primaryEAImage = useMemo(() => getEAImageUrl(primaryEA), [getEAImageUrl, primaryEA]);

  const handleStartNow = async () => {
    console.log('Start Now pressed, navigating to login...');
    try {
      // Clear email authentication flag when starting fresh
      await AsyncStorage.removeItem('emailAuthenticated');
      // Use replace to avoid showing tabs, and don't set isFirstTime to false yet
      router.replace('/login');
    } catch (error) {
      console.error('Error navigating to login:', error);
    }
  };

  const handleAddNewEA = () => {
    router.push('/license');
  };

  const handleRemoveActiveBot = async () => {
    if (primaryEA && primaryEA.id) {
      try {
        console.log('Removing EA:', primaryEA.name, primaryEA.id);
        const success = await removeEA(primaryEA.id);
        if (success) {
          console.log('EA removed successfully, navigating to license screen');
          router.push('/license');
        } else {
          console.error('Failed to remove EA');
        }
      } catch (error) {
        console.error('Error removing EA:', error);
      }
    }
  };

  const handleQuotes = () => {
    router.push('/(tabs)/quotes');
  };



  // Block rendering if not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashContent}>
          <Text style={styles.title}>Checking authentication...</Text>
        </View>
      </View>
    );
  }

  // Show splash screen for first-time users
  if (isFirstTime) {
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashContent}>
          <View style={styles.logoContainer}>
            <Image
              testID="splash-app-icon"
              source={require('../../assets/images/icon.png')}
              style={{ width: 240, height: 240, borderRadius: 48 }}
              resizeMode="contain"
            />
          </View>

          <TouchableOpacity style={styles.splashStartButton} onPress={handleStartNow}>
            <Text style={styles.startButtonText}>START</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // If no EA, don't render (should have been redirected to license)
  if (!primaryEA) {
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashContent}>
          <Text style={styles.title}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.mainEAContainer}>
            <View style={styles.heroContent}>
              {/* Beautiful gradient background */}
              <LinearGradient
                colors={['#8B5CF6', '#EC4899', '#F97316']}
                style={styles.gradientBackground}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              
              <View style={styles.topSection}>
                {/* Circular logo display */}
                <View style={styles.circularLogoContainer}>
                  <View style={styles.circularLogoRing}>
                    {primaryEAImage && !logoError ? (
                      <Image
                        testID="ea-logo-circular"
                        source={{ uri: primaryEAImage }}
                        style={styles.circularLogo}
                        resizeMode="cover"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <Image
                        testID="fallback-logo-circular"
                        source={require('../../assets/images/icon.png')}
                        style={styles.circularLogo}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                </View>
                <View style={styles.titleBlock}>
                  <View style={styles.botNameContainer}>
                  <Text testID="ea-title" style={styles.botMainName} numberOfLines={3} ellipsizeMode="tail">{primaryEA.name.toUpperCase()}</Text>
                    <View style={[
                      styles.botStatusDot,
                      isBotActive ? styles.botStatusDotActive : styles.botStatusDotInactive
                    ]} />
                  </View>
                </View>
              </View>

              <View style={styles.bottomActions}>
                <TouchableOpacity
                  testID="action-start"
                  style={[styles.actionButton, styles.tradeButton]}
                  onPress={() => {
                    console.log('Start/Stop button pressed, current state:', isBotActive);
                    try {
                      setBotActive(!isBotActive);
                      console.log('Bot active state changed to:', !isBotActive);
                    } catch (error) {
                      console.error('Error changing bot state:', error);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <View style={styles.tradeButtonContent}>
                  {isBotActive ? (
                      <Square color="#FFFFFF" size={26} strokeWidth={2.5} />
                  ) : (
                      <Play color="#FFFFFF" size={26} strokeWidth={2.5} fill="#FFFFFF" />
                  )}
                  <Text style={styles.tradeButtonText}>{isBotActive ? 'STOP' : 'TRADE'}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity testID="action-quotes" style={[styles.actionButton, styles.secondaryButton]} onPress={handleQuotes} activeOpacity={0.7}>
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <View style={styles.secondaryButtonContent}>
                  <TrendingUp color="#FFFFFF" size={22} strokeWidth={2.5} />
                  <Text style={styles.secondaryButtonText}>QUOTES</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity testID="action-remove" style={[styles.actionButton, styles.secondaryButton]} onPress={handleRemoveActiveBot} activeOpacity={0.7}>
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <View style={styles.secondaryButtonContent}>
                  <Trash2 color="#FFFFFF" size={22} strokeWidth={2.5} />
                  <Text style={styles.secondaryButtonText}>REMOVE</Text>
                  </View>
                </TouchableOpacity>
              </View>

            </View>
          </View>

        <View style={styles.connectedBotsSection}>
          {otherEAs.length > 0 && (
            <>
              <View testID="connected-bots-header" style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>CONNECTED BOTS</Text>
                <View testID="connected-bots-count" style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{eas.length}</Text>
                </View>
              </View>
              {otherEAs.map((ea, index) => (
                <TouchableOpacity
                  key={`${ea.id}-${index}`}
                  style={styles.botCard}
                  onPress={async () => {
                    try {
                      console.log('Switching active EA to:', ea.name, ea.id);
                      await setActiveEA(ea.id);
                    } catch (error) {
                      console.error('Failed to switch active EA:', error);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
                  )}
                  <View style={styles.botCardContent}>
                    <View style={styles.botIcon}>
                      {getEAImageUrl(ea as unknown as EA) ? (
                        <Image
                          testID={`ea-logo-small-${index}`}
                          source={{ uri: getEAImageUrl(ea as unknown as EA) as string }}
                          style={styles.smallLogo}
                        />
                      ) : (
                        <View style={styles.robotFace}>
                          <View style={styles.robotEye} />
                          <View style={styles.robotEye} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.botName} numberOfLines={2} ellipsizeMode="tail">{ea.name.toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}




          <TouchableOpacity style={styles.addEAButton} onPress={handleAddNewEA} activeOpacity={0.7}>
            {Platform.OS === 'ios' && (
              <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
            )}
            <Plus color="#FFFFFF" size={24} strokeWidth={2.5} />
            <View style={styles.addEATextContainer}>
              <Text style={styles.addEATitle}>ADD ROBOT</Text>
              <Text style={styles.addEASubtitle}>HOST ROBOT KEY</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  splashContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    letterSpacing: 2,
  },
  description: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 60,
    paddingHorizontal: 20,
  },
  splashStartButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 60,
    paddingVertical: 16,
    borderRadius: 8,
    minWidth: 200,
  },
  startButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
  },
  mainEAContainer: {
    paddingTop: 0,
    paddingBottom: 20,
    position: 'relative',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 0,
  },
  circularLogoContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  circularLogoRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  circularLogo: {
    width: 165,
    height: 165,
    borderRadius: 82.5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  botInfoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  heroContent: {
    marginHorizontal: 20,
    marginTop: 40,
    marginBottom: 20,
    borderRadius: 32,
    overflow: 'hidden',
    minHeight: 480,
    justifyContent: 'space-between',
    paddingTop: 32,
    paddingBottom: 28,
    zIndex: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 16,
  },
  topSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  titleBlock: {
    alignItems: 'center',
  },
  botNameContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botMainName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    textAlign: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    lineHeight: 34,
  },
  botStatusDot: {
    position: 'absolute',
    top: -8,
    right: -12,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  botStatusDotActive: {
    backgroundColor: '#25D366',
    shadowColor: '#25D366',
  },
  botStatusDotInactive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  botDescription: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  connectedCountBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 12,
  },
  connectedCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    overflow: 'hidden',
    borderWidth: 0,
  },
  tradeButton: {
    flex: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(20px)',
    paddingVertical: 18,
    position: 'relative',
    shadowColor: 'rgba(255, 255, 255, 0.5)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  tradeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
    position: 'relative',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    position: 'relative',
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  secondaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
    position: 'relative',
  },
  tradeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  connectedBotsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    position: 'relative',
    marginTop: 0,
    backgroundColor: '#000000',
    overflow: 'hidden',
    zIndex: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    minWidth: 36,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  sectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  botCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 24,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  botCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  botIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  smallLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  robotFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  robotEye: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#000000',
    marginHorizontal: 2,
  },
  botName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    flexWrap: 'wrap',
    numberOfLines: 2,
    textAlign: 'left',
    letterSpacing: 0.3,
  },
  addEAButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  addEATextContainer: {
    marginLeft: 12,
  },
  addEATitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  addEASubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

});