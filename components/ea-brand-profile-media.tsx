import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';

import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (`owner.logo`): looping video URL is identical path with `.mp4`
   * (basename e.g. `FFE-A60-B6C-83A`).
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

  const remoteMp4 = useMemo(() => deriveEALogoMp4Url(brandImageUrl), [brandImageUrl]);
  const imageStem = useMemo(() => deriveEaBrandImageStemFromUrl(brandImageUrl), [brandImageUrl]);

  const [playUri, setPlayUri] = useState<string | null>(null);
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);

  /** Increment to ignore stale downloads when `brandImageUrl` changes mid-flight. */
  const fetchGen = useRef(0);

  useEffect(() => {
    fetchGen.current += 1;
    const gen = fetchGen.current;
    setVideoPlaybackFailed(false);

    if (!tryVideo || !remoteMp4 || !imageStem) {
      setPlayUri(null);
      return;
    }

    /** Native: fetch & cache `{stem}.mp4` beside logo; web: unchanged (streaming only if opted in). */
    if (Platform.OS === 'web') {
      setPlayUri(remoteMp4);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const local = await ensureEaBrandMp4Cached(remoteMp4, imageStem);
        if (cancelled || gen !== fetchGen.current) return;
        setPlayUri(local);
      } catch (e) {
        if (__DEV__) console.warn('[EABrandProfileMedia] mp4 fetch/cache:', e);
        if (cancelled || gen !== fetchGen.current) return;
        setPlayUri(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tryVideo, remoteMp4, imageStem]);

  useEffect(() => {
    if (__DEV__ && tryVideo && remoteMp4 && imageStem) {
      console.log('[EABrandProfileMedia] logo stem:', imageStem, 'remote mp4:', remoteMp4);
    }
  }, [tryVideo, remoteMp4, imageStem]);

  const playbackFailOnce = useRef<string | null>(null);

  useEffect(() => {
    playbackFailOnce.current = null;
  }, [playUri]);

  const bailPlayback = useCallback(() => {
    if (!playUri || playbackFailOnce.current === playUri) return;
    playbackFailOnce.current = playUri;
    setVideoPlaybackFailed(true);
    if (__DEV__) console.warn('[EABrandProfileMedia] Playback failed — using still image:', playUri);
  }, [playUri]);

  const onVideoErr = useCallback(
    (msg: string) => {
      console.warn('[EABrandProfileMedia] Video onError:', msg);
      bailPlayback();
    },
    [bailPlayback]
  );

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if ('isLoaded' in status && !status.isLoaded && status.error) {
        bailPlayback();
      }
    },
    [bailPlayback]
  );

  const resizeModeVideo = contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;

  const showVideoLayer = Boolean(
    playUri && tryVideo && !videoPlaybackFailed && !!(remoteMp4 && imageStem)
  );
  const photoUri = !photoUnavailable && brandImageUrl ? brandImageUrl : null;

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
    showVideoLayer && playUri ? (
      <Video
        testID={testIDVideo}
        key={playUri}
        source={{ uri: playUri, overrideFileExtensionAndroid: 'mp4' }}
        style={[mediaStyle as ViewStyle, styles.videoOverlay]}
        resizeMode={resizeModeVideo}
        shouldPlay
        isLooping
        isMuted
        volume={0}
        useNativeControls={false}
        /** Do not combine with our own stacked PNG — expo poster can stall / mask the Surface on some OS builds. */
        usePoster={false}
        pointerEvents="none"
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
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
