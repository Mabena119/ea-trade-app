import React, { useCallback } from 'react';
import { Pressable, Platform, StyleProp, ViewStyle, TextStyle } from 'react-native';

interface WebButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * WebButton - A button component that works correctly in React Native Web static exports
 * 
 * The issue with React Native Web static exports is that the synthetic event system
 * doesn't properly initialize, causing onPress handlers to not fire. This component
 * uses native web events (onClick, onPointerDown) as fallbacks to ensure clicks work.
 */
export function WebButton({ 
  onPress, 
  children, 
  style, 
  disabled = false,
  testID,
  accessibilityLabel 
}: WebButtonProps) {
  const handlePress = useCallback(() => {
    if (!disabled) {
      console.log('[WebButton] Button pressed');
      onPress();
    }
  }, [onPress, disabled]);

  // For web, we need to use native DOM events to ensure clicks work in static exports
  const webClickHandler = useCallback((e: any) => {
    if (!disabled) {
      console.log('[WebButton] Web click handler triggered');
      e?.preventDefault?.();
      e?.stopPropagation?.();
      handlePress();
    }
  }, [handlePress, disabled]);

  return (
    <Pressable
      onPress={handlePress}
      style={style}
      disabled={disabled}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      role="button"
      // @ts-ignore - Web-specific props for static export compatibility
      onClick={Platform.OS === 'web' ? webClickHandler : undefined}
      onPointerDown={Platform.OS === 'web' ? webClickHandler : undefined}
      onTouchStart={Platform.OS === 'web' ? webClickHandler : undefined}
    >
      {children}
    </Pressable>
  );
}

