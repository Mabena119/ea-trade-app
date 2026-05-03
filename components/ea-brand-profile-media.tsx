import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

import { deriveEALogoMp4Url } from '@/utils/ea-logo-video-url';

type ContentFit = 'cover' | 'contain';

export type EABrandProfileMediaProps = {
  /**
   * Resolved profile image URL (used for basename → `.mp4` and normally shown when video is absent).
   * When `photoUnavailable` is true (bitmap load error), photo is skipped but video URL is still derived from this string.
   */
  brandImageUrl: string | null;
  photoUnavailable?: boolean;
  /** If false (e.g. web), only the photo/still is used */
  preferLoopingVideo?: boolean;
  contentFit?: ContentFit;
  /** Applied to bundled fallback image only (often `contain` in circles). */
  fallbackContentFit?: ContentFit;
  containerStyle?: StyleProp<ViewStyle>;
  mediaStyle: StyleProp<ViewStyle>;
  /** Photo load error (fallback still); ignored when showing video successfully */
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

  const onVideoErr = useCallback(() => setNativeVideoFailed(true), []);

  const showVideoLayer = Boolean(videoCandidate && tryVideo && !nativeVideoFailed);

  const photoUri = !photoUnavailable && brandImageUrl ? brandImageUrl : null;

  const inner = showVideoLayer ? (
    <Video
      testID={testIDVideo}
      key={videoCandidate ?? undefined}
      source={{ uri: videoCandidate ?? undefined }}
      style={mediaStyle}
      resizeMode={resizeModeVideo}
      shouldPlay
      isLooping
      isMuted
      volume={0}
      useNativeControls={false}
      pointerEvents="none"
      onError={onVideoErr}
    />
  ) : photoUri ? (
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

  return <View style={containerStyle}>{inner}</View>;
}
