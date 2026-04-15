import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Alert,
  unstable_batchedUpdates,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Scan,
  Upload,
  TrendingUp,
  TrendingDown,
  Minus,
  Lock,
  Trash2,
  History,
  Zap,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/providers/theme-provider';
import {
  useApp,
  type ActiveSymbol,
  type MT4Symbol,
  type MT5Symbol,
  type SignalLog,
} from '@/providers/app-provider';
import { apiService, type ChartAnalysisResult } from '@/services/api';

const SCANNER_HISTORY_KEY = 'ai-scanner-history';
const SCANNER_UPLOAD_COUNT_KEY = 'ai-scanner-upload-count';
const MAX_HISTORY = 5;
const MAX_UPLOADS = 20;

function normalizeSymbolKey(s: string): string {
  return s.replace(/\s/g, '').toUpperCase();
}

/** Root name before broker suffixes like .i, .m, #, etc. */
function baseSymbolKey(s: string): string {
  const n = normalizeSymbolKey(s);
  return n.split(/[.#_]/)[0] || n;
}

/**
 * True if chart symbol and configured symbol likely refer to the same instrument
 * (exact, same root, prefix, or contained substring for longer names).
 */
function symbolsAreSimilar(chartSymbol: string, configuredSymbol: string): boolean {
  const a = normalizeSymbolKey(chartSymbol);
  const b = normalizeSymbolKey(configuredSymbol);
  if (a === b) return true;
  const ba = baseSymbolKey(chartSymbol);
  const bb = baseSymbolKey(configuredSymbol);
  if (ba.length >= 2 && bb.length >= 2 && ba === bb) return true;
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  if (a.length >= 4 && b.length >= 4) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

/** Strip to a numeric string for MT5 order fields (prices may include commas or labels). */
function stripNumericPrice(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  const m = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return m;
}

/**
 * Maps the AI-analysed symbol to exactly one trade-config symbol, or null.
 * Only trades when the analysed instrument is configured (exact or same broker variant, e.g. USTECH vs USTECH.i).
 * Never picks an unrelated configured symbol when the chart was for something else.
 */
function resolveConfiguredTradeSymbol(
  analysisSymbol: string | undefined,
  mt5Symbols: MT5Symbol[],
  mt4Symbols: MT4Symbol[],
  activeSymbols: ActiveSymbol[]
): { symbol: string } | null {
  const fromMt5 = mt5Symbols.map((x) => x.symbol);
  const fromMt4 = mt4Symbols.map((x) => x.symbol);
  const fromActive = activeSymbols.map((x) => x.symbol);
  const unique = [...new Set([...fromMt5, ...fromMt4, ...fromActive].filter(Boolean))];

  const raw = (analysisSymbol || '').trim();
  if (!raw || unique.length === 0) return null;

  const exact = unique.find((u) => normalizeSymbolKey(u) === normalizeSymbolKey(raw));
  if (exact) return { symbol: exact };

  const similar = unique.filter((u) => symbolsAreSimilar(raw, u));
  if (similar.length === 0) return null;
  if (similar.length === 1) return { symbol: similar[0] };
  similar.sort((a, b) => {
    const da = Math.abs(normalizeSymbolKey(a).length - normalizeSymbolKey(raw).length);
    const db = Math.abs(normalizeSymbolKey(b).length - normalizeSymbolKey(raw).length);
    if (da !== db) return da - db;
    return normalizeSymbolKey(a).localeCompare(normalizeSymbolKey(b));
  });
  return { symbol: similar[0] };
}

/** Builds the same `SignalLog` shape the signal monitor uses, so MT5 execution runs the same path. */
function buildSignalFromScanner(
  result: ChartAnalysisResult,
  asset: string
): SignalLog {
  const tp = stripNumericPrice(result.takeProfit1 || '');
  const price = stripNumericPrice(result.entryPrice || result.currentPrice);
  const direction = result.signal === 'BUY' ? 'buy' : 'sell';
  return {
    id: `ai-scan-${Date.now()}`,
    asset,
    action: direction,
    price: price || '0',
    tp,
    sl: stripNumericPrice(result.stopLoss),
    time: new Date().toISOString(),
    type: 'AI_SCANNER',
    source: 'ai_scanner',
  };
}

export interface ScannerHistoryItem {
  id: string;
  timestamp: number;
  imageUri: string;
  imageBase64?: string; // persisted in AsyncStorage for display after app restart
  result: ChartAnalysisResult;
}

export default function AIScannerScreen() {
  const { theme } = useTheme();
  const {
    user,
    mt5Account,
    mt5Symbols,
    mt4Symbols,
    activeSymbols,
    isSymbolConfiguredForTrading,
    pausePolling,
    setMT5Signal,
    setMT5TradeOverlayMessage,
    setShowMT5SignalWebView,
  } = useApp();
  const [scannerUnlocked, setScannerUnlocked] = useState<boolean | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ChartAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScannerHistoryItem[]>([]);
  const [uploadCount, setUploadCount] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToHistory = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SCANNER_HISTORY_KEY);
      const items = raw ? (JSON.parse(raw) as ScannerHistoryItem[]) : [];
      setHistory(Array.isArray(items) ? items.slice(0, MAX_HISTORY) : []);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadUploadCount = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SCANNER_UPLOAD_COUNT_KEY);
      const n = parseInt(raw || '0', 10);
      setUploadCount(isNaN(n) ? 0 : n);
    } catch {
      setUploadCount(0);
    }
  }, []);

  const saveToHistory = useCallback(
    async (imageUri: string, imageBase64: string | null, result: ChartAnalysisResult): Promise<number> => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const item: ScannerHistoryItem = {
        id,
        timestamp: Date.now(),
        imageUri,
        imageBase64: imageBase64 || undefined,
        result,
      };
      const raw = await AsyncStorage.getItem(SCANNER_HISTORY_KEY);
      const current = raw ? (JSON.parse(raw) as ScannerHistoryItem[]) : [];
      const next = [item, ...(Array.isArray(current) ? current : [])].slice(0, MAX_HISTORY);
      setHistory(next);
      await AsyncStorage.setItem(SCANNER_HISTORY_KEY, JSON.stringify(next));
      const countRaw = await AsyncStorage.getItem(SCANNER_UPLOAD_COUNT_KEY);
      const count = parseInt(countRaw || '0', 10) + 1;
      await AsyncStorage.setItem(SCANNER_UPLOAD_COUNT_KEY, String(count));
      setUploadCount(count);
      return count;
    },
    []
  );

  const clearAllHistory = useCallback(async () => {
    await AsyncStorage.removeItem(SCANNER_HISTORY_KEY);
    setHistory([]);
  }, []);

  const loadHistoryItem = useCallback((item: ScannerHistoryItem) => {
    const uri = item.imageBase64
      ? `data:image/jpeg;base64,${item.imageBase64}`
      : item.imageUri;
    if (uri) setImageUri(uri);
    setResult(item.result);
    setError(null);
    setImageBase64(item.imageBase64 || null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const removeHistoryItem = useCallback(
    async (id: string) => {
      const next = history.filter((h) => h.id !== id);
      setHistory(next);
      await AsyncStorage.setItem(SCANNER_HISTORY_KEY, JSON.stringify(next));
    },
    [history]
  );

  const handleBack = () => router.back();

  const checkScanner = useCallback(async () => {
    let email = user?.email;
    if (!email) {
      try {
        const stored = await AsyncStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored) as { email?: string };
          email = parsed?.email;
        }
      } catch {
        // ignore
      }
    }
    if (!email) {
      setScannerUnlocked(false);
      return;
    }
    const { scanner } = await apiService.getScannerStatus(email);
    if (scannerUnlocked === false && scanner) {
      await AsyncStorage.setItem(SCANNER_UPLOAD_COUNT_KEY, '0');
      setUploadCount(0);
    }
    setScannerUnlocked(scanner);
  }, [user?.email, scannerUnlocked]);

  useEffect(() => {
    checkScanner();
    loadHistory();
    loadUploadCount();
  }, [checkScanner, loadHistory, loadUploadCount]);

  useFocusEffect(
    useCallback(() => {
      checkScanner();
      loadHistory();
      loadUploadCount();
    }, [checkScanner, loadHistory, loadUploadCount])
  );

  const handleUnlockPress = async () => {
    let email = user?.email;
    if (!email) {
      try {
        const stored = await AsyncStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored) as { email?: string };
          email = parsed?.email;
        }
      } catch {
        // ignore
      }
    }
    router.push({
      pathname: '/ai-payment',
      params: email ? { email } : {},
    });
  };

  /** Android returns content:// from the gallery; copy to app cache with correct extension so the manipulator can read it. */
  const ensureReadableImageUri = async (uri: string, mimeType?: string | null): Promise<string> => {
    if (Platform.OS !== 'android') return uri;
    if (!uri.startsWith('content://')) return uri;
    const dir = FileSystem.cacheDirectory;
    if (!dir) return uri;
    const mt = (mimeType || '').toLowerCase();
    const ext = mt.includes('png') ? 'png' : mt.includes('webp') ? 'webp' : 'jpg';
    const dest = `${dir}scanner-pick-${Date.now()}.${ext}`;
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    } catch (e) {
      console.warn('[AI Scanner] copy content URI failed:', e);
      return uri;
    }
  };

  // Resize and compress to keep payload small (avoids Render 502 with large requests)
  const compressForAnalysis = async (
    uri: string,
    existingBase64: string | undefined,
    existingMime: string | undefined
  ): Promise<{ uri: string; base64: string | null; mimeType: string }> => {
    const readBase64FromFile = async (fileUri: string): Promise<string | null> => {
      try {
        return await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        return null;
      }
    };

    const jpegOut = {
      compress: 0.4,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true as const,
    };

    // 1) Resize + compress (ideal)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 600 } }],
        jpegOut
      );
      let base64 = manipulated.base64 ?? existingBase64 ?? null;
      if (!base64 && manipulated.uri) {
        base64 = await readBase64FromFile(manipulated.uri);
      }
      if (base64) {
        return { uri: manipulated.uri, base64, mimeType: 'image/jpeg' };
      }
    } catch (e) {
      console.warn('[AI Scanner] resize step failed:', e);
    }

    // 2) Re-encode only (some Android images fail resize but work as full-frame JPEG)
    try {
      const encoded = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.45,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      let base64 = encoded.base64 ?? null;
      if (!base64 && encoded.uri) {
        base64 = await readBase64FromFile(encoded.uri);
      }
      if (base64) {
        return { uri: encoded.uri, base64, mimeType: 'image/jpeg' };
      }
    } catch (e) {
      console.warn('[AI Scanner] re-encode step failed:', e);
    }

    // 3) Raw base64 from file or content URI (Android SAF)
    let base64 = existingBase64 ?? (await readBase64FromFile(uri));
    return {
      uri,
      base64,
      mimeType: existingMime || 'image/jpeg',
    };
  };

  const pickImage = async () => {
    setError(null);
    setResult(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload charts.');
      return;
    }
    // Android: legacy picker + full quality avoids broken URIs / double compression; we compress in JS.
    // iOS: quality 0.4 is fine; native base64 optional.
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: Platform.OS === 'android' ? 1 : 0.4,
      base64: Platform.OS === 'ios',
      ...(Platform.OS === 'android'
        ? { legacy: true, defaultTab: 'photos' as ImagePicker.DefaultTab }
        : {}),
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets?.[0];
    if (!asset?.uri) {
      setError('No image was selected.');
      return;
    }
    const readableUri = await ensureReadableImageUri(asset.uri, asset.mimeType);
    const { uri, base64, mimeType } = await compressForAnalysis(readableUri, asset.base64, asset.mimeType);
    if (!base64) {
      setError('Could not read this image. Try another photo or take a new screenshot.');
      return;
    }
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
      allowsEditing: false,
      quality: Platform.OS === 'android' ? 1 : 0.4,
      base64: Platform.OS === 'ios',
    });
    if (pickerResult.canceled) return;
    const asset = pickerResult.assets?.[0];
    if (!asset?.uri) {
      setError('No photo was captured.');
      return;
    }
    const readableUri = await ensureReadableImageUri(asset.uri, asset.mimeType);
    const { uri, base64, mimeType } = await compressForAnalysis(readableUri, asset.base64, asset.mimeType);
    if (!base64) {
      setError('Could not read this photo. Please try again.');
      return;
    }
    setImageUri(uri);
    setImageBase64(base64);
    setMimeType(mimeType || 'image/jpeg');
  };

  const analyzeChart = async () => {
    if (!imageBase64) {
      setError('Please upload a chart image first.');
      return;
    }
    if (uploadCount >= MAX_UPLOADS) {
      setError(`${MAX_UPLOADS} upload limit reached. Unlock to continue.`);
      let email = user?.email;
      if (!email) {
        try {
          const stored = await AsyncStorage.getItem('user');
          if (stored) {
            const parsed = JSON.parse(stored) as { email?: string };
            email = parsed?.email;
          }
        } catch {
          /* ignore */
        }
      }
      if (email) {
        await apiService.revokeScannerAccess(email);
        setScannerUnlocked(false);
      }
      return;
    }
    // Client-side size check to avoid 502 (Render limits)
    if (imageBase64.length > 1_000_000) {
      setError('Image too large. Tap Change and use a smaller screenshot or crop the chart.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiService.analyzeChart(imageBase64, mimeType);
      if (response.message === 'accept' && response.data) {
        setResult(response.data);
        if (imageUri) {
          const newCount = await saveToHistory(imageUri, imageBase64, response.data);
          if (newCount >= MAX_UPLOADS) {
            let email = user?.email;
            if (!email) {
              try {
                const stored = await AsyncStorage.getItem('user');
                if (stored) {
                  const parsed = JSON.parse(stored) as { email?: string };
                  email = parsed?.email;
                }
              } catch {
                /* ignore */
              }
            }
            if (email) {
              await apiService.revokeScannerAccess(email);
              setScannerUnlocked(false);
            }
          }
        }
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

  const handleTakeTrade = useCallback(() => {
    if (!result) return;
    if (result.signal === 'NEUTRAL') {
      Alert.alert(
        'No trade direction',
        'The analysis is neutral. Choose a chart with a clear buy or sell suggestion before taking a trade.'
      );
      return;
    }
    const openTradingNotice = (message: string) => {
      setMT5Signal(null);
      setMT5TradeOverlayMessage(message);
      setShowMT5SignalWebView(true);
    };

    if (!mt5Account?.login?.trim() || !mt5Account?.password) {
      router.push('/(tabs)/metatrader');
      return;
    }

    const resolved = resolveConfiguredTradeSymbol(
      result.symbol,
      mt5Symbols,
      mt4Symbols,
      activeSymbols
    );
    if (!resolved || !isSymbolConfiguredForTrading(resolved.symbol)) {
      openTradingNotice('Symbol not configured');
      return;
    }

    const sl = stripNumericPrice(result.stopLoss);
    const tp = stripNumericPrice(result.takeProfit1 || '');
    if (!sl || !tp) {
      Alert.alert(
        'Incomplete trade levels',
        'Stop loss and take profit (TP1) are required. They are sent with the buy or sell direction from the analysis.'
      );
      return;
    }

    const signal = buildSignalFromScanner(result, resolved.symbol);
    pausePolling().catch(() => {});
    unstable_batchedUpdates(() => {
      setMT5TradeOverlayMessage(null);
      setMT5Signal(signal);
      setShowMT5SignalWebView(true);
    });
  }, [
    result,
    mt5Account,
    mt5Symbols,
    mt4Symbols,
    activeSymbols,
    isSymbolConfiguredForTrading,
    pausePolling,
    setMT5Signal,
    setMT5TradeOverlayMessage,
    setShowMT5SignalWebView,
  ]);

  const SignalIcon = result?.signal === 'BUY' ? TrendingUp : result?.signal === 'SELL' ? TrendingDown : Minus;
  const signalColor =
    result?.signal === 'BUY'
      ? theme.colors.success
      : result?.signal === 'SELL'
        ? theme.colors.error
        : theme.colors.textMuted;

  const isLocked = scannerUnlocked === false;

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
        {history.length > 0 && (
          <TouchableOpacity
            style={[styles.historyHeaderBtn, { backgroundColor: `${theme.colors.accent}33`, borderColor: theme.colors.accent }]}
            onPress={scrollToHistory}
            activeOpacity={0.7}
          >
            <History color={theme.colors.accent} size={20} strokeWidth={2} />
            <Text style={[styles.historyHeaderBtnText, { color: theme.colors.accent }]}>History</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.contentWrapper}>
        {isLocked && (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.lockOverlayBg,
              { backgroundColor: theme.colors.background },
            ]}
          />
        )}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          pointerEvents={isLocked ? 'none' : 'auto'}
        >
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
                Charts only — MetaTrader, TradingView, or similar
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
          <>
            {uploadCount < MAX_UPLOADS && (
              <Text style={[styles.uploadCountText, { color: theme.colors.textMuted }]}>
                {uploadCount} of {MAX_UPLOADS} uploads used
              </Text>
            )}
            {uploadCount >= MAX_UPLOADS && (
              <View style={[styles.limitBanner, { backgroundColor: `${theme.colors.warning}22`, borderColor: theme.colors.warning }]}>
                <Text style={[styles.limitBannerText, { color: theme.colors.warning }]}>
                  {MAX_UPLOADS} upload limit reached ({uploadCount}/{MAX_UPLOADS}). Unlock to continue.
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.analyzeButton,
                { backgroundColor: theme.colors.accent },
                uploadCount >= MAX_UPLOADS && styles.analyzeButtonDisabled,
              ]}
              onPress={analyzeChart}
              disabled={analyzing || uploadCount >= MAX_UPLOADS}
              activeOpacity={0.8}
            >
              {analyzing ? (
                <ActivityIndicator color={theme.colors.onAccent} size="small" />
              ) : (
                <>
                  <Scan color={theme.colors.onAccent} size={22} strokeWidth={2.5} />
                  <Text style={[styles.analyzeButtonText, { color: theme.colors.onAccent }]}>Analyze Chart</Text>
                </>
              )}
            </TouchableOpacity>
          </>
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
            {(result.symbol || result.timeframe || result.currentPrice) ? (
              <View style={[styles.chartMeta, { borderBottomColor: theme.colors.borderColor }]}>
                {result.symbol ? (
                  <Text style={[styles.chartMetaText, { color: theme.colors.textPrimary }]}>
                    {result.symbol}
                  </Text>
                ) : null}
                {result.timeframe ? (
                  <Text style={[styles.chartMetaText, { color: theme.colors.textMuted }]}>
                    {result.timeframe}
                  </Text>
                ) : null}
                {result.currentPrice ? (
                  <Text style={[styles.chartMetaText, styles.chartMetaPrice, { color: theme.colors.accent }]}>
                    {result.currentPrice}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.signalHeader}>
              <SignalIcon color={signalColor} size={32} strokeWidth={2.5} />
              <View>
                <Text style={[styles.signalLabel, { color: theme.colors.textMuted }]}>RECOMMENDATION</Text>
                <Text style={[styles.signalValue, { color: signalColor }]}>
                  {result.signal === 'NEUTRAL' ? '—' : result.signal}
                </Text>
              </View>
              <View style={[styles.confidenceBadge, { backgroundColor: `${signalColor}33` }]}>
                <Text style={[styles.confidenceText, { color: signalColor }]}>
                  {result.confidence} confidence
                </Text>
              </View>
            </View>
            <Text style={[styles.summaryText, { color: theme.colors.textPrimary }]}>{result.summary}</Text>

            {/* Trade levels - always visible */}
            <View style={styles.tradeLevels}>
              <Text style={[styles.tradeLevelsTitle, { color: theme.colors.textMuted }]}>TRADE SUGGESTION</Text>
              <View style={styles.tradeRow}>
                <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>Entry</Text>
                <Text style={[styles.tradeValue, { color: theme.colors.textPrimary }]}>
                  {result.entryPrice || '—'}
                </Text>
              </View>
              <View style={styles.tradeRow}>
                <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>Stop Loss</Text>
                <Text style={[styles.tradeValue, { color: theme.colors.error }]}>
                  {result.stopLoss || '—'}
                </Text>
              </View>
              <View style={styles.tradeRow}>
                <Text style={[styles.tradeLabel, { color: theme.colors.textMuted }]}>Take Profit</Text>
                <Text style={[styles.tradeValue, { color: theme.colors.success }]}>
                  {result.takeProfit1 || result.takeProfit2 || result.takeProfit3
                    ? [result.takeProfit1, result.takeProfit2, result.takeProfit3].filter(Boolean).join(' / ')
                    : '—'}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.takeTradeButton,
                  { backgroundColor: theme.colors.success },
                  result.signal === 'NEUTRAL' && styles.takeTradeButtonDisabled,
                ]}
                onPress={handleTakeTrade}
                disabled={result.signal === 'NEUTRAL'}
                activeOpacity={0.85}
              >
                <Zap color="#FFFFFF" size={20} strokeWidth={2.5} />
                <Text style={styles.takeTradeButtonText}>Take trade</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.reasoningLabel, { color: theme.colors.textMuted }]}>Analysis</Text>
            <Text style={[styles.reasoningText, { color: theme.colors.textSecondary }]}>
              {result.reasoning || 'No technical analysis provided.'}
            </Text>
            <Text style={[styles.suggestionLabel, { color: theme.colors.textMuted }]}>Suggestion</Text>
            <Text style={[styles.suggestionText, { color: theme.colors.textPrimary }]}>
              {result.suggestion || 'Review the chart and trade levels above.'}
            </Text>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={[styles.historySection, { borderColor: theme.colors.borderColor }]}>
            <View style={styles.historyHeader}>
              <History color={theme.colors.textMuted} size={20} strokeWidth={2} />
              <Text style={[styles.historyTitle, { color: theme.colors.textPrimary }]}>Scan history</Text>
              <Pressable
                style={[styles.clearAllButton, { backgroundColor: `${theme.colors.error}22` }]}
                onPress={() => {
                  clearAllHistory();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Trash2 color={theme.colors.error} size={16} strokeWidth={2} />
                <Text style={[styles.clearAllText, { color: theme.colors.error }]}>Clear all</Text>
              </Pressable>
            </View>
            {history.map((item, idx) => {
              const itemSignalColor =
                item.result.signal === 'BUY'
                  ? theme.colors.success
                  : item.result.signal === 'SELL'
                    ? theme.colors.error
                    : theme.colors.textMuted;
              const ItemIcon =
                item.result.signal === 'BUY' ? TrendingUp : item.result.signal === 'SELL' ? TrendingDown : Minus;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.historyItem,
                    { borderColor: theme.colors.borderColor },
                    idx === history.length - 1 && { marginBottom: 0 },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.historyItemTouchable}
                    onPress={() => loadHistoryItem(item)}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{
                        uri: item.imageBase64
                          ? `data:image/jpeg;base64,${item.imageBase64}`
                          : item.imageUri,
                      }}
                      style={styles.historyThumb}
                      resizeMode="cover"
                    />
                    <View style={styles.historyItemContent}>
                      <View style={styles.historyItemRow}>
                        <Text style={[styles.historySymbol, { color: theme.colors.textPrimary }]}>
                          {item.result.symbol || 'Chart'}
                        </Text>
                        <Text style={[styles.historyTimeframe, { color: theme.colors.textMuted }]}>
                          {item.result.timeframe || ''}
                        </Text>
                      </View>
                      <View style={styles.historyItemRow}>
                        <ItemIcon color={itemSignalColor} size={18} strokeWidth={2.5} />
                        <Text style={[styles.historySignal, { color: itemSignalColor }]}>
                          {item.result.signal === 'NEUTRAL' ? '—' : item.result.signal}
                        </Text>
                        <Text style={[styles.historyDate, { color: theme.colors.textMuted }]}>
                          {new Date(item.timestamp).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.historyDeleteBtn, { backgroundColor: `${theme.colors.error}22` }]}
                    onPress={() => removeHistoryItem(item.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 color={theme.colors.error} size={18} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: theme.colors.textMuted }]}>
          AI analysis is for educational purposes only. Not financial advice. Always do your own research.
        </Text>
      </ScrollView>

        {/* Lock overlay - when scanner not unlocked */}
        {isLocked && (
          <View style={styles.lockOverlay} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.unlockButton, { backgroundColor: theme.colors.accent }]}
              onPress={handleUnlockPress}
              activeOpacity={0.8}
            >
              <Lock color={theme.colors.onAccent} size={28} strokeWidth={2.5} />
              <Text style={[styles.unlockButtonText, { color: theme.colors.onAccent }]}>UNLOCK AI SCANNER</Text>
              <Text style={[styles.unlockButtonSubtext, { color: theme.colors.onAccent, opacity: 0.9 }]}>
                Tap to unlock
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  historyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  historyHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
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
  contentWrapper: {
    flex: 1,
    position: 'relative',
  },
  lockOverlayBg: {
    zIndex: 10,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 11,
  },
  unlockButton: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 24,
    alignItems: 'center',
    minWidth: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  unlockButtonText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 12,
  },
  unlockButtonSubtext: {
    fontSize: 13,
    marginTop: 6,
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
  uploadCountText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  limitBanner: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  limitBannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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
  analyzeButtonDisabled: {
    opacity: 0.5,
  },
  analyzeButtonText: {
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
  chartMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
  },
  chartMetaText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chartMetaPrice: {
    marginLeft: 'auto',
    fontFamily: 'monospace',
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
  takeTradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  takeTradeButtonDisabled: {
    opacity: 0.45,
  },
  takeTradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  historySection: {
    marginTop: 24,
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    minHeight: 44,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  historyItemTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  historyThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  historyItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  historySymbol: {
    fontSize: 15,
    fontWeight: '700',
  },
  historyTimeframe: {
    fontSize: 12,
    fontWeight: '600',
  },
  historySignal: {
    fontSize: 14,
    fontWeight: '800',
  },
  historyDate: {
    fontSize: 11,
    marginLeft: 'auto',
  },
  historyDeleteBtn: {
    padding: 10,
    borderRadius: 12,
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
});
