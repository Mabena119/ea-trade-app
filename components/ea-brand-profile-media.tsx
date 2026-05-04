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
import type { AVPlaybackStatus } from 'expo-av';
import type { VideoReadyForDisplayEvent } from 'expo-av/build/Video.types';

import { normalizeEaBrandLogoHttpUrl } from '@/utils/ea-brand-image';
import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';

/**
 * EA `admin/uploads/*.mp4` are encoded **9:16 portrait** (verified with ffprobe).
 * On iOS, `AVPlayerLayer.videoGravity = ResizeAspectFill` does NOT always center the
 * source frame the same way `UIView.contentMode = scaleAspectFill` does for the
 * still poster — for some clips the video drifts to one side. To keep the video
 * pixel-aligned with the image cover-fit, we compute the cover-fit rectangle in JS
 * and pin the `<Video>` to it with explicit absolute positioning + neutral resize.
 */
const EA_VIDEO_ASPECT_W = 9;
const EA_VIDEO_ASPECT_H = 16;

const STILL_TO_VIDEO_FADE_MS = 380;
const VIDEO_TO_STILL_FADE_MS = 220;
/**
 * Portrait character logos (still aspect ≤ this) trigger a slight upward focal bias so the
 * robot's head/face is visible even on short hero cards. No zoom — just crop-window shift.
 */
const CHARACTER_STILL_ASPECT_MAX = 0.8;
const CHARACTER_VIDEO_FOCAL_Y = 0.4;

function normalizeImageAspect(width: number, height: number): { w: number; h: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  return { w: width, h: height };
}

function normalizeVideoAspect(width: number, height: number): { w: number; h: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  // EA profile clips are portrait; flip if the runtime reports rotated axes.
  return width > height ? { w: height, h: width } : { w: width, h: height };
}

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
 * Pixel-precise cover-fit rectangle for `aw × ah` source rendered inside `boxW × boxH`.
 * Mirrors `UIView.contentMode = scaleAspectFill`: scale to fill, center-anchored crop.
 */
function aspectFillRect(
  boxW: number,
  boxH: number,
  aw: number,
  ah: number,
  opts?: { focalX?: number; focalY?: number; zoom?: number }
): { left: number; top: number; width: number; height: number } | null {
  if (!(boxW > 0) || !(boxH > 0) || !(aw > 0) || !(ah > 0)) return null;
  const zoom = Math.max(1, opts?.zoom ?? 1);
  const focalX = Math.min(1, Math.max(0, opts?.focalX ?? 0.5));
  const focalY = Math.min(1, Math.max(0, opts?.focalY ?? 0.5));
  const scale = Math.max(boxW / aw, boxH / ah) * zoom;
  const width = aw * scale;
  const height = ah * scale;
  const minLeft = boxW - width;
  const minTop = boxH - height;
  const left = Math.min(0, Math.max(minLeft, boxW / 2 - width * focalX));
  const top = Math.min(0, Math.max(minTop, boxH / 2 - height * focalY));
  return {
    width,
    height,
    left,
    top,
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
  const resolvedContentFit: ContentFit = contentFit;
  const resolvedFallbackFit: ContentFit = fallbackContentFit ?? 'contain';

  const canonicalStillUrl = useMemo(() => normalizeEaBrandLogoHttpUrl(brandImageUrl), [brandImageUrl]);
  const remoteMp4 = useMemo(() => deriveEALogoMp4Url(canonicalStillUrl), [canonicalStillUrl]);
  const imageStem = useMemo(() => deriveEaBrandImageStemFromUrl(canonicalStillUrl), [canonicalStillUrl]);

  const [playUri, setPlayUri] = useState<string | null>(null);
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);
  /** True after `onLoad` / `onReadyForDisplay` fires — triggers crossfade to video layer. */
  const [videoFirstFrameSeen, setVideoFirstFrameSeen] = useState(false);
  const [stillAspect, setStillAspect] = useState<{ w: number; h: number } | null>(null);
  const [videoAspect, setVideoAspect] = useState<{ w: number; h: number }>({
    w: EA_VIDEO_ASPECT_W,
    h: EA_VIDEO_ASPECT_H,
  });

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
    setStillAspect(null);
    setVideoAspect({ w: EA_VIDEO_ASPECT_W, h: EA_VIDEO_ASPECT_H });

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

  /** Hero (`fillParent` + `cover`) → manual cover-fit rect; circles/glass keep native gravity. */
  const useManualCoverRect = fillParent && resolvedContentFit === 'cover';

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

  /** Reveal the video layer once the player reports it can paint a first frame. */
  const onVideoReadyForDisplay = useCallback((evt: VideoReadyForDisplayEvent | undefined) => {
    const naturalSize = (evt as Partial<VideoReadyForDisplayEvent> | undefined)?.naturalSize;
    const aspect = normalizeVideoAspect(naturalSize?.width ?? 0, naturalSize?.height ?? 0);
    if (aspect) setVideoAspect(aspect);
    setVideoFirstFrameSeen(true);
  }, []);

  /**
   * `onLoad` fires once per loaded source even if `onReadyForDisplay` doesn't,
   * so it doubles as a "video is renderable" trigger to complete the crossfade.
   */
  const onVideoLoad = useCallback((status: AVPlaybackStatus) => {
    if (!status?.isLoaded) return;
    const loaded = status as AVPlaybackStatus & {
      naturalSize?: { width?: number; height?: number };
    };
    const aspect = normalizeVideoAspect(
      loaded.naturalSize?.width ?? 0,
      loaded.naturalSize?.height ?? 0
    );
    if (aspect) setVideoAspect(aspect);
    setVideoFirstFrameSeen(true);
  }, []);

  const photoUri = !photoUnavailable && canonicalStillUrl ? canonicalStillUrl : null;

  useEffect(() => {
    if (!photoUri) return;
    let cancelled = false;
    Image.getSize(
      photoUri,
      (w, h) => {
        if (cancelled) return;
        setStillAspect(normalizeImageAspect(w, h));
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [photoUri]);

  const isCharacterStyleMedia =
    stillAspect != null && stillAspect.w / stillAspect.h <= CHARACTER_STILL_ASPECT_MAX;

  /** Pre-computed pixel rect for 9:16 video cover-fill in hero mode. */
  const coverRect = useMemo(
    () =>
      useManualCoverRect && containerBox.width > 0 && containerBox.height > 0
        ? aspectFillRect(
            containerBox.width,
            containerBox.height,
            videoAspect.w,
            videoAspect.h,
            isCharacterStyleMedia
              ? { focalY: CHARACTER_VIDEO_FOCAL_Y }
              : undefined
          )
        : null,
    [
      useManualCoverRect,
      containerBox.width,
      containerBox.height,
      videoAspect.w,
      videoAspect.h,
      isCharacterStyleMedia,
    ]
  );

  const videoSource =
    showVideoLayer && playUri != null ? buildVideoPlaybackSource(playUri) : null;

  /** Hard timeout: even if neither `onReadyForDisplay` nor `onLoad` fires (rare), reveal the video so the user isn't stuck on the still. */
  useEffect(() => {
    if (videoSource == null) return;
    if (videoFirstFrameSeen) return;
    const timer = setTimeout(() => setVideoFirstFrameSeen(true), 1500);
    return () => clearTimeout(timer);
  }, [videoSource, videoFirstFrameSeen]);

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
      onLoad: onVideoLoad,
      onReadyForDisplay: onVideoReadyForDisplay,
    }),
    [onVideoErr, onVideoLoad, onVideoReadyForDisplay]
  );

  const stillResizeMode: ContentFit = photoUri ? resolvedContentFit : resolvedFallbackFit;

  const innerStill = (
    <Image
      testID={testIDPhoto}
      source={photoUri != null ? { uri: photoUri } : fallbackSource}
      style={StyleSheet.absoluteFillObject}
      resizeMode={stillResizeMode}
      {...(photoUri ? { onError: onPhotoError } : {})}
    />
  );

  /**
   * Hero (`fillParent + cover`): pin the `<Video>` inside an explicit absolute rect that
   * mirrors what `<Image resizeMode="cover">` produces for the same container, then use
   * `STRETCH` (uniform scale, since rect aspect == 9:16). This is pixel-identical to
   * the still's positioning and dodges the AVPlayerLayer drift.
   */
  const heroVideoLayer =
    videoSource != null && useManualCoverRect && coverRect ? (
      <View
        style={{
          position: 'absolute',
          left: coverRect.left,
          top: coverRect.top,
          width: coverRect.width,
          height: coverRect.height,
        }}
        pointerEvents="none"
      >
        <Video
          testID={testIDVideo}
          key={`hero:${coverRect.width.toFixed(1)}x${coverRect.height.toFixed(1)}:${playUri}:${canonicalStillUrl ?? ''}`}
          source={videoSource}
          style={StyleSheet.absoluteFillObject}
          videoStyle={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.STRETCH}
          {...sharedVideoPlayback}
        />
      </View>
    ) : null;

  /** Fallback when not in hero mode (circles/glass): native COVER/CONTAIN matches `<Image>`. */
  const nativeVideoLayer =
    videoSource != null && !useManualCoverRect ? (
      <Video
        testID={testIDVideo}
        key={`native:${playUri}:${canonicalStillUrl ?? ''}`}
        source={videoSource}
        style={StyleSheet.absoluteFillObject}
        videoStyle={StyleSheet.absoluteFillObject}
        resizeMode={resolvedContentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER}
        {...sharedVideoPlayback}
      />
    ) : null;

  const rootStyle: StyleProp<ViewStyle> = [fillParent && StyleSheet.absoluteFillObject, containerStyle];

  return (
    <View
      style={rootStyle}
      pointerEvents="box-none"
      onLayout={useManualCoverRect ? onContainerLayout : undefined}
    >
      {/* Still poster — sits underneath, fades out when video first frame is seen. */}
      <Animated.View
        style={[styles.layer, mediaStyle as ViewStyle, { opacity: stillOpacity, zIndex: 1 }]}
        pointerEvents="none"
      >
        {innerStill}
      </Animated.View>

      {/* Looping video — pinned to the same cover rect as the still, fades in when ready. */}
      {videoSource != null ? (
        <Animated.View
          style={[
            styles.layer,
            /**
             * In hero (manual cover-rect) mode the heroVideoLayer is positioned with a negative
             * `top` to implement the upward-biased crop. `overflow: 'hidden'` on this Animated.View
             * causes iOS to clip the entire absolutely-positioned child when it starts outside the
             * parent's bounds, making the video invisible or falling back to native AVPlayerLayer
             * gravity. Setting `overflow: 'visible'` here lets the heroVideoLayer render freely;
             * the ancestor `blackHeroFullBleedMedia` (overflow: hidden) clips to card bounds.
             */
            useManualCoverRect && { overflow: 'visible' },
            mediaStyle as ViewStyle,
            { opacity: videoOpacity, zIndex: 2 },
          ]}
          pointerEvents="none"
        >
          {useManualCoverRect ? heroVideoLayer : nativeVideoLayer}
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
