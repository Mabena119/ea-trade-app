package app.eatrade.automated.forex.trading.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.HttpURLConnection
import java.net.URL
import java.util.*
import org.json.JSONObject
import org.json.JSONArray
import app.eatrade.automated.forex.trading.app.MainActivity

class BackgroundMonitoringService : Service() {
    private var isRunning = false
    private var pollingThread: Thread? = null
    private var licenseKey: String? = null
    private var reactContext: ReactApplicationContext? = null
    private var lastPollTime: String? = null
    // Thread-safe list for pending signals (accessed from polling thread and main thread)
    private val pendingSignals = Collections.synchronizedList(mutableListOf<Map<String, Any>>())
    private val pendingSignalsLock = Any() // Lock for atomic operations on pendingSignals
    private val MAX_SIGNAL_AGE_SECONDS = 30 // Only process signals less than 30 seconds old
    private var lastDetectedSignal: Map<String, Any>? = null // For updating foreground notification
    
    private fun getCurrentISOTime(): String {
        val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return format.format(java.util.Date())
    }
    
    private fun parseISOTime(isoString: String): Long {
        return try {
            val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            format.parse(isoString)?.time ?: 0L
        } catch (e: Exception) {
            try {
                val format = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
                format.timeZone = java.util.TimeZone.getTimeZone("UTC")
                format.parse(isoString)?.time ?: 0L
            } catch (e2: Exception) {
                0L
            }
        }
    }
    
    private fun isSignalRecent(signal: Map<String, Any>): Pair<Boolean, Double> {
        val latestUpdate = signal["latestupdate"] as? String ?: ""
        val signalTime = signal["time"] as? String ?: ""
        
        // Use latestupdate if available, otherwise use time
        val timeToCheck = if (latestUpdate.isNotEmpty()) latestUpdate else signalTime
        
        if (timeToCheck.isEmpty()) {
            return Pair(false, -1.0)
        }
        
        val signalTimestamp = parseISOTime(timeToCheck)
        if (signalTimestamp == 0L) {
            return Pair(false, -1.0)
        }
        
        val now = System.currentTimeMillis()
        val ageInSeconds = (now - signalTimestamp) / 1000.0
        
        // Fix: Reject future-dated signals (negative age) and signals older than threshold
        // A signal is only valid if: 0 <= ageInSeconds <= MAX_SIGNAL_AGE_SECONDS
        val isRecent = ageInSeconds >= 0 && ageInSeconds <= MAX_SIGNAL_AGE_SECONDS
        return Pair(isRecent, ageInSeconds)
    }

    companion object {
        private const val TAG = "BackgroundMonitoring"
        private const val NOTIFICATION_ID = 1001
        private const val SIGNAL_NOTIFICATION_ID_BASE = 2000
        private const val CHANNEL_ID = "background_monitoring_channel"
        private const val SIGNAL_CHANNEL_ID = "signal_alerts_channel"
        private const val POLL_INTERVAL_MS = 5000L // 5 seconds for faster refresh
        private var instance: BackgroundMonitoringService? = null

        fun getInstance(): BackgroundMonitoringService? = instance
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        Log.d(TAG, "BackgroundMonitoringService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "BackgroundMonitoringService onStartCommand")
        
        val action = intent?.action
        when (action) {
            "START_MONITORING" -> {
            licenseKey = intent.getStringExtra("licenseKey")
            lastPollTime = intent.getStringExtra("lastPollTime") ?: getCurrentISOTime()
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        // Android 14+ (API 34+) requires foregroundServiceType flag
                        // FOREGROUND_SERVICE_TYPE_DATA_SYNC = 4
                        startForeground(NOTIFICATION_ID, createNotification(), 
                            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                        Log.d(TAG, "✅ Foreground service started with dataSync type (Android 14+)")
                    } else {
                        startForeground(NOTIFICATION_ID, createNotification())
                        Log.d(TAG, "✅ Foreground service started (Android < 14)")
                    }
                    startPolling()
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Error starting foreground service", e)
                    Log.e(TAG, "❌ Error details: ${e.message}")
                    Log.e(TAG, "❌ Stack trace: ${e.stackTraceToString()}")
                    // Don't start polling if foreground service failed
                    stopSelf()
                }
            }
            "STOP_MONITORING" -> {
                stopPolling()
                stopForeground(true)
                stopSelf()
            }
        }
        
        return START_STICKY // Restart service if killed
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        stopPolling()
        instance = null
        Log.d(TAG, "BackgroundMonitoringService destroyed")
    }

    fun setReactContext(context: ReactApplicationContext) {
        Log.d(TAG, "📱 React context set/updated")
        this.reactContext = context
        
        // Send any pending signals now that context is available
        // Use synchronized block to prevent race condition with polling thread
        val signalsToSend: List<Map<String, Any>>
        synchronized(pendingSignalsLock) {
            if (pendingSignals.isEmpty()) {
                return
            }
            Log.d(TAG, "📤 Sending ${pendingSignals.size} pending signals to React Native")
            signalsToSend = pendingSignals.toList()
            pendingSignals.clear()
        }
        
        for (signal in signalsToSend) {
            // Recheck if signal is still recent
            val (isRecent, ageInSeconds) = isSignalRecent(signal)
            if (isRecent) {
                Log.d(TAG, "📤 Sending pending signal: ${signal["asset"]} (${ageInSeconds.toInt()}s old)")
                sendSignalToReactNativeInternal(signal)
            } else {
                Log.d(TAG, "⏰ Pending signal too old now, skipping: ${signal["asset"]} (${ageInSeconds.toInt()}s old)")
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)
            
            val monitoringChannel = NotificationChannel(
                CHANNEL_ID,
                "Background Signal Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors trading signals in background"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(monitoringChannel)
            
            val signalChannel = NotificationChannel(
                SIGNAL_CHANNEL_ID,
                "Trading Signal Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "New trading signals with full trade details"
                setShowBadge(true)
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(signalChannel)
        }
    }

    private fun createNotification(): Notification {
        val latestSignal = lastDetectedSignal
        val contentText = if (latestSignal != null) {
            val asset = latestSignal["asset"] as? String ?: ""
            val action = latestSignal["action"] as? String ?: ""
            val price = (latestSignal["price"] as? Double) ?: 0.0
            val sl = (latestSignal["sl"] as? Double) ?: 0.0
            val tp = (latestSignal["tp"] as? Double) ?: 0.0
            "Signal: $asset $action @ $price • SL: $sl TP: $tp"
        } else {
            "Monitoring trading signals in background"
        }
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("EA Trade - Monitoring Active")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun showSignalNotification(signal: Map<String, Any>) {
        val asset = signal["asset"] as? String ?: "Unknown"
        val action = signal["action"] as? String ?: ""
        val price = (signal["price"] as? Double) ?: 0.0
        val sl = (signal["sl"] as? Double) ?: 0.0
        val tp = (signal["tp"] as? Double) ?: 0.0
        val time = signal["time"] as? String ?: ""
        
        val title = "🎯 $asset $action"
        val body = "Price: $price • SL: $sl • TP: $tp${if (time.isNotEmpty()) " • $time" else ""}"
        
        val notificationId = SIGNAL_NOTIFICATION_ID_BASE + (signal["id"] as? Int ?: 0).coerceAtMost(999)
        
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(this, SIGNAL_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .build()
        
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(notificationId, notification)
        
        Log.d(TAG, "📬 Signal notification shown: $asset $action")
    }

    private fun startPolling() {
        if (isRunning) {
            Log.d(TAG, "⚠️ Polling already running - skipping start")
            return
        }

        isRunning = true
        Log.d(TAG, "✅ Starting background polling for license: $licenseKey")
        Log.d(TAG, "📡 Native service will poll every 10 seconds and bring app to foreground on signal")
        Log.d(TAG, "🔄 Polling thread starting now...")

        pollingThread = Thread {
            var pollCount = 0
            while (isRunning && licenseKey != null) {
                try {
                    pollCount++
                    Log.d(TAG, "📊 Poll #$pollCount - Checking for signals...")
                    checkForSignals()
                    Log.d(TAG, "⏳ Waiting 5 seconds before next poll...")
                    Thread.sleep(POLL_INTERVAL_MS) // Poll every 5 seconds for faster refresh
                } catch (e: InterruptedException) {
                    Log.d(TAG, "⏸️ Polling thread interrupted")
                    break
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Error in polling thread", e)
                    Thread.sleep(POLL_INTERVAL_MS)
                }
            }
            Log.d(TAG, "🛑 Polling thread ended (total polls: $pollCount)")
        }.apply {
            isDaemon = true
            start()
        }
        Log.d(TAG, "✅ Polling thread started successfully")
    }

    private fun stopPolling() {
        isRunning = false
        pollingThread?.interrupt()
        pollingThread = null
        Log.d(TAG, "Stopped background polling")
    }

    private fun checkForSignals() {
        val key = licenseKey ?: return
        val since = lastPollTime ?: getCurrentISOTime()

        try {
            // Get EA from license
            val eaUrl = "https://ea-trade-app.onrender.com/api/get-ea-from-license?licenseKey=${key}"
            val eaResponse = makeHttpRequest(eaUrl)
            val eaJson = JSONObject(eaResponse)
            val eaId = eaJson.optInt("id", -1)

            if (eaId == -1) {
                Log.w(TAG, "No EA found for license")
                return
            }

            // Get new signals
            val signalsUrl = "https://ea-trade-app.onrender.com/api/get-new-signals?eaId=${eaId}&since=${since}"
            val signalsResponse = makeHttpRequest(signalsUrl)
            
            // Parse response - API returns {"signals": [...]}
            val signalsJson = JSONObject(signalsResponse)
            val signalsArray = signalsJson.optJSONArray("signals") ?: JSONArray()

            if (signalsArray.length() > 0) {
                Log.d(TAG, "🎯 Found ${signalsArray.length()} new signals in background")
                
                // Process each signal
                for (i in 0 until signalsArray.length()) {
                    val signalJson = signalsArray.getJSONObject(i)
                    val signal = parseSignal(signalJson)
                    
                    Log.d(TAG, "📤 Processing signal: ${signal["asset"]} (${signal["action"]})")
                    
                    // Update last detected signal for foreground notification
                    lastDetectedSignal = signal
                    
                    // Show notification with full trade details
                    showSignalNotification(signal)
                    
                    // Update foreground notification to show latest signal
                    try {
                        val notification = createNotification()
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            startForeground(NOTIFICATION_ID, notification, 
                                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                        } else {
                            startForeground(NOTIFICATION_ID, notification)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not update foreground notification", e)
                    }
                    
                    // Send signal to React Native (will bring app to foreground)
                    sendSignalToReactNative(signal)
                }

                // Update last poll time
                lastPollTime = getCurrentISOTime()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for signals", e)
        }
    }

    private fun makeHttpRequest(urlString: String): String {
        val url = URL(urlString)
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 30000
        connection.readTimeout = 30000

        return connection.inputStream.bufferedReader().use { it.readText() }
    }

    private fun parseSignal(json: JSONObject): Map<String, Any> {
        return mapOf(
            "id" to json.optInt("id", 0),
            "ea" to json.optInt("ea", 0),
            "asset" to (json.optString("asset", "")),
            "latestupdate" to (json.optString("latestupdate", "")),
            "type" to (json.optString("type", "")),
            "action" to (json.optString("action", "")),
            "price" to json.optDouble("price", 0.0),
            "tp" to json.optDouble("tp", 0.0),
            "sl" to json.optDouble("sl", 0.0),
            "time" to (json.optString("time", "")),
            "results" to (json.optString("results", ""))
        )
    }

    private fun sendSignalToReactNative(signal: Map<String, Any>) {
        Log.d(TAG, "📤 Processing signal: ${signal["asset"]}")
        
        // First check if signal is recent enough (basic filtering in native)
        val (isRecent, ageInSeconds) = isSignalRecent(signal)
        
        if (!isRecent) {
            when {
                ageInSeconds < -1.0 -> {
                    // Future-dated signal (timestamp ahead of current time)
                    Log.d(TAG, "⏰ Signal has future timestamp (${(-ageInSeconds).toInt()}s ahead), skipping: ${signal["asset"]}")
                }
                ageInSeconds < 0 -> {
                    // Invalid timestamp
                    Log.d(TAG, "⏰ Signal has invalid timestamp, skipping: ${signal["asset"]}")
                }
                else -> {
                    // Signal is too old
                    Log.d(TAG, "⏰ Signal too old (${ageInSeconds.toInt()}s), NOT bringing app to foreground: ${signal["asset"]}")
                }
            }
            return
        }
        
        Log.d(TAG, "✅ Signal is recent (${ageInSeconds.toInt()}s old): ${signal["asset"]}")
        
        // Check if React context is available
        val context = reactContext
        if (context != null) {
            // React context available - send signal directly
            // React Native will do full validation (duplicates, cooldown, symbol config)
            // and decide whether to bring app to foreground
            Log.d(TAG, "📤 Sending signal to React Native for full validation: ${signal["asset"]}")
            sendSignalToReactNativeInternal(signal)
        } else {
            // React context NOT available (app is in background)
            // We need to bring app to foreground first, then send signal
            Log.d(TAG, "📱 React context not available - bringing app to foreground first: ${signal["asset"]}")
            
            // Store signal to send when context becomes available (thread-safe)
            synchronized(pendingSignalsLock) {
                pendingSignals.add(signal)
                Log.d(TAG, "📥 Signal queued (${pendingSignals.size} pending): ${signal["asset"]}")
            }
            
            // Bring app to foreground
            bringAppToForeground()
        }
    }
    
    private fun sendSignalToReactNativeInternal(signal: Map<String, Any>) {
        reactContext?.let { context ->
            try {
                val params = Arguments.createMap().apply {
                    putInt("id", signal["id"] as? Int ?: 0)
                    putInt("ea", signal["ea"] as? Int ?: 0)
                    putString("asset", signal["asset"] as? String ?: "")
                    putString("latestupdate", signal["latestupdate"] as? String ?: "")
                    putString("type", signal["type"] as? String ?: "")
                    putString("action", signal["action"] as? String ?: "")
                    putDouble("price", (signal["price"] as? Double) ?: 0.0)
                    putDouble("tp", (signal["tp"] as? Double) ?: 0.0)
                    putDouble("sl", (signal["sl"] as? Double) ?: 0.0)
                    putString("time", signal["time"] as? String ?: "")
                    putString("results", signal["results"] as? String ?: "")
                }

                // Send signal to React Native - it will do full validation
                // and decide if signal should be executed (duplicates, cooldown, symbol config)
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("backgroundSignalFound", params)

                Log.d(TAG, "✅ Signal sent to React Native: ${signal["asset"]}")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error sending signal to React Native", e)
            }
        } ?: Log.w(TAG, "⚠️ React context became unavailable")
    }
    
    // Function to bring app to foreground - called from React Native when signal will be executed
    fun bringAppToForeground() {
        Log.d(TAG, "📱 Bringing app to foreground (requested by React Native)")
        try {
            val mainIntent = Intent(this@BackgroundMonitoringService, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            startActivity(mainIntent)
            Log.d(TAG, "✅ App brought to foreground successfully")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error bringing app to foreground: ${e.message}", e)
            // Fallback: try with application context
            try {
                val fallbackIntent = Intent(applicationContext, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    action = Intent.ACTION_MAIN
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }
                applicationContext.startActivity(fallbackIntent)
                Log.d(TAG, "✅ App brought to foreground using fallback (applicationContext)")
            } catch (fallbackError: Exception) {
                Log.e(TAG, "❌ Fallback also failed: ${fallbackError.message}", fallbackError)
            }
        }
    }

}
