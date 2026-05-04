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
import { VideoView, useVideoPlayer } from 'expo-video';

import { normalizeEaBrandLogoHttpUrl } from '@/utils/ea-brand-image';
import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';

/**
 * EA profile videos are encoded **9:16 portrait** (verified with ffprobe).
 * See coverFillRect for why we use transform-based positioning instead of
 * layout offsets for the video layer.
 */
const EA_VIDEO_ASPECT_W = 9;
const EA_VIDEO_ASPECT_H = 16;

const STILL_TO_VIDEO_FADE_MS = 380;
const VIDEO_TO_STILL_FADE_MS = 220;

export type EABrandProfileMediaProps = {
  brandImageUrl: string | null;
  photoUnavailable?: boolean;
  preferLoopingVideo?: boolean;
  contentFit?: ContentFit;
  fallbackContentFit?: ContentFit;
  fillParent?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  mediaStyle: StyleProp<ViewStyle>;
  onPhotoError?: () => void;
  fallbackSource: number;
  testIDPhoto?: string;
  testIDVideo?: string;
};

/**
 * Compute the pixel rect that makes `aw × ah` source fill `boxW × boxH`
 * via center-anchored cover (same as UIImageView scaleAspectFill).
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

  const canonicalStillUrl = useMemo(
    () => normalizeEaBrandLogoHttpUrl(brandImageUrl),
    [brandImageUrl]
  );
  const remoteMp4 = useMemo(() => deriveEALogoMp4Url(canonicalStillUrl), [canonicalStillUrl]);
  const imageStem = useMemo(
    () => deriveEaBrandImageStemFromUrl(canonicalStillUrl),
    [canonicalStillUrl]
  );

  const [playUri, setPlayUri] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [firstFrameSeen, setFirstFrameSeen] = useState(false);
  const playUriRef = useRef<string | null>(null);
  playUriRef.current = playUri;

  // ── Video source URI management ───────────────────────────────────────────
  useEffect(() => {
    setVideoFailed(false);
    setFirstFrameSeen(false);

    if (!tryVideo || !canonicalStillUrl || !remoteMp4 || !imageStem) {
      setPlayUri(null);
      return;
    }
    setPlayUri(remoteMp4);

    if (Platform.OS !== 'web') {
      void ensureEaBrandMp4Cached(remoteMp4, imageStem).catch(() => {});
    }
  }, [tryVideo, canonicalStillUrl, remoteMp4, imageStem]);

  // ── Error recovery ────────────────────────────────────────────────────────
  const failOnce = useRef<string | null>(null);
  const recoveringRef = useRef(false);
  const repairAttempts = useRef(0);

  useEffect(() => { repairAttempts.current = 0; }, [canonicalStillUrl, remoteMp4]);
  useEffect(() => { failOnce.current = null; }, [playUri]);

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

  // ── Video player (expo-video) ─────────────────────────────────────────────
  const showVideo = Boolean(playUri && tryVideo && !videoFailed && remoteMp4 && imageStem);
  const activeUri = showVideo ? playUri : null;

  /**
   * expo-video's useVideoPlayer replaces expo-av's Video component.
   * Key benefit: nativeControls={false} on VideoView is respected on iOS 18+
   * without any play-button overlay appearing, unlike expo-av.
   *
   * IMPORTANT: useVideoPlayer only calls the setup callback on initial creation.
   * When activeUri changes from null → URI it calls player.replace() internally
   * WITHOUT re-running the setup callback, so p.play() inside setup is never
   * called for the real source. We therefore set loop/muted in setup (one-time)
   * and drive playback imperatively via useEffect below.
   */
  const player = useVideoPlayer(activeUri ?? '', (p) => {
    p.loop = true;
    p.muted = true;
    p.volume = 0;
  });

  // Imperatively start looping playback whenever the active URI changes.
  useEffect(() => {
    player.loop = true;
    player.muted = true;
    player.volume = 0;
    if (activeUri) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [activeUri, player]);

  // Detect first confirmed-playing frame → trigger crossfade
  useEffect(() => {
    if (!activeUri) return;
    const sub = player.addListener('playingChange', (event) => {
      if (event.isPlaying) setFirstFrameSeen(true);
    });
    return () => sub.remove();
  }, [player, activeUri]);

  // Error handling
  useEffect(() => {
    if (!activeUri) return;
    const sub = player.addListener('statusChange', (event) => {
      if (event.status === 'error') {
        console.warn('[EABrandProfileMedia] Video error:', event.error?.message);
        if (recoveringRef.current) return;
        repairAttempts.current += 1;
        if (repairAttempts.current > 2) { bail(); return; }
        void retryOrBail();
      }
    });
    return () => sub.remove();
  }, [player, activeUri, bail, retryOrBail]);

  /**
   * iOS pauses video on background/inactive. On iOS 18+ a paused-but-visible
   * AVPlayer shows a play-button overlay. Fix:
   *  • background → flip back to still immediately (videoOpacity=0)
   *  • active → player.play(); playingChange event re-triggers the crossfade
   */
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        setFirstFrameSeen(false);
      } else if (next === 'active' && activeUri) {
        try { player.play(); } catch {}
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [player, activeUri]);

  // Fallback: if playingChange never fires (network slow etc.), show video after 3s
  useEffect(() => {
    if (!activeUri || firstFrameSeen) return;
    const t = setTimeout(() => setFirstFrameSeen(true), 3000);
    return () => clearTimeout(t);
  }, [activeUri, firstFrameSeen]);

  // ── Hero cover-fill rectangle ─────────────────────────────────────────────
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

  // ── Crossfade animation ───────────────────────────────────────────────────
  const stillOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const toVideo = activeUri != null && firstFrameSeen && !videoFailed;
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
  }, [activeUri, firstFrameSeen, videoFailed, stillOpacity, videoOpacity]);

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

  // ── Video layers ──────────────────────────────────────────────────────────
  /**
   * HERO PATH — manual cover-fill with transform-based offset.
   * `top: 0` keeps layout inside parent bounds; `transform` shifts the crop
   * window. This avoids the iOS `overflow:hidden` layout-clip bug for absolute
   * children with negative `top`.
   */
  /**
   * Hero video: use an explicit-size clipping View (overflow:hidden) positioned
   * at (0,0) inside the Animated.View. The VideoView is sized to the full cover
   * rect and shifted via transform. This avoids the iOS layout-clip bug where
   * absolute children with negative top get entirely hidden when the parent has
   * overflow:hidden (transform is applied post-layout, so the layout origin
   * stays within bounds and clipping works correctly).
   */
  const heroVideo =
    activeUri != null && isHeroMode && rect ? (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: box.w,
          height: box.h,
          overflow: 'hidden',
        }}
        pointerEvents="none"
      >
        <VideoView
          testID={testIDVideo}
          player={player}
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          contentFit="fill"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: rect.width,
            height: rect.height,
            transform: [{ translateX: rect.offsetX }, { translateY: rect.offsetY }],
          }}
        />
      </View>
    ) : null;

  /** NATIVE PATH — circles / glass: use contentFit="cover" directly. */
  const nativeVideo =
    activeUri != null && !isHeroMode ? (
      <VideoView
        testID={testIDVideo}
        player={player}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit={resolvedContentFit === 'contain' ? 'contain' : 'cover'}
        style={StyleSheet.absoluteFillObject}
      />
    ) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View
      style={[fillParent && StyleSheet.absoluteFillObject, containerStyle] as StyleProp<ViewStyle>}
      pointerEvents="box-none"
      onLayout={isHeroMode ? onLayout : undefined}
    >
      <Animated.View
        style={[styles.layer, mediaStyle as ViewStyle, { opacity: stillOpacity, zIndex: 1 }]}
        pointerEvents="none"
      >
        {stillLayer}
      </Animated.View>

      {activeUri != null ? (
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
