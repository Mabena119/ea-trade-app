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
    
    private fun getCurrentISOTime(): String {
        val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return format.format(java.util.Date())
    }

    companion object {
        private const val TAG = "BackgroundMonitoring"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "background_monitoring_channel"
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
        this.reactContext = context
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Background Signal Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors trading signals in background"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("EA Trade - Monitoring Active")
            .setContentText("Monitoring trading signals in background")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
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
                    Log.d(TAG, "⏳ Waiting 10 seconds before next poll...")
                    Thread.sleep(10000) // Poll every 10 seconds
                } catch (e: InterruptedException) {
                    Log.d(TAG, "⏸️ Polling thread interrupted")
                    break
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Error in polling thread", e)
                    Thread.sleep(10000)
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
            val signalsArray = JSONArray(signalsResponse)

            if (signalsArray.length() > 0) {
                Log.d(TAG, "🎯 Found ${signalsArray.length()} new signals in background")
                
                // Process each signal
                for (i in 0 until signalsArray.length()) {
                    val signalJson = signalsArray.getJSONObject(i)
                    val signal = parseSignal(signalJson)
                    
                    Log.d(TAG, "📤 Processing signal: ${signal["asset"]} (${signal["action"]})")
                    
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

                Log.d(TAG, "📱 Bringing app to foreground for signal: ${signal["asset"]}")
                
                // Bring app to foreground when signal is found
                try {
                    val mainIntent = Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        action = Intent.ACTION_VIEW
                        data = android.net.Uri.parse("myapp://trade-signal")
                    }
                    context.startActivity(mainIntent)
                    Log.d(TAG, "✅ App brought to foreground successfully")
                } catch (e: Exception) {
                    Log.e(TAG, "Error bringing app to foreground", e)
                }

                // Send signal to React Native
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("backgroundSignalFound", params)

                Log.d(TAG, "✅ Signal sent to React Native: ${signal["asset"]}")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error sending signal to React Native", e)
            }
        } ?: Log.w(TAG, "⚠️ React context not available, cannot send signal")
    }

}
