/**
 * iOS Background Signal Service
 * Polls for trading signals when app is in background and shows local notifications.
 * Uses expo-background-task (BGTaskScheduler on iOS) - runs periodically when app is backgrounded.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const BACKGROUND_SIGNAL_TASK = 'background-signal-poll';
const STORAGE_KEY_LICENSE = 'BACKGROUND_SIGNAL_LICENSE_KEY';
const STORAGE_KEY_LAST_POLL = 'BACKGROUND_SIGNAL_LAST_POLL';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ||
  'https://ea-trade-app.onrender.com'
).replace(/\/$/, '');

interface Signal {
  id: number;
  ea: number;
  asset: string;
  action: string;
  price: number;
  tp: number;
  sl: number;
  time: string;
  latestupdate?: string;
}

function formatSignalDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${year}, ${hours}:${mins}`;
  } catch {
    return isoString;
  }
}

// Must be defined at global scope - runs when iOS wakes app in background
TaskManager.defineTask(BACKGROUND_SIGNAL_TASK, async () => {
  try {
    const licenseKey = await AsyncStorage.getItem(STORAGE_KEY_LICENSE);
    if (!licenseKey) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const lastPoll = await AsyncStorage.getItem(STORAGE_KEY_LAST_POLL);
    const since = lastPoll || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get EA from license
    const eaUrl = `${API_BASE_URL}/api/get-ea-from-license?licenseKey=${encodeURIComponent(licenseKey)}`;
    const eaRes = await fetch(eaUrl);
    if (!eaRes.ok) return BackgroundTask.BackgroundTaskResult.Failed;
    const eaData = await eaRes.json();
    const eaId = eaData.id ?? eaData.eaId;
    if (!eaId) return BackgroundTask.BackgroundTaskResult.Success;

    // Get new signals
    const signalsUrl = `${API_BASE_URL}/api/get-new-signals?eaId=${eaId}&since=${encodeURIComponent(since)}`;
    const signalsRes = await fetch(signalsUrl);
    if (!signalsRes.ok) return BackgroundTask.BackgroundTaskResult.Failed;
    const { signals = [] } = await signalsRes.json();

    if (signals.length > 0) {
      const now = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEY_LAST_POLL, now);

      for (const sig of signals) {
        const signal = sig as Signal;
        const action = (signal.action || '').toUpperCase();
        const dot = action === 'BUY' ? '🔵' : '🔴';
        const title = `${dot} SIGNAL ${signal.asset || 'Unknown'} ${action}`;
        const sl = typeof signal.sl === 'number' ? signal.sl.toFixed(2) : String(signal.sl || '0');
        const tp = typeof signal.tp === 'number' ? signal.tp.toFixed(2) : String(signal.tp || '0');
        const formattedTime = formatSignalDateTime(signal.time || signal.latestupdate);
        const bodyParts = [`SL: ${sl} • TP: ${tp}`];
        if (formattedTime) bodyParts.push(formattedTime);
        const body = bodyParts.join(' • ');

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: { signalId: signal.id, asset: signal.asset },
          },
          trigger: null, // Deliver immediately
        });
      }
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('[iOS Background] Signal poll failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerIOSBackgroundSignalTask(licenseKey: string): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    await AsyncStorage.setItem(STORAGE_KEY_LICENSE, licenseKey);
    await AsyncStorage.setItem(STORAGE_KEY_LAST_POLL, new Date().toISOString());

    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      console.warn('[iOS Background] Background tasks restricted');
      return false;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_SIGNAL_TASK, {
      minimumInterval: 15, // 15 minutes - iOS minimum, system may run less frequently
    });
    console.log('[iOS Background] Signal polling task registered');
    return true;
  } catch (error) {
    console.error('[iOS Background] Failed to register task:', error);
    return false;
  }
}

export async function unregisterIOSBackgroundSignalTask(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SIGNAL_TASK);
    await AsyncStorage.removeItem(STORAGE_KEY_LICENSE);
    await AsyncStorage.removeItem(STORAGE_KEY_LAST_POLL);
    console.log('[iOS Background] Signal polling task unregistered');
  } catch (error) {
    console.error('[iOS Background] Failed to unregister task:', error);
  }
}

export async function requestIOSNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}
