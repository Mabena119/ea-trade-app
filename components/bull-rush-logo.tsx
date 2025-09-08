import React from 'react';
import { View, StyleSheet } from 'react-native';

interface BullRushLogoProps {
  size?: number;
}

export function BullRushLogo({ size = 200 }: BullRushLogoProps) {
  const logoSize = size;
  const faceSize = logoSize * 0.6;
  const eyeSize = logoSize * 0.04;

  return (
    <View style={[styles.container, { width: logoSize, height: logoSize }]}>
      {/* Red Glow Effect */}
      <View style={[
        styles.glow,
        {
          width: logoSize,
          height: logoSize,
          borderRadius: logoSize / 2,
        }
      ]} />
      
      {/* Main Robot Face */}
      <View style={[
        styles.face,
        {
          width: faceSize,
          height: faceSize,
          borderRadius: faceSize / 2,
        }
      ]}>
        {/* Eyes */}
        <View style={styles.eyesContainer}>
          <View style={[
            styles.eye,
            {
              width: eyeSize,
              height: eyeSize,
              borderRadius: eyeSize / 2,
            }
          ]} />
          <View style={[
            styles.eye,
            {
              width: eyeSize,
              height: eyeSize,
              borderRadius: eyeSize / 2,
            }
          ]} />
        </View>
      </View>
      

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    backgroundColor: 'rgba(220, 38, 38, 0.3)',
    position: 'absolute',
  },
  face: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    position: 'relative',
    zIndex: 1,
  },
  eyesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '40%',
  },
  eye: {
    backgroundColor: '#FFFFFF',
  },

});