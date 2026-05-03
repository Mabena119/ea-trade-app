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
/** Fallback aspect for EA uploads like `*.mp4` portrait reels until `naturalSize` is known — only ratio matters for crop math. */
const PORTRAIT_9_16_INTRINSICS = { width: 9, height: 16 };

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

/** Center-cropped “aspect fill” using layout + intrinsic size — works around expo-av `COVER` mis-centering some portrait clips. */
function centeredCoverFrame(
  boxW: number,
  boxH: number,
  naturalW: number,
  naturalH: number
): { left: number; top: number; width: number; height: number } | null {
  if (!(boxW > 0) || !(boxH > 0) || !(naturalW > 0) || !(naturalH > 0)) return null;
  const scale = Math.max(boxW / naturalW, boxH / naturalH);
  const width = naturalW * scale;
  const height = naturalH * scale;
  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round((boxW - width) / 2),
    top: Math.round((boxH - height) / 2),
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

  /** Hero full-bleed: native COVER sometimes crops portrait MP4 toward one edge — we center-crop in JS instead. */
  const useManualCenterCover = fillParent && contentFit === 'cover';

  const [mediaBox, setMediaBox] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  /** From `onReadyForDisplay`; when null we assume portrait 9:16 brand clips so crops are centered immediately. */
  const [confirmedVideoIntrinsics, setConfirmedVideoIntrinsics] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    setConfirmedVideoIntrinsics(null);
  }, [canonicalStillUrl, remoteMp4]);

  /** Prefer confirmed dimensions; EA profile MP4s are expected 9×16 portrait (see uploads naming). */
  const intrinsicsForCrop =
    useManualCenterCover && showVideoLayer
      ? (confirmedVideoIntrinsics ?? PORTRAIT_9_16_INTRINSICS)
      : null;

  const onManualMediaLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setMediaBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    },
    []
  );

  const onVideoReadyForDisplay = useCallback(
    (evt: VideoReadyForDisplayEvent) => {
      const nw = evt.naturalSize.width;
      const nh = evt.naturalSize.height;
      if (nw > 0 && nh > 0) setConfirmedVideoIntrinsics({ width: nw, height: nh });
    },
    []
  );

  const manualCropFrame =
    useManualCenterCover &&
    mediaBox.width > 0 &&
    mediaBox.height > 0 &&
    intrinsicsForCrop != null
      ? centeredCoverFrame(
          mediaBox.width,
          mediaBox.height,
          intrinsicsForCrop.width,
          intrinsicsForCrop.height
        )
      : null;

  const showManualCropVideo =
    useManualCenterCover && manualCropFrame != null && showVideoLayer;

  /** Native fullscreen COVER is skipped for hero-only manual path — it mis-crops portrait assets (right-edge bias). */
  const showDefaultFullscreenVideo = showVideoLayer && !useManualCenterCover;

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
      onReadyForDisplay: useManualCenterCover ? onVideoReadyForDisplay : undefined,
    }),
    [onVideoErr, onVideoReadyForDisplay, useManualCenterCover]
  );

  const videoFullscreenDefault =
    videoSource != null && showDefaultFullscreenVideo ? (
      <Video
        testID={testIDVideo}
        key={`full:${playUri}:${canonicalStillUrl ?? ''}`}
        source={videoSource}
        style={[mediaStyle as ViewStyle, styles.videoOverlay]}
        resizeMode={resizeModeVideo}
        {...sharedVideoPlayback}
      />
    ) : null;

  const videoManualCrop =
    videoSource != null && showManualCropVideo && manualCropFrame ? (
      <View style={[styles.videoOverlay, mediaStyle as ViewStyle]} pointerEvents="none">
        <View
          style={{
            position: 'absolute',
            ...manualCropFrame,
            overflow: 'hidden',
          }}
        >
          <Video
            testID={testIDVideo}
            key={`crop:${manualCropFrame.width}x${manualCropFrame.height}:${playUri}:${canonicalStillUrl ?? ''}`}
            source={videoSource}
            style={styles.manualCropVideoShell}
            videoStyle={styles.manualCropVideoInner}
            resizeMode={ResizeMode.STRETCH}
            {...sharedVideoPlayback}
          />
        </View>
      </View>
    ) : null;

  const rootStyle: StyleProp<ViewStyle> = [fillParent && StyleSheet.absoluteFillObject, containerStyle];

  return (
    <View style={rootStyle} pointerEvents="box-none" onLayout={useManualCenterCover ? onManualMediaLayout : undefined}>
      <View style={[mediaStyle as ViewStyle, styles.stillUnderlay]}>{innerStill}</View>
      {videoFullscreenDefault}
      {videoManualCrop}
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
    zIndex: 2,
    elevation: 2,
  },
  manualCropVideoShell: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  manualCropVideoInner: {
    ...StyleSheet.absoluteFillObject,
  },
});
