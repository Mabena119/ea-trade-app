import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Scan, Upload, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useTheme } from '@/providers/theme-provider';
import { apiService, type ChartAnalysisResult } from '@/services/api';

export default function AIScannerScreen() {
  const { theme } = useTheme();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ChartAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => router.back();

  // Resize and compress to keep payload small (avoids Render 502 with large requests)
  const compressForAnalysis = async (
    uri: string,
    existingBase64: string | undefined,
    existingMime: string | undefined
  ): Promise<{ uri: string; base64: string | null; mimeType: string }> => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return {
        uri: manipulated.uri,
        base64: manipulated.base64 ?? existingBase64 ?? null,
        mimeType: 'image/jpeg',
      };
    } catch {
      return {
        uri,
        base64: existingBase64 ?? null,
        mimeType: existingMime || 'image/jpeg',
      };
    }
  };

  const pickImage = async () => {
    setError(null);
    setResult(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload charts.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    const { uri, base64, mimeType } = await compressForAnalysis(asset.uri, asset.base64, asset.mimeType);
    setImageUri(uri);
    setImageBase64(base64);
    setMimeType(mimeType || 'image/jpeg');
  };

  const takePhoto = async () => {
    setError(null);
    setResult(null);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take a chart photo.');
      return;
    }
    const pickerResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets[0];
    const { uri, base64, mimeType } = await compressForAnalysis(asset.uri, asset.base64, asset.mimeType);
    setImageUri(uri);
    setImageBase64(base64);
    setMimeType(mimeType || 'image/jpeg');
  };

  const analyzeChart = async () => {
    if (!imageBase64) {
      setError('Please upload a chart image first.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiService.analyzeChart(imageBase64, mimeType);
      if (response.message === 'accept' && response.data) {
        setResult(response.data);
      } else {
        setError(response.error || 'Analysis failed. Please try again.');
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const clearImage = () => {
    setImageUri(null);
    setImageBase64(null);
    setResult(null);
    setError(null);
  };

  const SignalIcon = result?.signal === 'BUY' ? TrendingUp : result?.signal === 'SELL' ? TrendingDown : Minus;
  const signalColor =
    result?.signal === 'BUY'
      ? theme.colors.success
      : result?.signal === 'SELL'
        ? theme.colors.error
        : theme.colors.warning;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={60} tint={theme.isDark ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
          )}
          <ArrowLeft color={theme.colors.textPrimary} size={22} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>AI SCANNER</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
            Upload a chart for AI analysis
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Upload area */}
        <TouchableOpacity
          style={[styles.uploadCard, { borderColor: theme.colors.borderColor }]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={theme.colors.cardGradient as [string, string, ...string[]]}
            style={styles.uploadGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          {imageUri ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
              <TouchableOpacity style={styles.clearButton} onPress={clearImage} activeOpacity={0.8}>
                <Text style={styles.clearButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Upload color={theme.colors.textMuted} size={48} strokeWidth={2} />
              <Text style={[styles.uploadText, { color: theme.colors.textPrimary }]}>
                Tap to upload chart
              </Text>
              <Text style={[styles.uploadHint, { color: theme.colors.textMuted }]}>
                Screenshot from MetaTrader or any trading platform
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Camera option */}
        {!imageUri && (
          <TouchableOpacity
            style={[styles.cameraButton, { borderColor: theme.colors.borderColor }]}
            onPress={takePhoto}
            activeOpacity={0.7}
          >
            <Scan color={theme.colors.accent} size={22} strokeWidth={2} />
            <Text style={[styles.cameraButtonText, { color: theme.colors.textPrimary }]}>
              Take photo of chart
            </Text>
          </TouchableOpacity>
        )}

        {/* Analyze button */}
        {imageUri && (
          <TouchableOpacity
            style={[styles.analyzeButton, { backgroundColor: theme.colors.accent }]}
            onPress={analyzeChart}
            disabled={analyzing}
            activeOpacity={0.8}
          >
            {analyzing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Scan color="#FFFFFF" size={22} strokeWidth={2.5} />
                <Text style={styles.analyzeButtonText}>Analyze Chart</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.resultCard, styles.errorCard, { borderColor: theme.colors.error }]}>
            <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Result */}
        {result && (
          <View style={[styles.resultCard, { borderColor: signalColor }]}>
            <LinearGradient
              colors={theme.colors.cardGradient as [string, string, ...string[]]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.signalHeader}>
              <SignalIcon color={signalColor} size={32} strokeWidth={2.5} />
              <View>
                <Text style={[styles.signalLabel, { color: theme.colors.textMuted }]}>RECOMMENDATION</Text>
                <Text style={[styles.signalValue, { color: signalColor }]}>{result.signal}</Text>
              </View>
              <View style={[styles.confidenceBadge, { backgroundColor: `${signalColor}33` }]}>
                <Text style={[styles.confidenceText, { color: signalColor }]}>
                  {result.confidence} confidence
                </Text>
              </View>
            </View>
            <Text style={[styles.summaryText, { color: theme.colors.textPrimary }]}>{result.summary}</Text>
            <Text style={[styles.reasoningLabel, { color: theme.colors.textMuted }]}>Analysis</Text>
            <Text style={[styles.reasoningText, { color: theme.colors.textSecondary }]}>
              {result.reasoning}
            </Text>
            <Text style={[styles.suggestionLabel, { color: theme.colors.textMuted }]}>Suggestion</Text>
            <Text style={[styles.suggestionText, { color: theme.colors.textPrimary }]}>
              {result.suggestion}
            </Text>

            {(result.entryPrice || result.stopLoss || result.takeProfit1) && (
              <View style={styles.tradeLevels}>
                <Text style={[styles.tradeLevelsTitle, { color: theme.colors.textMuted }]}>TRADE LEVELS</Text>
                {result.entryPrice ? (
                  <View style={styles.tradeRow}>
                    <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>Entry</Text>
                    <Text style={[styles.tradeValue, { color: theme.colors.textPrimary }]}>{result.entryPrice}</Text>
                  </View>
                ) : null}
                {result.stopLoss ? (
                  <View style={styles.tradeRow}>
                    <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>Stop Loss</Text>
                    <Text style={[styles.tradeValue, { color: theme.colors.error }]}>{result.stopLoss}</Text>
                  </View>
                ) : null}
                {result.takeProfit1 ? (
                  <View style={styles.tradeRow}>
                    <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>TP 1</Text>
                    <Text style={[styles.tradeValue, { color: theme.colors.success }]}>{result.takeProfit1}</Text>
                  </View>
                ) : null}
                {result.takeProfit2 ? (
                  <View style={styles.tradeRow}>
                    <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>TP 2</Text>
                    <Text style={[styles.tradeValue, { color: theme.colors.success }]}>{result.takeProfit2}</Text>
                  </View>
                ) : null}
                {result.takeProfit3 ? (
                  <View style={styles.tradeRow}>
                    <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>TP 3</Text>
                    <Text style={[styles.tradeValue, { color: theme.colors.success }]}>{result.takeProfit3}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        )}

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: theme.colors.textMuted }]}>
          AI analysis is for educational purposes only. Not financial advice. Always do your own research.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.3,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    marginRight: 16,
    padding: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    overflow: 'hidden',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  uploadCard: {
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
    minHeight: 220,
    marginBottom: 16,
  },
  uploadGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
  },
  uploadPlaceholder: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  uploadText: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  uploadHint: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  previewContainer: {
    flex: 1,
    minHeight: 220,
    padding: 12,
  },
  previewImage: {
    width: '100%',
    flex: 1,
    borderRadius: 16,
  },
  clearButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: 20,
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 20,
    gap: 10,
  },
  cameraButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 24,
    marginBottom: 24,
    gap: 12,
  },
  analyzeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  resultCard: {
    borderRadius: 24,
    borderWidth: 2,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  signalLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  signalValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  confidenceBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 12,
  },
  reasoningLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  reasoningText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  suggestionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  suggestionText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  tradeLevels: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  tradeLevelsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  tradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  tradeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  tradeValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
});
