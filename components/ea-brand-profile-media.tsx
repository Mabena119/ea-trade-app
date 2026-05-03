import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import type { AVPlaybackStatus } from 'expo-av';
import { ResizeMode, Video } from 'expo-av';

import { deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (basename used for `.mp4`; still shown under / behind video).
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

function isFatalPlaybackFailure(status: AVPlaybackStatus): boolean {
  return !status.isLoaded && typeof status.error === 'string' && status.error.length > 0;
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

  const videoCandidate = useMemo(
    () => (tryVideo ? deriveEALogoMp4Url(brandImageUrl) : null),
    [brandImageUrl, tryVideo]
  );

  const [nativeVideoFailed, setNativeVideoFailed] = useState(false);

  useEffect(() => {
    setNativeVideoFailed(false);
  }, [videoCandidate, brandImageUrl]);

  const resizeModeVideo = contentFit === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;

  const onVideoErr = useCallback((msg: string) => {
    console.warn('[EABrandProfileMedia] video error:', msg);
    setNativeVideoFailed(true);
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (isFatalPlaybackFailure(status)) {
      setNativeVideoFailed(true);
    }
  }, []);

  const showVideoLayer = Boolean(videoCandidate && tryVideo && !nativeVideoFailed);
  const photoUri = !photoUnavailable && brandImageUrl ? brandImageUrl : null;

  const stillLayer =
    photoUri != null ? (
      <Image
        testID={testIDPhoto}
        source={{ uri: photoUri }}
        style={mediaStyle}
        resizeMode={contentFit}
        onError={onPhotoError}
      />
    ) : (
      <Image
        testID={testIDPhoto}
        source={fallbackSource}
        style={mediaStyle}
        resizeMode={fallbackContentFit ?? 'contain'}
      />
    );

  const videoLayer =
    showVideoLayer && videoCandidate ? (
      <Video
        testID={testIDVideo}
        key={videoCandidate}
        source={{ uri: videoCandidate }}
        style={[mediaStyle, styles.videoOverlay]}
        resizeMode={resizeModeVideo}
        shouldPlay
        isLooping
        isMuted
        volume={0}
        useNativeControls={false}
        pointerEvents="none"
        onError={onVideoErr}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        {...(photoUri
          ? {
              usePoster: true,
              posterSource: { uri: photoUri },
              posterStyle: StyleSheet.absoluteFillObject,
            }
          : {})}
      />
    ) : null;

  const rootStyle: StyleProp<ViewStyle> = [fillParent && StyleSheet.absoluteFillObject, containerStyle];

  return (
    <View style={rootStyle} pointerEvents="box-none">
      {stillLayer}
      {videoLayer}
    </View>
  );
}

const styles = StyleSheet.create({
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
  },
});
