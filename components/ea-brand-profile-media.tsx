import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Animated,
  Image,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio, ResizeMode, Video } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';
import type { VideoReadyForDisplayEvent } from 'expo-av/build/Video.types';

import { normalizeEaBrandLogoHttpUrl } from '@/utils/ea-brand-image';
import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';

/**
 * EA `admin/uploads/*.mp4` are encoded **9:16 portrait** (verified with ffprobe).
 * Using ResizeMode.COVER with AVPlayerLayer on iOS drifts to one side for certain clips.
 * We instead compute the center cover-fill rect in JS, position the Video at (0,0) and
 * apply a CSS transform for the crop offset — transforms are applied post-layout so
 * they don't trigger iOS's out-of-bounds clipping of absolute children.
 */
const EA_VIDEO_ASPECT_W = 9;
const EA_VIDEO_ASPECT_H = 16;

const STILL_TO_VIDEO_FADE_MS = 380;
const VIDEO_TO_STILL_FADE_MS = 220;

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (`owner.logo`): looping video URL is the sibling `.mp4`.
   */
  brandImageUrl: string | null;
  photoUnavailable?: boolean;
  preferLoopingVideo?: boolean;
  contentFit?: ContentFit;
  fallbackContentFit?: ContentFit;
  /**
   * Hero / full-bleed: set `true` so the component fills its parent TouchableOpacity.
   * Circles / glass: set `false` and control sizing via `containerStyle`.
   */
  fillParent?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  mediaStyle: StyleProp<ViewStyle>;
  onPhotoError?: () => void;
  fallbackSource: number;
  testIDPhoto?: string;
  testIDVideo?: string;
};

function buildVideoSource(uri: string): { uri: string; overrideFileExtensionAndroid?: string } {
  if (Platform.OS === 'android' && (uri.startsWith('http://') || uri.startsWith('https://'))) {
    return { uri, overrideFileExtensionAndroid: 'mp4' };
  }
  return { uri };
}

/**
 * Compute the pixel rect that makes `aw × ah` source fill `boxW × boxH`
 * via center-anchored cover (same as UIImageView scaleAspectFill).
 * Returns null when any dimension is non-positive.
 */
function coverFillRect(
  boxW: number,
  boxH: number,
  aw: number,
  ah: number
): { width: number; height: number; offsetX: number; offsetY: number } | null {
  if (!(boxW > 0) || !(boxH > 0) || !(aw > 0) || !(ah > 0)) return null;
  const scale = Math.max(boxW / aw, boxH / ah);
  const width = aw * scale;
  const height = ah * scale;
  // Clamp offsets so the video never leaves a gap at any edge.
  const offsetX = Math.min(0, Math.max(boxW - width, (boxW - width) / 2));
  const offsetY = Math.min(0, Math.max(boxH - height, (boxH - height) / 2));
  return { width, height, offsetX, offsetY };
}

async function deleteCachedMp4(imageStem: string): Promise<void> {
  const stem = imageStem.trim();
  if (!stem) return;
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  if (!base) return;
  await FileSystem.deleteAsync(`${base}${CACHE_SUBDIR}${stem}.mp4`, { idempotent: true }).catch(
    () => {}
  );
}

export function EABrandProfileMedia({
  brandImageUrl,
  photoUnavailable = false,
  preferLoopingVideo,
  contentFit = 'cover',
  fallbackContentFit,
  fillParent = false,
  containerStyle,
  mediaStyle,
  onPhotoError,
  fallbackSource,
  testIDPhoto,
  testIDVideo,
}: EABrandProfileMediaProps) {
  const tryVideo = preferLoopingVideo ?? Platform.OS !== 'web';
  const resolvedContentFit: ContentFit = contentFit;
  const resolvedFallbackFit: ContentFit = fallbackContentFit ?? 'contain';

  const canonicalStillUrl = useMemo(() => normalizeEaBrandLogoHttpUrl(brandImageUrl), [brandImageUrl]);
  const remoteMp4 = useMemo(() => deriveEALogoMp4Url(canonicalStillUrl), [canonicalStillUrl]);
  const imageStem = useMemo(() => deriveEaBrandImageStemFromUrl(canonicalStillUrl), [canonicalStillUrl]);

  const [playUri, setPlayUri] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [firstFrameSeen, setFirstFrameSeen] = useState(false);
  /**
   * Incremented every time we need a full video reinitialisation (app foreground,
   * theme change). Adding it to the setup-effect deps tears down the Video component
   * and rebuilds it from scratch so autoplay is always guaranteed.
   */
  const [reinitKey, setReinitKey] = useState(0);

  const playUriRef = useRef<string | null>(null);
  playUriRef.current = playUri;

  /** Ref to the Video component so we can call playAsync() on app-foreground resume. */
  const videoRef = useRef<Video | null>(null);

  /**
   * True while the video SHOULD be visible and playing (crossfade has completed).
   * Used by onPlaybackStatusUpdate to decide whether to force-resume on an unexpected pause.
   * A plain ref avoids re-creating the callback every time the state changes.
   */
  const shouldKeepPlayingRef = useRef(false);

  /**
   * Full reinitialisation strategy:
   *  • background / inactive → hide video immediately (still re-covers it).
   *  • active → bump reinitKey, which re-runs the audio-await → set-URI effect so
   *    the Video component unmounts, the audio session is re-confirmed, and it
   *    remounts fresh. The still stays visible throughout, so no play-button flash.
   *
   * This handles both cold-start (iOS doesn't honour shouldPlay before audio session
   * is ready) and foreground-resume (AVPlayer paused state after backgrounding).
   */
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        shouldKeepPlayingRef.current = false;
        setFirstFrameSeen(false);
        setPlayUri(null); // unmount Video while hidden — clean slate on resume
      } else if (next === 'active') {
        setReinitKey((k) => k + 1); // triggers full re-init below
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // ── Audio session + video URI (re-runs on source change OR reinitKey bump) ─
  /**
   * Always await the audio session before assigning a URI to the Video component.
   * This prevents the cold-start race where AVPlayer receives its source before iOS
   * has granted silent-mode playback, which caused a brief paused state + play button.
   */
  useEffect(() => {
    setVideoFailed(false);
    setFirstFrameSeen(false);
    shouldKeepPlayingRef.current = false;

    if (!tryVideo || !canonicalStillUrl || !remoteMp4 || !imageStem) {
      setPlayUri(null);
      return;
    }

    let cancelled = false;

    const setupThenPlay = async () => {
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          allowsRecordingIOS: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});
      }
      if (cancelled) return;
      setPlayUri(remoteMp4);
      if (Platform.OS !== 'web') {
        void ensureEaBrandMp4Cached(remoteMp4, imageStem).catch(() => {});
      }
    };

    void setupThenPlay();
    return () => { cancelled = true; };
    // reinitKey intentionally included: bumping it forces a full teardown + rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryVideo, canonicalStillUrl, remoteMp4, imageStem, reinitKey]);

  if (__DEV__) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (tryVideo && canonicalStillUrl && remoteMp4) {
        console.log('[EABrandProfileMedia] still:', canonicalStillUrl, '| mp4:', remoteMp4);
      }
    }, [tryVideo, canonicalStillUrl, remoteMp4]);
  }

  // ── Error recovery ────────────────────────────────────────────────────────
  const failOnce = useRef<string | null>(null);
  const recoveringRef = useRef(false);
  const repairAttempts = useRef(0);

  useEffect(() => {
    repairAttempts.current = 0;
  }, [canonicalStillUrl, remoteMp4]);

  useEffect(() => {
    failOnce.current = null;
  }, [playUri]);

  const bail = useCallback(() => {
    const u = playUriRef.current;
    if (!u || failOnce.current === u) return;
    failOnce.current = u;
    setVideoFailed(true);
    setFirstFrameSeen(false);
  }, []);

  const retryOrBail = useCallback(async () => {
    if (recoveringRef.current || Platform.OS === 'web' || !remoteMp4 || !imageStem) {
      bail();
      return;
    }
    recoveringRef.current = true;
    try {
      await deleteCachedMp4(imageStem);
      const local = await ensureEaBrandMp4Cached(remoteMp4, imageStem);
      setVideoFailed(false);
      failOnce.current = null;
      setPlayUri(local);
    } catch {
      setVideoFailed(false);
      failOnce.current = null;
      setPlayUri(remoteMp4);
    } finally {
      recoveringRef.current = false;
    }
  }, [remoteMp4, imageStem, bail]);

  const onVideoError = useCallback(
    (msg: string) => {
      console.warn('[EABrandProfileMedia] Video error:', msg);
      if (recoveringRef.current) return;
      repairAttempts.current += 1;
      if (repairAttempts.current > 2) { bail(); return; }
      void retryOrBail();
    },
    [bail, retryOrBail]
  );

  // ── Hero cover-fill rectangle ─────────────────────────────────────────────
  /**
   * In hero mode (`fillParent + cover`) we manually compute and pin the Video into
   * the exact same cover-fill rectangle that UIImageView uses for the still poster.
   * This eliminates AVPlayerLayer's axis-alignment drift on iOS.
   */
  const isHeroMode = fillParent && resolvedContentFit === 'cover';

  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  const rect = useMemo(
    () =>
      isHeroMode && box.w > 0 && box.h > 0
        ? coverFillRect(box.w, box.h, EA_VIDEO_ASPECT_W, EA_VIDEO_ASPECT_H)
        : null,
    [isHeroMode, box.w, box.h]
  );

  // ── Playback callbacks ────────────────────────────────────────────────────
  const onReady = useCallback((evt: VideoReadyForDisplayEvent | undefined) => {
    void evt;
  }, []);

  const onLoad = useCallback((status: AVPlaybackStatus) => {
    void status;
  }, []);

  /**
   * Only crossfade to video once isPlaying=true is confirmed — this keeps the still
   * on top until frames are genuinely rendering, hiding any AVPlayer overlay.
   *
   * After crossfade, if the video pauses for any reason (iOS 18 buffering interrupt,
   * system resource pressure, etc.) call playAsync() immediately so the play-button
   * overlay never has time to become visible.
   */
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      shouldKeepPlayingRef.current = true;
      setFirstFrameSeen(true);
    } else if (shouldKeepPlayingRef.current) {
      // Unexpected pause while video is supposed to be showing — resume instantly.
      videoRef.current?.playAsync().catch(() => {});
    }
  }, []);

  const showVideo = Boolean(playUri && tryVideo && !videoFailed && remoteMp4 && imageStem);
  const videoSource = showVideo && playUri ? buildVideoSource(playUri) : null;

  // ── Fallback timeout: show video even if callbacks are unreliable ─────────
  useEffect(() => {
    if (!videoSource || firstFrameSeen) return;
    const t = setTimeout(() => setFirstFrameSeen(true), 3000);
    return () => clearTimeout(t);
  }, [videoSource, firstFrameSeen]);

  // ── Crossfade animation ───────────────────────────────────────────────────
  const stillOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toVideo = videoSource != null && firstFrameSeen && !videoFailed;
    Animated.parallel([
      Animated.timing(stillOpacity, {
        toValue: toVideo ? 0 : 1,
        duration: toVideo ? STILL_TO_VIDEO_FADE_MS : VIDEO_TO_STILL_FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(videoOpacity, {
        toValue: toVideo ? 1 : 0,
        duration: toVideo ? STILL_TO_VIDEO_FADE_MS : VIDEO_TO_STILL_FADE_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [videoSource, firstFrameSeen, videoFailed, stillOpacity, videoOpacity]);

  const sharedPlayback = useMemo(
    () => ({
      shouldPlay: true as const,
      isLooping: true as const,
      isMuted: true as const,
      volume: 0 as const,
      useNativeControls: false as const,
      usePoster: false as const,
      progressUpdateIntervalMillis: 100,
      onError: onVideoError,
      onLoad: onLoad,
      onReadyForDisplay: onReady,
      onPlaybackStatusUpdate: onPlaybackStatusUpdate,
    }),
    [onVideoError, onLoad, onReady, onPlaybackStatusUpdate]
  );

  // ── Still image ───────────────────────────────────────────────────────────
  const photoUri = !photoUnavailable && canonicalStillUrl ? canonicalStillUrl : null;
  const stillFit: ContentFit = photoUri ? resolvedContentFit : resolvedFallbackFit;

  const stillLayer = (
    <Image
      testID={testIDPhoto}
      source={photoUri != null ? { uri: photoUri } : fallbackSource}
      style={StyleSheet.absoluteFillObject}
      resizeMode={stillFit}
      {...(photoUri ? { onError: onPhotoError } : {})}
    />
  );

  // ── Video layer ───────────────────────────────────────────────────────────
  /**
   * HERO PATH — manual cover-fill with transform-based offset.
   *
   * Why transform instead of layout `top/left`?
   * The cover-fill rect typically has a negative offsetY to crop the video vertically.
   * On iOS, setting `top: negative` on an absolute child whose layout starts outside
   * the parent's bounds triggers Yoga/CALayer to skip rendering the child when the
   * parent has `overflow: hidden`.  Using `top: 0` + `transform: translateY(offsetY)`
   * keeps the layout origin inside the parent so iOS renders it normally, then the
   * transform shifts the visual output and `overflow: hidden` clips it correctly.
   */
  const heroVideo =
    videoSource != null && isHeroMode && rect ? (
      <Video
        ref={videoRef}
        testID={testIDVideo}
        key={`hero:${rect.width.toFixed(0)}x${rect.height.toFixed(0)}:${playUri}`}
        source={videoSource}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: rect.width,
          height: rect.height,
          transform: [{ translateX: rect.offsetX }, { translateY: rect.offsetY }],
        }}
        videoStyle={{ width: rect.width, height: rect.height }}
        resizeMode={ResizeMode.STRETCH}
        {...sharedPlayback}
      />
    ) : null;

  /** NATIVE PATH — circles / glass: let AVPlayerLayer handle it (no cover drift in circles). */
  const nativeVideo =
    videoSource != null && !isHeroMode ? (
      <Video
        ref={videoRef}
        testID={testIDVideo}
        key={`native:${playUri}`}
        source={videoSource}
        style={StyleSheet.absoluteFillObject}
        videoStyle={StyleSheet.absoluteFillObject}
        resizeMode={resolvedContentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER}
        {...sharedPlayback}
      />
    ) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View
      style={[fillParent && StyleSheet.absoluteFillObject, containerStyle] as StyleProp<ViewStyle>}
      pointerEvents="box-none"
      onLayout={isHeroMode ? onLayout : undefined}
    >
      {/* Still poster — always rendered underneath; fades out when video is ready */}
      <Animated.View
        style={[styles.layer, mediaStyle as ViewStyle, { opacity: stillOpacity, zIndex: 1 }]}
        pointerEvents="none"
      >
        {stillLayer}
      </Animated.View>

      {/* Video — fades in once the player signals first-frame ready */}
      {videoSource != null ? (
        <Animated.View
          style={[styles.layer, mediaStyle as ViewStyle, { opacity: videoOpacity, zIndex: 2 }]}
          pointerEvents="none"
        >
          {isHeroMode ? heroVideo : nativeVideo}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
});
