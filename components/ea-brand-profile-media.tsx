import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import type { VideoReadyForDisplayEvent } from 'expo-av/build/Video.types';

import { normalizeEaBrandLogoHttpUrl } from '@/utils/ea-brand-image';
import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';

/**
 * EA `admin/uploads/*.mp4` are encoded **720×1280 portrait, no rotation tag** (verified with ffprobe).
 * iOS `AVPlayerLayer.videoGravity = ResizeAspectFill` mis-positions some of these clips far off-center,
 * so we render the layer inside a flex-centered, aspect-matched slot ourselves.
 */
const EA_VIDEO_ASPECT_W = 9;
const EA_VIDEO_ASPECT_H = 16;

const STILL_TO_VIDEO_FADE_MS = 380;
const VIDEO_TO_STILL_FADE_MS = 220;

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (`owner.logo`): looping video URL is sibling `.mp4` beside this still.
   */
  brandImageUrl: string | null;
  photoUnavailable?: boolean;
  preferLoopingVideo?: boolean;
  contentFit?: ContentFit;
  fallbackContentFit?: ContentFit;
  /**
   * Hero / full-bleed: fills the Touchable/card (needed when `mediaStyle` is absolute-fill only).
   * Circles: use false + sized `containerStyle` + `overflow: 'hidden'`.
   */
  fillParent?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  mediaStyle: StyleProp<ViewStyle>;
  onPhotoError?: () => void;
  fallbackSource: number;
  testIDPhoto?: string;
  testIDVideo?: string;
};

function buildVideoPlaybackSource(playUri: string): { uri: string; overrideFileExtensionAndroid?: string } {
  if (Platform.OS === 'android' && (playUri.startsWith('http://') || playUri.startsWith('https://'))) {
    return { uri: playUri, overrideFileExtensionAndroid: 'mp4' };
  }
  return { uri: playUri };
}

/**
 * Returns the **aspect-fill size** for `aw × ah` source rendered inside `boxW × boxH`.
 * Slot is the size only — placement is handled by the flex parent (`alignItems` / `justifyContent`).
 */
function aspectFillSize(
  boxW: number,
  boxH: number,
  aw: number,
  ah: number
): { width: number; height: number } | null {
  if (!(boxW > 0) || !(boxH > 0) || !(aw > 0) || !(ah > 0)) return null;
  const scale = Math.max(boxW / aw, boxH / ah);
  return { width: aw * scale, height: ah * scale };
}

async function deleteCachedMp4ForStem(imageStem: string): Promise<void> {
  const stem = imageStem.trim();
  if (!stem) return;
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  if (!base) return;
  const path = `${base}${CACHE_SUBDIR}${stem}.mp4`;
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
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

  const canonicalStillUrl = useMemo(() => normalizeEaBrandLogoHttpUrl(brandImageUrl), [brandImageUrl]);
  const remoteMp4 = useMemo(() => deriveEALogoMp4Url(canonicalStillUrl), [canonicalStillUrl]);
  const imageStem = useMemo(() => deriveEaBrandImageStemFromUrl(canonicalStillUrl), [canonicalStillUrl]);

  const [playUri, setPlayUri] = useState<string | null>(null);
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);
  /** True after `onReadyForDisplay` fires successfully — triggers crossfade to video layer. */
  const [videoFirstFrameSeen, setVideoFirstFrameSeen] = useState(false);

  const playUriLatestRef = useRef<string | null>(null);
  playUriLatestRef.current = playUri;

  /** Needed on iOS for muted looping clips when hardware mute switch is on. */
  useEffect(() => {
    if (Platform.OS === 'web' || !tryVideo) return;
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      allowsRecordingIOS: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((e) => console.warn('[EABrandProfileMedia] Audio session:', e));
  }, [tryVideo]);

  /** Stream HTTPS `.mp4` immediately; warm disk cache in the background for retry / next session. */
  useEffect(() => {
    setVideoPlaybackFailed(false);
    setVideoFirstFrameSeen(false);

    if (!tryVideo || !canonicalStillUrl || !remoteMp4 || !imageStem) {
      setPlayUri(null);
      return;
    }

    setPlayUri(remoteMp4);

    if (Platform.OS !== 'web') {
      void ensureEaBrandMp4Cached(remoteMp4, imageStem).catch(() => {
        /** Prefetch failures are non-fatal while streaming succeeds */
      });
    }
  }, [tryVideo, canonicalStillUrl, remoteMp4, imageStem]);

  useEffect(() => {
    if (__DEV__ && tryVideo && canonicalStillUrl && remoteMp4) {
      console.log('[EABrandProfileMedia] still:', canonicalStillUrl, '| mp4:', remoteMp4);
    }
  }, [tryVideo, canonicalStillUrl, remoteMp4]);

  const playbackFailOnce = useRef<string | null>(null);
  const recoveringLocalRef = useRef(false);
  const videoRepairAttemptsRef = useRef(0);

  useEffect(() => {
    videoRepairAttemptsRef.current = 0;
  }, [canonicalStillUrl, remoteMp4]);

  const bailPlayback = useCallback(() => {
    const u = playUriLatestRef.current;
    if (!u || playbackFailOnce.current === u) return;
    playbackFailOnce.current = u;
    setVideoPlaybackFailed(true);
    setVideoFirstFrameSeen(false);
    if (__DEV__) console.warn('[EABrandProfileMedia] Video abandoned — showing still:', u);
  }, []);

  useEffect(() => {
    playbackFailOnce.current = null;
  }, [playUri]);

  const retryFromFreshDownloadOrRemote = useCallback(async () => {
    if (
      recoveringLocalRef.current ||
      Platform.OS === 'web' ||
      !remoteMp4 ||
      !imageStem
    ) {
      bailPlayback();
      return;
    }
    recoveringLocalRef.current = true;
    try {
      await deleteCachedMp4ForStem(imageStem);
      const localUri = await ensureEaBrandMp4Cached(remoteMp4, imageStem);
      setVideoPlaybackFailed(false);
      playbackFailOnce.current = null;
      setPlayUri(localUri);
    } catch (e) {
      if (__DEV__) console.warn('[EABrandProfileMedia] Retry download failed:', e);
      setVideoPlaybackFailed(false);
      playbackFailOnce.current = null;
      setPlayUri(remoteMp4);
    } finally {
      recoveringLocalRef.current = false;
    }
  }, [remoteMp4, imageStem, bailPlayback]);

  const onVideoErr = useCallback(
    (msg: string) => {
      console.warn('[EABrandProfileMedia] Video onError:', msg);
      if (recoveringLocalRef.current) return;
      videoRepairAttemptsRef.current += 1;
      if (videoRepairAttemptsRef.current > 2) {
        bailPlayback();
        return;
      }
      void retryFromFreshDownloadOrRemote();
    },
    [retryFromFreshDownloadOrRemote, bailPlayback]
  );

  const showVideoLayer = Boolean(playUri && tryVideo && !videoPlaybackFailed && remoteMp4 && imageStem);

  /** Hero (`fillParent` + `cover`) → manual aspect-fill slot; circles/glass keep native gravity. */
  const useManualAspectFillSlot = fillParent && contentFit === 'cover';

  const [containerBox, setContainerBox] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerBox((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, []);

  const [refinedAspect, setRefinedAspect] = useState<{ w: number; h: number }>({
    w: EA_VIDEO_ASPECT_W,
    h: EA_VIDEO_ASPECT_H,
  });

  useEffect(() => {
    setRefinedAspect({ w: EA_VIDEO_ASPECT_W, h: EA_VIDEO_ASPECT_H });
  }, [canonicalStillUrl, remoteMp4]);

  const onVideoReadyForDisplay = useCallback((evt: VideoReadyForDisplayEvent) => {
    const nw = evt.naturalSize.width;
    const nh = evt.naturalSize.height;
    if (nw > 0 && nh > 0) setRefinedAspect({ w: nw, h: nh });
    setVideoFirstFrameSeen(true);
  }, []);

  const aspectSlotSize = useMemo(
    () =>
      useManualAspectFillSlot && containerBox.width > 0 && containerBox.height > 0
        ? aspectFillSize(containerBox.width, containerBox.height, refinedAspect.w, refinedAspect.h)
        : null,
    [useManualAspectFillSlot, containerBox.width, containerBox.height, refinedAspect.w, refinedAspect.h]
  );

  const photoUri = !photoUnavailable && canonicalStillUrl ? canonicalStillUrl : null;

  const videoSource =
    showVideoLayer && playUri != null ? buildVideoPlaybackSource(playUri) : null;

  /** Crossfade between still poster and looping video — opacities driven by `videoFirstFrameSeen`. */
  const stillOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showVideo = videoSource != null && videoFirstFrameSeen && !videoPlaybackFailed;
    Animated.parallel([
      Animated.timing(stillOpacity, {
        toValue: showVideo ? 0 : 1,
        duration: showVideo ? STILL_TO_VIDEO_FADE_MS : VIDEO_TO_STILL_FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(videoOpacity, {
        toValue: showVideo ? 1 : 0,
        duration: showVideo ? STILL_TO_VIDEO_FADE_MS : VIDEO_TO_STILL_FADE_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [videoSource, videoFirstFrameSeen, videoPlaybackFailed, stillOpacity, videoOpacity]);

  const sharedVideoPlayback = useMemo(
    () => ({
      shouldPlay: true as const,
      isLooping: true as const,
      isMuted: true as const,
      volume: 0 as const,
      useNativeControls: false as const,
      usePoster: false as const,
      pointerEvents: 'none' as const,
      onError: onVideoErr,
      onReadyForDisplay: onVideoReadyForDisplay,
    }),
    [onVideoErr, onVideoReadyForDisplay]
  );

  const innerStill = (
    <Image
      testID={testIDPhoto}
      source={photoUri != null ? { uri: photoUri } : fallbackSource}
      style={StyleSheet.absoluteFillObject}
      resizeMode={photoUri ? contentFit : fallbackContentFit ?? 'contain'}
      {...(photoUri ? { onError: onPhotoError } : {})}
    />
  );

  /**
   * Manual aspect-fill (hero): slot is sized = aspectFill(card, source). Flex centering on the
   * `overflow: hidden` parent handles position, no absolute math needed. Slot aspect == source aspect ⇒
   * `STRETCH` is a uniform scale, defeating AVPlayerLayer's gravity-induced centering bug.
   */
  const videoLayerManualSlot =
    videoSource != null && useManualAspectFillSlot && aspectSlotSize ? (
      <View
        style={{ width: aspectSlotSize.width, height: aspectSlotSize.height }}
        pointerEvents="none"
      >
        <Video
          testID={testIDVideo}
          key={`slot:${aspectSlotSize.width.toFixed(1)}x${aspectSlotSize.height.toFixed(1)}:${playUri}:${canonicalStillUrl ?? ''}`}
          source={videoSource}
          style={styles.fillAbsolute}
          videoStyle={styles.fillAbsolute}
          resizeMode={ResizeMode.STRETCH}
          {...sharedVideoPlayback}
        />
      </View>
    ) : null;

  /** Fallback when not in hero mode (circular/glass): native COVER/CONTAIN. */
  const videoLayerNative =
    videoSource != null && !useManualAspectFillSlot ? (
      <Video
        testID={testIDVideo}
        key={`fs:${playUri}:${canonicalStillUrl ?? ''}`}
        source={videoSource}
        style={styles.fillAbsolute}
        videoStyle={styles.fillAbsolute}
        resizeMode={contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER}
        {...sharedVideoPlayback}
      />
    ) : null;

  const rootStyle: StyleProp<ViewStyle> = [fillParent && StyleSheet.absoluteFillObject, containerStyle];

  return (
    <View
      style={rootStyle}
      pointerEvents="box-none"
      onLayout={useManualAspectFillSlot ? onContainerLayout : undefined}
    >
      {/* Still poster — fades out when video first frame is seen. */}
      <Animated.View
        style={[
          styles.layer,
          mediaStyle as ViewStyle,
          { opacity: stillOpacity, zIndex: 1 },
        ]}
        pointerEvents="none"
      >
        {innerStill}
      </Animated.View>

      {/* Looping video — fades in once the player reports first frame; flex-centered into aspect-fill slot for hero. */}
      {videoSource != null ? (
        <Animated.View
          style={[
            styles.layer,
            mediaStyle as ViewStyle,
            useManualAspectFillSlot && styles.flexCenterClipped,
            { opacity: videoOpacity, zIndex: 2 },
          ]}
          pointerEvents="none"
        >
          {useManualAspectFillSlot ? videoLayerManualSlot : videoLayerNative}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  /** Hero video host: clip overflow + center the aspect-fill slot. */
  flexCenterClipped: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillAbsolute: {
    ...StyleSheet.absoluteFillObject,
  },
});
