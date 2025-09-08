import React from 'react';
import { View, StyleSheet } from 'react-native';

interface RobotLogoProps {
  size?: number;
}

export function RobotLogo({ size = 80 }: RobotLogoProps) {
  const logoSize = size;
  const faceSize = logoSize * 0.7;
  const eyeSize = logoSize * 0.08;
  const hatHeight = logoSize * 0.25;

  return (
    <View style={[styles.container, { width: logoSize, height: logoSize }]}>
      {/* Red Hat/Cap */}
      <View style={[
        styles.hat,
        {
          width: logoSize,
          height: hatHeight,
          borderRadius: logoSize / 2,
        }
      ]} />
      
      {/* Robot Face */}
      <View style={[
        styles.face,
        {
          width: faceSize,
          height: faceSize,
          borderRadius: faceSize / 2,
          marginTop: -hatHeight * 0.3,
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
    justifyContent: 'flex-start',
  },
  hat: {
    backgroundColor: '#DC2626',
  },
  face: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  eyesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '50%',
  },
  eye: {
    backgroundColor: '#FFFFFF',
  },
});