import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Text, TouchableOpacity, Alert } from 'react-native';

interface ManualWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const ManualWebView: React.FC<ManualWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Manual WebView iframe loaded');
      setIsLoaded(true);
      
      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      // Handle messages from the iframe
      if (event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Manual WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing manual iframe message:', error);
        }
      }
    };

    iframe.addEventListener('load', handleLoad);
    window.addEventListener('message', handleMessage);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      window.removeEventListener('message', handleMessage);
    };
  }, [url, script, onMessage, onLoadEnd]);

  const copyScriptToClipboard = () => {
    if (script && Platform.OS === 'web') {
      navigator.clipboard.writeText(script).then(() => {
        Alert.alert('Success', 'Script copied to clipboard!');
      }).catch(() => {
        Alert.alert('Error', 'Failed to copy script to clipboard');
      });
    }
  };

  const hideInstructions = () => {
    setShowInstructions(false);
  };

  return (
    <View style={[styles.container, style]}>
      {showInstructions && (
        <View style={styles.instructionsContainer}>
          <View style={styles.instructionsHeader}>
            <Text style={styles.instructionsTitle}>Authentication Required</Text>
            <TouchableOpacity onPress={hideInstructions} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.instructionsText}>
            Due to browser security restrictions, automatic authentication is not possible. 
            Please follow these steps:
          </Text>
          
          <View style={styles.stepsContainer}>
            <Text style={styles.stepText}>1. Wait for the terminal to load completely</Text>
            <Text style={styles.stepText}>2. Open browser developer tools (F12)</Text>
            <Text style={styles.stepText}>3. Go to the Console tab</Text>
            <Text style={styles.stepText}>4. Copy and paste the script below</Text>
            <Text style={styles.stepText}>5. Press Enter to execute</Text>
          </View>
          
          <View style={styles.scriptContainer}>
            <Text style={styles.scriptLabel}>Authentication Script:</Text>
            <View style={styles.scriptBox}>
              <Text style={styles.scriptText} selectable>
                {script || 'No script available'}
              </Text>
            </View>
            <TouchableOpacity onPress={copyScriptToClipboard} style={styles.copyButton}>
              <Text style={styles.copyButtonText}>Copy Script</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      <iframe
        ref={iframeRef}
        src={url}
        style={[styles.iframe, showInstructions && styles.iframeWithInstructions]}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals"
        allow="payment *; clipboard-write; camera; microphone; geolocation"
        referrerPolicy="strict-origin-when-cross-origin"
        title="Terminal WebView"
        loading="eager"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  instructionsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    padding: 20,
    zIndex: 1000,
    maxHeight: '60%',
  },
  instructionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  instructionsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#ff4444',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructionsText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 15,
    lineHeight: 20,
  },
  stepsContainer: {
    marginBottom: 20,
  },
  stepText: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 5,
    paddingLeft: 10,
  },
  scriptContainer: {
    marginBottom: 10,
  },
  scriptLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  scriptBox: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    maxHeight: 150,
  },
  scriptText: {
    color: '#00ff00',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
  copyButton: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  iframeWithInstructions: {
    height: '40%',
    marginTop: '60%',
  },
});

export default ManualWebView;
