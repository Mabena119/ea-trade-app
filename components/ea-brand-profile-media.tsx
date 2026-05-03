import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';

import { buildEaProfileMp4CandidateUrls } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (basename used for `.mp4`; still shown under video until frames display).
   */
  brandImageUrl: string | null;
  /**
   * Fallback mp4 lookups when looping video basename ≠ `owner.logo` (CDN often stores `{robotKey}.mp4`).
   */
  licenseCanonicalKey?: string | null;
  licenseEnteredKey?: string | null;
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
  licenseCanonicalKey = null,
  licenseEnteredKey = null,
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

  const videoCandidates = useMemo(
    () =>
      tryVideo
        ? buildEaProfileMp4CandidateUrls({
            brandImageUrl,
            licenseCanonicalKey,
            licenseEnteredKey,
          })
        : [],
    [brandImageUrl, licenseCanonicalKey, licenseEnteredKey, tryVideo]
  );

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [brandImageUrl, licenseCanonicalKey, licenseEnteredKey, tryVideo]);

  useEffect(() => {
    if (__DEV__ && videoCandidates.length) {
      console.log('[EABrandProfileMedia] mp4 candidates:', videoCandidates, 'trying index:', candidateIndex);
    }
  }, [videoCandidates, candidateIndex]);

  const videoCandidatesRef = useRef(videoCandidates);
  videoCandidatesRef.current = videoCandidates;

  const advanceOrExhaustCandidates = useCallback(() => {
    setCandidateIndex((i) => {
      if (videoCandidatesRef.current.length === 0) return 0;
      const next = i + 1;
      const len = videoCandidatesRef.current.length;
      if (__DEV__ && next < len) {
        console.warn('[EABrandProfileMedia] mp4 load failed — trying:', videoCandidatesRef.current[next]);
      } else if (__DEV__ && next >= len) {
        console.warn('[EABrandProfileMedia] all mp4 candidates failed.');
      }
      return next >= len ? len : next;
    });
  }, []);

  /** Prevent double-advance when expo-av reports the same fatal load via multiple callbacks. */
  const bumpedForMp4Uri = useRef<string | null>(null);
  const candidateIndexRef = useRef(0);
  candidateIndexRef.current = candidateIndex;

  const videoCandidate = videoCandidates[candidateIndex] ?? null;

  useEffect(() => {
    bumpedForMp4Uri.current = null;
  }, [videoCandidate]);

  const reportMp4LoadFailedOnce = useCallback(() => {
    const idx = candidateIndexRef.current;
    const uri = videoCandidatesRef.current[idx];
    if (!uri) return;
    if (bumpedForMp4Uri.current === uri) return;
    bumpedForMp4Uri.current = uri;
    advanceOrExhaustCandidates();
  }, [advanceOrExhaustCandidates]);

  const onVideoErr = useCallback(
    (msg: string) => {
      console.warn('[EABrandProfileMedia] Video onError:', msg);
      reportMp4LoadFailedOnce();
    },
    [reportMp4LoadFailedOnce]
  );

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if ('isLoaded' in status && !status.isLoaded && status.error) {
        if (__DEV__) {
          console.warn('[EABrandProfileMedia] Video playback status error:', status.error);
        }
        reportMp4LoadFailedOnce();
      }
    },
    [reportMp4LoadFailedOnce]
  );

  const resizeModeVideo = contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;

  const showVideoLayer = Boolean(
    videoCandidate && tryVideo && videoCandidates.length > 0 && candidateIndex < videoCandidates.length
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
    showVideoLayer && videoCandidate ? (
      <Video
        testID={testIDVideo}
        key={videoCandidate}
        source={{ uri: videoCandidate, overrideFileExtensionAndroid: 'mp4' }}
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
