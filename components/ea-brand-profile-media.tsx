import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
 * so we render the layer at this **fixed aspect** and place it ourselves (center-crop).
 */
const EA_VIDEO_ASPECT_W = 9;
const EA_VIDEO_ASPECT_H = 16;

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

/** Aspect-fill slot: scaled (`aw×ah`) box that fully covers (`boxW×boxH`), centered. Fractional layout — no rounding drift. */
function aspectFillSlot(
  boxW: number,
  boxH: number,
  aw: number,
  ah: number
): { left: number; top: number; width: number; height: number } | null {
  if (!(boxW > 0) || !(boxH > 0) || !(aw > 0) || !(ah > 0)) return null;
  const scale = Math.max(boxW / aw, boxH / ah);
  const width = aw * scale;
  const height = ah * scale;
  return {
    width,
    height,
    left: (boxW - width) / 2,
    top: (boxH - height) / 2,
  };
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

  /**
   * Stream HTTPS `.mp4` immediately (best first-frame latency). Warm disk cache in parallel —
   * `onError` repair path + next session can use `file://` without waiting on a full download first.
   */
  useEffect(() => {
    setVideoPlaybackFailed(false);

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

  const resizeModeVideo = contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;

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

  /** Default to known EA aspect; refine if `naturalSize` reports a portrait shape that disagrees. */
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
    if (!(nw > 0) || !(nh > 0)) return;
    /** Source is portrait when the encoded shape is taller than wide; landscape encodings stay as-is so non-EA usages still work. */
    setRefinedAspect({ w: nw, h: nh });
  }, []);

  const aspectSlot =
    useManualAspectFillSlot && containerBox.width > 0 && containerBox.height > 0
      ? aspectFillSlot(containerBox.width, containerBox.height, refinedAspect.w, refinedAspect.h)
      : null;

  const showManualSlotVideo = useManualAspectFillSlot && aspectSlot != null && showVideoLayer;
  const showNativeFullscreenVideo = showVideoLayer && !useManualAspectFillSlot;

  const photoUri = !photoUnavailable && canonicalStillUrl ? canonicalStillUrl : null;

  const videoSource =
    showVideoLayer && playUri != null ? buildVideoPlaybackSource(playUri) : null;

  const innerStill = (
    <Image
      testID={testIDPhoto}
      source={photoUri != null ? { uri: photoUri } : fallbackSource}
      style={StyleSheet.absoluteFillObject}
      resizeMode={photoUri ? contentFit : fallbackContentFit ?? 'contain'}
      {...(photoUri ? { onError: onPhotoError } : {})}
    />
  );

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
      onReadyForDisplay: useManualAspectFillSlot ? onVideoReadyForDisplay : undefined,
    }),
    [onVideoErr, onVideoReadyForDisplay, useManualAspectFillSlot]
  );

  const videoNativeFullscreen =
    videoSource != null && showNativeFullscreenVideo ? (
      <Video
        testID={testIDVideo}
        key={`fs:${playUri}:${canonicalStillUrl ?? ''}`}
        source={videoSource}
        style={[mediaStyle as ViewStyle, styles.videoOverlay]}
        resizeMode={resizeModeVideo}
        {...sharedVideoPlayback}
      />
    ) : null;

  /**
   * Manual aspect-fill: pre-size the slot to match the source aspect (`refinedAspect`) at scale=max(card),
   * then `STRETCH` the player into that slot. Because slot aspect == source aspect, stretch == uniform scale
   * (no distortion) and AVPlayerLayer cannot shift the image off-center.
   */
  const videoManualSlot =
    videoSource != null && showManualSlotVideo && aspectSlot ? (
      <View style={[styles.videoOverlay, mediaStyle as ViewStyle]} pointerEvents="none">
        <View
          style={[
            styles.videoSlotShell,
            {
              left: aspectSlot.left,
              top: aspectSlot.top,
              width: aspectSlot.width,
              height: aspectSlot.height,
            },
          ]}
        >
          <Video
            testID={testIDVideo}
            key={`slot:${aspectSlot.width.toFixed(1)}x${aspectSlot.height.toFixed(1)}:${playUri}:${canonicalStillUrl ?? ''}`}
            source={videoSource}
            style={styles.videoSlotInnerShell}
            videoStyle={styles.videoSlotInnerShell}
            resizeMode={ResizeMode.STRETCH}
            {...sharedVideoPlayback}
          />
        </View>
      </View>
    ) : null;

  const rootStyle: StyleProp<ViewStyle> = [fillParent && StyleSheet.absoluteFillObject, containerStyle];

  return (
    <View
      style={rootStyle}
      pointerEvents="box-none"
      onLayout={useManualAspectFillSlot ? onContainerLayout : undefined}
    >
      <View style={[mediaStyle as ViewStyle, styles.stillUnderlay]}>{innerStill}</View>
      {videoNativeFullscreen}
      {videoManualSlot}
    </View>
  );
}

const styles = StyleSheet.create({
  stillUnderlay: {
    zIndex: 0,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    zIndex: 2,
    elevation: 2,
  },
  videoSlotShell: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  videoSlotInnerShell: {
    ...StyleSheet.absoluteFillObject,
  },
});
