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
    const base = 'https://ea-converter.com/admin/uploads';
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
            {primaryEAImage && !logoError ? (
              <ImageBackground
                testID="ea-hero-bg"
                source={{ uri: primaryEAImage }}
                style={styles.hero}
                onError={() => setLogoError(true)}
                resizeMode="cover"
              >
                <View style={styles.heroOverlay}>
                  <View style={styles.gradientOverlay} />
                </View>
              </ImageBackground>
            ) : (
              <View style={styles.heroFallback}>
                <Image
                  testID="fallback-app-icon"
                  source={require('../../assets/images/icon.png')}
                  style={styles.fallbackIcon}
                  resizeMode="contain"
                />
                <View style={styles.gradientOverlay} />
              </View>
            )}

            <View style={styles.heroContent}>
              {/* Gradient overlay for transition effect */}
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)', '#000000']}
                style={styles.fadeGradient}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <View style={styles.topSection}>
                <View style={styles.titleBlock}>
                  <Text testID="ea-title" style={styles.botMainName} numberOfLines={3} ellipsizeMode="tail">{primaryEA.name}</Text>
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
                  activeOpacity={0.8}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={120} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <LinearGradient
                    colors={Platform.OS === 'ios' ? ['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'] : ['#FFFFFF', '#FFFFFF']}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.tradeButtonContent}>
                    {isBotActive ? (
                      <Square color="#000000" size={24} />
                    ) : (
                      <Play color="#000000" size={24} />
                    )}
                    <Text style={styles.tradeButtonText}>{isBotActive ? 'STOP' : 'TRADE'}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity testID="action-quotes" style={[styles.actionButton, styles.secondaryButton]} onPress={handleQuotes} activeOpacity={0.8}>
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.secondaryButtonContent}>
                    <TrendingUp color="#FFFFFF" size={20} />
                    <Text style={styles.secondaryButtonText}>QUOTES</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity testID="action-remove" style={[styles.actionButton, styles.secondaryButton]} onPress={handleRemoveActiveBot} activeOpacity={0.8}>
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.secondaryButtonContent}>
                    <Trash2 color="#FFFFFF" size={20} />
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
                  activeOpacity={0.8}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                    style={StyleSheet.absoluteFill}
                  />
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
                    <Text style={styles.botName} numberOfLines={2} ellipsizeMode="tail">{ea.name}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}




          <TouchableOpacity style={styles.addEAButton} onPress={handleAddNewEA} activeOpacity={0.8}>
            {Platform.OS === 'ios' && (
              <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
              style={StyleSheet.absoluteFill}
            />
            <Plus color="#FFFFFF" size={20} />
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
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: 500,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)',
    }),
  },
  fadeGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    width: width,
    zIndex: -1,
  },
  heroFallback: {
    width: '100%',
    height: 500,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  fallbackIcon: {
    width: 160,
    height: 160,
    borderRadius: 32,
  },
  botInfoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 350,
    justifyContent: 'flex-end',
    paddingTop: 40,
    paddingBottom: 30,
    zIndex: 10,
  },
  topSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },

  titleBlock: {
    alignItems: 'center',
  },
  botMainName: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: 'center',
    flexWrap: 'wrap',
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
    paddingHorizontal: 30,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
    borderWidth: 0.3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  tradeButton: {
    flex: 1.4,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 24,
    position: 'relative',
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
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
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
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  sectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderWidth: 0.3,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 28,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  sectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  botCard: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 0.3,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 15,
  },
  botCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  botIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  smallLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
    numberOfLines: 2,
    textAlign: 'center',
  },
  addEAButton: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 20,
    borderWidth: 0.3,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 15,
  },
  addEATextContainer: {
    marginLeft: 12,
  },
  addEATitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addEASubtitle: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
  },

});