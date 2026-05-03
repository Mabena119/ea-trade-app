import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ImageBackground,
  Platform,
  Dimensions,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Notifications from 'expo-notifications';
import { Play, Square, Scan, Activity, Trash2, Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp, type EA } from '@/providers/app-provider';
import { getScreenBackgroundColor, isMatrixStyleTheme, useTheme } from '@/providers/theme-provider';
import { normalizeEaBrandLogoHttpUrl, resolveEABrandImageSource } from '@/utils/ea-brand-image';
import { MatrixSceneRain } from '@/components/matrix-scene-rain';
import { EABrandProfileMedia } from '@/components/ea-brand-profile-media';
import { overlayService } from '@/services/overlay-service';
import colors from '@/constants/colors';
import { getHeroFullBleedFade } from '@/utils/theme-hero-fades';

export default function HomeScreen() {
  const { eas, isFirstTime, setIsFirstTime, removeEA, isBotActive, setBotActive, setActiveEA, mt5Account } = useApp();
  const { theme, themeName, toggleTheme } = useTheme();

  // Safely get the primary EA (first one in the list)
  const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
  const otherEAs = Array.isArray(eas) ? eas.slice(1) : []; // All EAs except the first one

  console.log('HomeScreen render - EAs count:', eas?.length || 0, 'Primary EA:', primaryEA?.name || 'none');

  const [logoError, setLogoError] = useState<boolean>(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  /** Android start screen: draw-over-apps + notifications required before START. */
  const [androidOverlayGranted, setAndroidOverlayGranted] = useState<boolean>(() => Platform.OS !== 'android');
  const [androidNotificationGranted, setAndroidNotificationGranted] = useState<boolean>(() => Platform.OS !== 'android');

  const refreshAndroidStartPermissions = useCallback(async (): Promise<{
    overlay: boolean;
    notification: boolean;
  }> => {
    if (Platform.OS !== 'android') {
      return { overlay: true, notification: true };
    }
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const notificationOk = status === 'granted';
      const { overlayService } = await import('@/services/overlay-service');
      const overlayOk = await overlayService.checkOverlayPermission();
      setAndroidNotificationGranted(notificationOk);
      setAndroidOverlayGranted(overlayOk);
      return { overlay: overlayOk, notification: notificationOk };
    } catch (e) {
      console.warn('[Start] permission sync:', e);
      setAndroidNotificationGranted(false);
      setAndroidOverlayGranted(false);
      return { overlay: false, notification: false };
    }
  }, []);

  useEffect(() => {
    if (!isFirstTime || Platform.OS !== 'android') return;
    void refreshAndroidStartPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAndroidStartPermissions();
    });
    return () => sub.remove();
  }, [isFirstTime, refreshAndroidStartPermissions]);
  
  // Triple-tap to toggle theme (for iOS PWA where shake doesn't work)
  const tapCountRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const TRIPLE_TAP_DELAY = 400; // ms between taps
  
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < TRIPLE_TAP_DELAY) {
      tapCountRef.current += 1;
      if (tapCountRef.current >= 3) {
        console.log('🎨 Triple-tap detected! Toggling theme...');
        toggleTheme();
        tapCountRef.current = 0;
      }
    } else {
      tapCountRef.current = 1;
    }
    lastTapTimeRef.current = now;
  }, [toggleTheme]);

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
    const resolved = /^https?:\/\//i.test(raw)
      ? normalizeEaBrandLogoHttpUrl(raw)
      : normalizeEaBrandLogoHttpUrl(raw.replace(/^\/+/, ''));
    return resolved;
  }, []);

  const primaryEAImage = useMemo(() => getEAImageUrl(primaryEA), [getEAImageUrl, primaryEA]);

  useEffect(() => {
    setLogoError(false);
  }, [primaryEAImage]);

  const handleStartNow = async () => {
    try {
      if (Platform.OS === 'android') {
        const { overlay, notification } = await refreshAndroidStartPermissions();
        if (!overlay) {
          await overlayService.requestOverlayPermission();
          return;
        }
        if (!notification) {
          await overlayService.openAppNotificationSettings();
          return;
        }
      }
      console.log('Start Now pressed, navigating to login...');
      // Clear email authentication flag when starting fresh
      await AsyncStorage.removeItem('emailAuthenticated');
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

  const handleAIScanner = () => {
    router.push('/(tabs)/ai-scanner');
  };

  const handleQuotes = () => {
    const hasMt5Linked = Boolean(
      mt5Account &&
      typeof mt5Account.login === 'string' &&
      mt5Account.login.trim().length > 0 &&
      mt5Account.password
    );
    if (!hasMt5Linked) {
      router.push('/(tabs)/metatrader');
      return;
    }
    router.push('/(tabs)/quotes');
  };



  const screenBg = getScreenBackgroundColor(theme, themeName);
  const isMatrix = isMatrixStyleTheme(themeName);
  const isEAGlass = themeName === 'matrixYellow';
  const isBlackTheme = themeName === 'black';

  // EA Glass: dynamic logo source from the active EA (or app icon fallback)
  const eaGlassLogoSource = useMemo(() => {
    if (!isEAGlass) return null;
    const rawLogo = primaryEA?.userData?.owner?.logo;
    return resolveEABrandImageSource(rawLogo);
  }, [isEAGlass, primaryEA?.userData?.owner?.logo]);

  // Fully opaque so matrix rain (drawn behind cards) does not read through the card surface
  const matrixCardGradient = useMemo((): [string, string, string] => {
    if (themeName === 'matrixRed') {
      return ['rgb(58, 12, 18)', 'rgb(36, 8, 12)', 'rgb(72, 16, 22)'];
    }
    return ['rgb(0, 58, 30)', 'rgb(0, 36, 18)', 'rgb(0, 72, 38)'];
  }, [themeName]);

  const heroBleedFade = useMemo(
    () => getHeroFullBleedFade(theme, { isBlackTheme, isMatrix }),
    [theme, isBlackTheme, isMatrix]
  );

  // Block rendering if not authenticated
  if (!isAuthenticated) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: screenBg }]}>
        <View style={styles.splashContent}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Checking authentication...</Text>
        </View>
      </View>
    );
  }

  // Show splash screen for first-time users — always dark purple, never inherits active theme
  const SPLASH_BG = '#09091a';
  const SPLASH_ACCENT = '#8B5CF6';
  if (isFirstTime) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: SPLASH_BG }]}>
        <View style={styles.splashContent}>
          <View style={styles.logoContainer}>
            <Image
              testID="splash-app-icon"
              source={require('../../assets/images/icon.png')}
              style={{ width: 240, height: 240, borderRadius: 48 }}
              resizeMode="contain"
            />
          </View>

          {Platform.OS === 'android' ? (
            <View style={styles.startPermissionPanel}>
              <Text style={[styles.startPermissionHint, { color: 'rgba(255,255,255,0.70)' }]}>
                Allow both to continue. Tap START to open the right Settings screen (Appear on top or
                Notifications) if either still shows ✗.
              </Text>
              <View
                style={[
                  styles.startPermissionRow,
                  {
                    borderColor: `${SPLASH_ACCENT}55`,
                    backgroundColor: `${SPLASH_ACCENT}12`,
                    marginBottom: 10,
                  },
                ]}
              >
                <Text style={[styles.startPermissionMark, { color: androidOverlayGranted ? '#4ade80' : '#f87171' }]}>
                  {androidOverlayGranted ? '✓' : '✗'}
                </Text>
                <Text style={[styles.startPermissionLabel, { color: '#FFFFFF' }]}>
                  Draw on top of other apps
                </Text>
              </View>
              <View
                style={[
                  styles.startPermissionRow,
                  { borderColor: `${SPLASH_ACCENT}55`, backgroundColor: `${SPLASH_ACCENT}12` },
                ]}
              >
                <Text
                  style={[styles.startPermissionMark, { color: androidNotificationGranted ? '#4ade80' : '#f87171' }]}
                >
                  {androidNotificationGranted ? '✓' : '✗'}
                </Text>
                <Text style={[styles.startPermissionLabel, { color: '#FFFFFF' }]}>Notifications</Text>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.splashStartButton, {
              backgroundColor: `${SPLASH_ACCENT}4D`,
              borderColor: `${SPLASH_ACCENT}80`,
              shadowColor: SPLASH_ACCENT,
            }]}
            onPress={handleStartNow}
          >
            <Text style={[styles.startButtonText, { color: '#FFFFFF' }]}>START</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // If no EA, don't render (should have been redirected to license)
  if (!primaryEA) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: screenBg }]}>
        <View style={styles.splashContent}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Loading...</Text>
        </View>
      </View>
    );
  }

  const dynamicStyles = {
    container: {
      backgroundColor: screenBg,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
    },
    botName: {
      color: theme.colors.textPrimary,
    },
    connectedBotsSection: {
      backgroundColor: isMatrix || isEAGlass ? 'transparent' : screenBg,
    },
    sectionBadge: {
      backgroundColor: `${theme.colors.accent}40`,
      borderColor: `${theme.colors.accent}66`,
      borderTopColor: `${theme.colors.accent}99`,
      shadowColor: theme.colors.accent,
    },
  };

  return (
    <SafeAreaView
      style={[styles.container, dynamicStyles.container]}
      edges={['top', 'right', 'bottom', 'left']}
    >
      {/* ── EA GLASS BACKDROP ── full-screen logo canvas behind all content ── */}
      {isEAGlass && eaGlassLogoSource && (
        <ImageBackground
          source={eaGlassLogoSource}
          style={StyleSheet.absoluteFill}
          imageStyle={styles.eaGlassBg}
          resizeMode="cover"
          pointerEvents="none"
        >
          {/* Edge-to-edge vignette for depth and text legibility */}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.65)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </ImageBackground>
      )}

      <MatrixSceneRain>
      {!isMatrix && !isEAGlass && (
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0)']}
          style={styles.pageGlossTop}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
        />
      )}
      {!isMatrix && !isEAGlass && (
        <LinearGradient
          colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.03)']}
          style={styles.pageGlossBottom}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
        />
      )}

      <View style={styles.content}>
        {/* Fixed Active Bot at Top */}
        <View style={styles.mainEAContainer}>

          {/* ════════════════════════════════════════════════════
              EA GLASS HERO — floating avatar above glass card
              ════════════════════════════════════════════════════ */}
          {isEAGlass ? (
            <View style={styles.eaGlassHeroWrapper}>
              {/* Floating logo — lives ABOVE the card so no card clips it */}
              <TouchableOpacity
                style={[styles.circularLogoContainer, styles.eaGlassLogoContainer, styles.eaGlassFloatingLogo]}
                onPress={handleLogoTap}
                activeOpacity={0.9}
              >
                <View style={[styles.circularLogoRing, styles.eaGlassLogoRing]}>
                  <EABrandProfileMedia
                    fillParent={false}
                    brandImageUrl={primaryEAImage}
                    photoUnavailable={logoError}
                    contentFit="cover"
                    fallbackContentFit="contain"
                    containerStyle={[styles.circularLogo, styles.eaGlassCircularLogo, styles.eaProfileMediaClip]}
                    mediaStyle={StyleSheet.absoluteFillObject}
                    onPhotoError={() => setLogoError(true)}
                    fallbackSource={require('../../assets/images/icon.png')}
                    testIDPhoto="ea-logo-circular"
                    testIDVideo="ea-logo-circular-video"
                  />
                </View>
              </TouchableOpacity>

              {/* Glass card — starts below the floating logo */}
              <View style={[styles.heroContent, { shadowColor: '#FFFFFF' }, styles.eaGlassHeroCard, styles.eaGlassHeroCardFloat]}>
                {/* Top-edge shimmer for glass definition */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.00)']}
                  locations={[0, 1]}
                  style={styles.glossShine}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  pointerEvents="none"
                />

                {/* Bot name + status — centred below the floating logo */}
                <View style={[styles.topSection, styles.eaGlassTopSection]}>
                  <View style={styles.botNameContainer}>
                    <Text
                      testID="ea-title"
                      style={[styles.botMainName, styles.eaGlassHeroName]}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {primaryEA.name.toUpperCase()}
                    </Text>
                    <View style={[styles.botStatusDot, isBotActive ? styles.botStatusDotActive : styles.botStatusDotInactive]} />
                  </View>
                </View>

                {/* Action buttons */}
                <View style={styles.bottomActions}>
                  <TouchableOpacity
                    testID="action-start"
                    style={[styles.actionButton, styles.tradeButton, isBotActive ? styles.eaGlassStopOrb : styles.eaGlassStartOrb]}
                    onPress={() => { try { setBotActive(!isBotActive); } catch (e) { console.error(e); } }}
                    activeOpacity={0.6}
                  >
                    <View style={styles.tradeButtonContent}>
                      {isBotActive ? <Square color="#FFFFFF" size={28} strokeWidth={2.5} /> : <Play color="#FFFFFF" size={28} strokeWidth={2.5} fill="#FFFFFF" />}
                      <Text style={styles.tradeButtonText}>{isBotActive ? 'Stop' : 'Start'}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity testID="action-quotes" style={[styles.actionButton, styles.secondaryButton, styles.eaGlassSecondaryBtn]} onPress={handleQuotes} activeOpacity={0.6}>
                    <View style={styles.secondaryButtonContent}>
                      <Activity color="#FFFFFF" size={24} strokeWidth={2.5} />
                      <Text style={styles.secondaryButtonText}>QUOTES</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity testID="action-remove" style={[styles.actionButton, styles.secondaryButton, styles.eaGlassSecondaryBtn]} onPress={handleRemoveActiveBot} activeOpacity={0.6}>
                    <View style={styles.secondaryButtonContent}>
                      <Trash2 color="#FFFFFF" size={24} strokeWidth={2.5} />
                      <Text style={styles.secondaryButtonText}>Remove</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

          ) : (
          <View style={[styles.heroContent, styles.heroContentBlackFullBleed, { shadowColor: theme.colors.glowColor }]}>
            <LinearGradient
              colors={
                isMatrix
                  ? (matrixCardGradient as [string, string, ...string[]])
                  : (theme.colors.primaryGradient as [string, string, ...string[]])
              }
              style={[styles.gradientBackground, isMatrix && { opacity: 0.95 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <TouchableOpacity
              style={styles.blackHeroFullBleedMedia}
              onPress={handleLogoTap}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Robot logo, triple-tap to change theme"
            >
              <EABrandProfileMedia
                fillParent
                brandImageUrl={primaryEAImage}
                photoUnavailable={logoError}
                preferLoopingVideo={isBlackTheme && !isMatrix}
                contentFit="cover"
                fallbackContentFit="cover"
                mediaStyle={styles.blackHeroFullBleedImage}
                onPhotoError={() => setLogoError(true)}
                fallbackSource={require('../../assets/images/icon.png')}
                testIDPhoto="ea-logo-hero-fade"
                testIDVideo="ea-logo-hero-video"
                videoPortraitAspectWH={[9, 16]}
              />
              {/* Bottom-anchored bloom—softer caps so imagery shows through buttons region */}
              <View style={styles.blackHeroBloomHost} pointerEvents="none">
                <LinearGradient
                  colors={heroBleedFade.bloom as [string, string, ...string[]]}
                  locations={[...heroBleedFade.bloomLocations]}
                  style={styles.blackHeroBloomGradient}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                />
              </View>
              {/* Extra read legibility stripe over control row—still translucent */}
              <LinearGradient
                pointerEvents="none"
                colors={heroBleedFade.controlsScrim as [string, string, ...string[]]}
                locations={[0, 0.35, 0.78, 1]}
                style={styles.blackHeroControlsScrim}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              {/* Soft top veil—ties into charcoal rim */}
              <LinearGradient
                pointerEvents="none"
                colors={heroBleedFade.topVeil as [string, string, ...string[]]}
                locations={[0, 0.5, 1]}
                style={styles.blackHeroTopVeil}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              {/* Feathered edge */}
              <LinearGradient
                pointerEvents="none"
                colors={heroBleedFade.edgeWhisper as [string, string, ...string[]]}
                locations={[0, 0.11, 0.89, 1]}
                style={styles.blackHeroEdgeWhisper}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
              />
              <LinearGradient
                pointerEvents="none"
                colors={heroBleedFade.bloomHighlight as [string, string, ...string[]]}
                locations={[0, 0.5, 1]}
                style={styles.blackHeroBloomHighlight}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
            </TouchableOpacity>
            <View
              pointerEvents="box-none"
              style={[styles.blackHeroForeground, { minHeight: BLACK_HERO_CARD_MIN_HEIGHT }]}
            >
              <View
                pointerEvents="none"
                style={styles.blackHeroTopFlexSpacer}
              />
              <View style={[styles.titleBlock, styles.blackHeroTitleWrap]} pointerEvents="box-none">
                <View style={styles.botNameContainer}>
                  <Text
                    testID="ea-title"
                    style={[styles.botMainName, styles.botMainNameBlackHero]}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {primaryEA.name.toUpperCase()}
                  </Text>
                  <View
                    style={[
                      styles.botStatusDot,
                      isBotActive ? styles.botStatusDotActive : styles.botStatusDotInactive,
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.bottomActions, styles.blackHeroBottomActions]}>
                <TouchableOpacity
                  testID="action-start"
                  style={[styles.actionButton, styles.tradeButton]}
                  onPress={() => {
                    try {
                      setBotActive(!isBotActive);
                    } catch (error) {
                      console.error('Error changing bot state:', error);
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <View style={styles.tradeButtonContent}>
                    {isBotActive ? (
                      <Square color="#FFFFFF" size={28} strokeWidth={2.5} />
                    ) : (
                      <Play color="#FFFFFF" size={28} strokeWidth={2.5} fill="#FFFFFF" />
                    )}
                    <Text style={styles.tradeButtonText}>{isBotActive ? 'Stop' : 'Start'}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity testID="action-quotes" style={[styles.actionButton, styles.secondaryButton]} onPress={handleQuotes} activeOpacity={0.6}>
                  <View style={styles.secondaryButtonContent}>
                    <Activity color="#FFFFFF" size={24} strokeWidth={2.5} />
                    <Text style={styles.secondaryButtonText}>QUOTES</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity testID="action-remove" style={[styles.actionButton, styles.secondaryButton]} onPress={handleRemoveActiveBot} activeOpacity={0.6}>
                  <View style={styles.secondaryButtonContent}>
                    <Trash2 color="#FFFFFF" size={24} strokeWidth={2.5} />
                    <Text style={styles.secondaryButtonText}>Remove</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          )}
        </View>

        {/* Scrollable Connected Bots Section */}
        <View style={styles.connectedBotsWrapper}>
          {!isMatrix && !isEAGlass && (
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0)']}
              style={styles.sectionGloss}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              pointerEvents="none"
            />
          )}

          <ScrollView
            style={[
              styles.connectedBotsScrollView,
              { backgroundColor: isMatrix || isEAGlass ? 'transparent' : screenBg },
            ]}
            contentContainerStyle={styles.connectedBotsScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            <View style={[styles.connectedBotsSection, dynamicStyles.connectedBotsSection]}>
              {otherEAs.length > 0 && (
                <>
                  <View testID="connected-bots-header" style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>CONNECTED BOTS</Text>
                    <View testID="connected-bots-count" style={[styles.sectionBadge, dynamicStyles.sectionBadge]}>
                      <Text style={[styles.sectionBadgeText, dynamicStyles.sectionTitle]}>{eas.length}</Text>
                    </View>
                  </View>
                  {otherEAs.map((ea, index) => (
                    <TouchableOpacity
                      key={`${ea.id}-${index}`}
                      style={[
                        styles.botCard,
                        isEAGlass ? {
                          backgroundColor: 'transparent',
                          borderColor: 'rgba(255,255,255,0.18)',
                          borderTopColor: 'rgba(255,255,255,0.32)',
                          shadowColor: 'rgba(255,255,255,0.20)',
                          shadowOpacity: 0.5,
                          shadowRadius: 12,
                          elevation: 8,
                        } : {
                          backgroundColor: `${theme.colors.accent}26`,
                          borderColor: `${theme.colors.accent}4D`,
                          borderTopColor: `${theme.colors.accent}80`,
                          shadowColor: theme.colors.glowColor,
                        },
                      ]}
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
                      {isEAGlass ? (
                        /* EA Glass: crystal-clear card — just a hairline top shimmer, no fill */
                        <LinearGradient
                          colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.00)']}
                          style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 0.6 }}
                          pointerEvents="none"
                        />
                      ) : (
                        <>
                          {/* Gradient background for bot card */}
                          <LinearGradient
                            colors={theme.colors.cardGradient as [string, string, ...string[]]}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          />
                          {Platform.OS === 'ios' && !isMatrix && (
                            <BlurView intensity={40} tint={theme.isDark ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
                          )}
                        </>
                      )}
                      <View style={styles.botCardContent}>
                        <View style={[styles.botIcon, { shadowColor: theme.colors.glowColor }, isEAGlass && styles.eaGlassBotIcon]}>
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
                        <Text
                          style={[
                            styles.botName,
                            { color: theme.isDark ? '#FFFFFF' : theme.colors.textPrimary },
                            isEAGlass && styles.eaGlassBotName,
                          ]}
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {ea.name.toUpperCase()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}




              <TouchableOpacity
                style={[
                  styles.addEAButton,
                  { shadowColor: theme.colors.glowColor },
                  isEAGlass && {
                    backgroundColor: 'transparent',
                    borderColor: 'rgba(255,255,255,0.20)',
                    borderTopColor: 'rgba(255,255,255,0.35)',
                    shadowColor: 'rgba(255,255,255,0.15)',
                    shadowOpacity: 0.5,
                  },
                ]}
                onPress={handleAddNewEA}
                activeOpacity={0.7}
              >
                {isEAGlass ? (
                  /* Crystal-clear: just a top-edge shimmer line */
                  <LinearGradient
                    colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.00)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.6 }}
                    pointerEvents="none"
                  />
                ) : (
                  <>
                {/* Same solid treatment as hero: matrix = opaque card gradient; other themes = primary + glass */}
                <LinearGradient
                  colors={
                    isMatrix
                      ? (matrixCardGradient as [string, string, ...string[]])
                      : (theme.colors.primaryGradient as [string, string, ...string[]])
                  }
                  style={[styles.addEAGradientBackground, isMatrix && { opacity: 0.95 }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                {Platform.OS === 'ios' && !isMatrix && (
                  <BlurView intensity={40} tint="light" style={styles.addEAGlassOverlay} />
                )}
                {!isMatrix && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0)']}
                    style={styles.addEAGlossShine}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                )}
                  </>
                )}

                <Plus color="#FFFFFF" size={24} strokeWidth={2.5} style={{ zIndex: 3 }} />
                <View style={[styles.addEATextContainer, { zIndex: 3 }]}>
                  <Text style={styles.addEATitle}>ADD ROBOT</Text>
                  <Text style={styles.addEASubtitle}>HOST ROBOT KEY</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
      </MatrixSceneRain>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
/** Floor for how tall the black hero poster card should feel (ratio of screen width). */
const BLACK_HERO_CARD_MIN_HEIGHT = Math.round(width * 1.08);
/** Thin strip so content never kisses the rounded top edge on rotation / large text */
const BLACK_HERO_TOP_ART_FLOOR = Math.round(width * 0.04);

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
    marginBottom: 28,
  },
  startPermissionPanel: {
    width: '100%',
    maxWidth: 340,
    marginBottom: 28,
  },
  startPermissionHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  startPermissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  startPermissionMark: {
    fontSize: 18,
    fontWeight: '800',
    width: 28,
  },
  startPermissionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
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
    paddingHorizontal: 64,
    paddingVertical: 18,
    borderRadius: 28,
    minWidth: 220,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  pageGlossTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 100,
  },
  pageGlossBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 100,
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mainEAContainer: {
    paddingTop: 0,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    zIndex: 0,
    opacity: 0.9,
  },
  glossShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    zIndex: 2,
  },
  heroContentBlackFullBleed: {
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  /** Full-card cover art; parent height follows in-flow foreground. */
  blackHeroFullBleedMedia: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    overflow: 'hidden',
  },
  blackHeroControlsScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '46%',
  },
  blackHeroFullBleedImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  /** Scrim: lower portion of card (image spans full hero). */
  blackHeroBloomHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '8%',
  },
  blackHeroBloomGradient: {
    flex: 1,
  },
  blackHeroTopVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '44%',
  },
  blackHeroEdgeWhisper: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.42,
  },
  blackHeroBloomHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '22%',
    opacity: 0.32,
  },
  blackHeroForeground: {
    flexDirection: 'column',
    position: 'relative',
    zIndex: 8,
    width: '100%',
    paddingBottom: 10,
  },
  /** Eats leftover height so robot name + controls sit toward the bottom of the card */
  blackHeroTopFlexSpacer: {
    flex: 1,
    minHeight: BLACK_HERO_TOP_ART_FLOOR,
    width: '100%',
  },
  blackHeroTitleWrap: {
    flexShrink: 0,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  blackHeroBottomActions: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 2,
    marginTop: 0,
    marginBottom: 2,
  },
  botMainNameBlackHero: {
    paddingHorizontal: 8,
    lineHeight: 31,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 16,
  },
  circularLogoContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  circularLogoRing: {
    width: 165,
    height: 165,
    borderRadius: 82.5,
    overflow: 'hidden',
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
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  /** Image+video stack clips to circle / rounded square */
  eaProfileMediaClip: {
    overflow: 'hidden',
    position: 'relative',
  },
  botInfoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  heroContent: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 40,
    overflow: 'hidden',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingBottom: 24,
    zIndex: 10,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
    elevation: 30,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
  },
  topSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    zIndex: 4,
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    textAlign: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    lineHeight: 30,
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
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 12,
    zIndex: 4,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 4,
    overflow: 'hidden',
    borderWidth: 0,
  },
  tradeButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    position: 'relative',
  },
  tradeButtonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
    position: 'relative',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    position: 'relative',
  },
  secondaryButtonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
    position: 'relative',
  },
  tradeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  connectedBotsWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  sectionGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    zIndex: 1,
  },
  connectedBotsScrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  connectedBotsScrollContent: {
    paddingBottom: 100,
    backgroundColor: 'transparent',
  },
  connectedBotsSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'transparent',
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
    borderWidth: 1,
    borderTopWidth: 1.5,
    minWidth: 36,
    alignItems: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  sectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  botCard: {
    borderRadius: 24,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopWidth: 1.5,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  /* ── EA Glass design tokens ── */
  eaGlassBg: {
    opacity: 1,
  },
  /** Wrapper that creates vertical space for the floating logo above the card */
  eaGlassHeroWrapper: {
    marginHorizontal: 16,
    marginTop: 16,
    position: 'relative',
    alignItems: 'center',
  },
  /** Logo absolutely positioned above the card — zIndex keeps it on top */
  eaGlassFloatingLogo: {
    position: 'absolute',
    top: 0,
    zIndex: 20,
    marginBottom: 0,
    backgroundColor: 'transparent',
    /** Circle the touch target so iOS/Android shadow bounds match the avatar */
    borderRadius: 90,
  },
  eaGlassHeroCard: {
    borderColor: 'rgba(255,255,255,0.18)',
    borderTopColor: 'rgba(255,255,255,0.40)',
    backgroundColor: 'transparent',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 0,
  },
  /** Card positioned under the floating logo with enough top padding for overlap */
  eaGlassHeroCardFloat: {
    marginHorizontal: 0,
    marginTop: 90,
    paddingTop: 104,
    width: '100%',
  },
  eaGlassTopSection: {
    paddingTop: 0,
    marginBottom: 4,
  },
  eaGlassLogoContainer: {
    backgroundColor: 'transparent',
    /** Android elevation draws a rectangular shadow — disable; use iOS shadow only */
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 28,
        elevation: 0,
      },
      default: { elevation: 0 },
    }),
  },
  eaGlassLogoRing: {
    borderColor: 'rgba(255,255,255,0.70)',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 18,
        elevation: 0,
      },
      default: { elevation: 0 },
    }),
  },
  eaGlassStartOrb: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1.5,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.80,
    shadowRadius: 16,
    elevation: 12,
  },
  eaGlassStopOrb: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(248,113,113,0.85)',
    borderWidth: 1.5,
    shadowColor: '#F87171',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.80,
    shadowRadius: 16,
    elevation: 12,
  },
  eaGlassSecondaryBtn: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.30)',
    borderWidth: 1,
  },
  eaGlassHeroName: {
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
    letterSpacing: 1.2,
  },
  eaGlassBotIcon: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.30)',
    borderWidth: 1,
  },
  eaGlassCircularLogo: {
    backgroundColor: 'transparent',
  },
  eaGlassBotName: {
    textShadowColor: 'rgba(0,0,0,0.90)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
    fontWeight: '700',
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
    backgroundColor: 'transparent',
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 24,
    marginBottom: 24,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 15,
    position: 'relative',
  },
  addEAGradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 0,
    opacity: 0.9,
  },
  addEAGlassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  addEAGlossShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    zIndex: 2,
  },
  addEATextContainer: {
    marginLeft: 12,
  },
  addEATitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  addEASubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

});