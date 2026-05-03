import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio, ResizeMode, Video } from 'expo-av';

import { normalizeEaBrandLogoHttpUrl } from '@/utils/ea-brand-image';
import { ensureEaBrandMp4Cached } from '@/utils/ea-brand-profile-video-cache';
import { deriveEaBrandImageStemFromUrl, deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';

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
   * Prefer `file://` — expo-av + HTTPS range/CDN can be flaky; FileSystem.download uses fallback header sets.
   */
  useEffect(() => {
    setVideoPlaybackFailed(false);

    if (!tryVideo || !canonicalStillUrl || !remoteMp4 || !imageStem) {
      setPlayUri(null);
      return;
    }

    let cancelled = false;

    if (Platform.OS === 'web') {
      setPlayUri(remoteMp4);
      return () => {
        cancelled = true;
      };
    }

    setPlayUri(null);

    void (async () => {
      try {
        const localUri = await ensureEaBrandMp4Cached(remoteMp4, imageStem);
        if (!cancelled) setPlayUri(localUri);
      } catch (e) {
        if (__DEV__) console.warn('[EABrandProfileMedia] cache/download failed — streaming mp4:', e);
        if (!cancelled) setPlayUri(remoteMp4);
      }
    })();

    return () => {
      cancelled = true;
    };
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

  const videoLayer =
    videoSource != null ? (
      <Video
        testID={testIDVideo}
        key={`${playUri}:${canonicalStillUrl ?? ''}`}
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
