import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

import { deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (basename used for `.mp4`; still shown under video until frames display).
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

  const videoCandidate = useMemo(
    () => (tryVideo ? deriveEALogoMp4Url(brandImageUrl) : null),
    [brandImageUrl, tryVideo]
  );

  const [nativeVideoFailed, setNativeVideoFailed] = useState(false);

  useEffect(() => {
    setNativeVideoFailed(false);
  }, [videoCandidate, brandImageUrl]);

  useEffect(() => {
    if (__DEV__ && videoCandidate) {
      console.log('[EABrandProfileMedia] looping video URL:', videoCandidate);
    }
  }, [videoCandidate]);

  const resizeModeVideo = contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;

  const onVideoErr = useCallback((msg: string) => {
    console.warn('[EABrandProfileMedia] Video onError:', msg);
    setNativeVideoFailed(true);
  }, []);

  const showVideoLayer = Boolean(videoCandidate && tryVideo && !nativeVideoFailed);
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
        source={{ uri: videoCandidate }}
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
