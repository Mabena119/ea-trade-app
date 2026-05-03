import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

import { EA_BRAND_CDN_HEADERS, normalizeEaBrandLogoHttpUrl } from '@/utils/ea-brand-image';
import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

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

  /** Remote stream first; avoids blocking UI on disk download when CDN is reachable. */
  useEffect(() => {
    setVideoPlaybackFailed(false);

    if (!tryVideo || !canonicalStillUrl || !remoteMp4 || !imageStem) {
      setPlayUri(null);
      return;
    }

    setPlayUri(remoteMp4);

    if (Platform.OS !== 'web') {
      void ensureEaBrandMp4Cached(remoteMp4, imageStem).catch(() => {
        /** Warm cache silently; playback uses HTTPS until retry path fires. */
      });
    }
  }, [tryVideo, canonicalStillUrl, remoteMp4, imageStem]);

  useEffect(() => {
    if (__DEV__ && tryVideo && canonicalStillUrl && remoteMp4) {
      console.log('[EABrandProfileMedia] still:', canonicalStillUrl, '| mp4:', remoteMp4, '| stem:', imageStem);
    }
  }, [tryVideo, canonicalStillUrl, remoteMp4, imageStem]);

  const playbackFailOnce = useRef<string | null>(null);
  const recoveringLocalRef = useRef(false);

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

  /** After remote HTTPS fails once, retry from on-device cache download (CDN often matches Image but blocks bare clients without Referer). */
  const retryFromDiskCacheOnce = useCallback(async () => {
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
      const localUri = await ensureEaBrandMp4Cached(remoteMp4, imageStem);
      setVideoPlaybackFailed(false);
      playbackFailOnce.current = null;
      setPlayUri(localUri);
    } catch (e) {
      if (__DEV__) console.warn('[EABrandProfileMedia] Local mp4 fallback failed:', e);
      bailPlayback();
    } finally {
      recoveringLocalRef.current = false;
    }
  }, [remoteMp4, imageStem, bailPlayback]);

  const onVideoErr = useCallback(
    (msg: string) => {
      console.warn('[EABrandProfileMedia] Video onError:', msg);
      if (recoveringLocalRef.current) return;

      const u = playUriLatestRef.current;
      if (!u) return;

      if (u.startsWith('file')) {
        bailPlayback();
        return;
      }

      void retryFromDiskCacheOnce();
    },
    [retryFromDiskCacheOnce, bailPlayback]
  );

  const resizeModeVideo = contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;

  const showVideoLayer = Boolean(playUri && tryVideo && !videoPlaybackFailed && remoteMp4 && imageStem);

  const photoUri = !photoUnavailable && canonicalStillUrl ? canonicalStillUrl : null;

  const videoSource =
    playUri != null
      ? Platform.OS !== 'web'
        ? ({ uri: playUri, headers: EA_BRAND_CDN_HEADERS, overrideFileExtensionAndroid: 'mp4' } as const)
        : ({ uri: playUri, overrideFileExtensionAndroid: 'mp4' } as const)
      : null;

  const innerStill = (
    <Image
      testID={testIDPhoto}
      source={photoUri != null ? { uri: photoUri } : fallbackSource}
      style={StyleSheet.absoluteFillObject}
      resizeMode={photoUri ? contentFit : fallbackContentFit ?? 'contain'}
      {...(photoUri ? { onError: onPhotoError } : {})}
    />
  );

  const videoLayer =
    showVideoLayer && videoSource ? (
      <Video
        testID={testIDVideo}
        key={playUri}
        source={videoSource}
        style={[mediaStyle as ViewStyle, styles.videoOverlay]}
        resizeMode={resizeModeVideo}
        shouldPlay
        isLooping
        isMuted
        volume={0}
        useNativeControls={false}
        usePoster={false}
        pointerEvents="none"
        onError={onVideoErr}
      />
    ) : null;

  const rootStyle: StyleProp<ViewStyle> = [fillParent && StyleSheet.absoluteFillObject, containerStyle];

  return (
    <View style={rootStyle} pointerEvents="box-none">
      <View style={[mediaStyle as ViewStyle, styles.stillUnderlay]}>{innerStill}</View>
      {videoLayer}
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
});
