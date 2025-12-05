package app.eatrade.automated.forex.trading.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import android.app.ActivityManager
import android.content.ComponentName
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class SignalMonitoringService : Service() {
    private var isRunning = false
    private var scheduler: ScheduledExecutorService? = null
    private var currentLicenseKey: String? = null
    private var currentEA: String? = null
    private var lastPollTime: String? = null
    private val handler = Handler(Looper.getMainLooper())
    
    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "signal_monitoring_channel"
        private const val TAG = "SignalMonitoringService"
        private const val API_BASE_URL = "https://ea-trade-app.onrender.com"
        
        fun startService(context: Context, licenseKey: String) {
            val intent = Intent(context, SignalMonitoringService::class.java)
            intent.putExtra("licenseKey", licenseKey)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, SignalMonitoringService::class.java)
            context.stopService(intent)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.d(TAG, "SignalMonitoringService created")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val licenseKey = intent?.getStringExtra("licenseKey")
        Log.d(TAG, "onStartCommand called with licenseKey: $licenseKey, isRunning: $isRunning")
        if (licenseKey != null) {
            if (!isRunning) {
                currentLicenseKey = licenseKey
                lastPollTime = java.time.Instant.now().toString()
                startMonitoring()
            } else {
                Log.d(TAG, "Service already running, updating license key if different")
                if (currentLicenseKey != licenseKey) {
                    currentLicenseKey = licenseKey
                    lastPollTime = java.time.Instant.now().toString()
                }
            }
        } else {
            Log.w(TAG, "No license key provided in intent")
        }
        return START_STICKY // Restart if killed
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Signal Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors trading signals in the background"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun startMonitoring() {
        if (isRunning) return
        
        isRunning = true
        scheduler = Executors.newSingleThreadScheduledExecutor()
        
        // Start foreground service
        val notification = createNotification("Monitoring signals...", false)
        startForeground(NOTIFICATION_ID, notification)
        
        // Poll every 10 seconds - this will continue even when app is backgrounded
        scheduler?.scheduleAtFixedRate({
            try {
                Log.d(TAG, "Scheduled check triggered - polling for signals")
                checkForSignals()
            } catch (e: Exception) {
                Log.e(TAG, "Error in signal monitoring", e)
                e.printStackTrace()
            }
        }, 0, 10, TimeUnit.SECONDS)
        
        Log.d(TAG, "Signal monitoring started for license: $currentLicenseKey - will poll every 10 seconds")
    }
    
    private fun createNotification(text: String, isSignalFound: Boolean = false): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            if (isSignalFound) {
                putExtra("signalFound", true)
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("EA Trade Bot")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setAutoCancel(false)
            .setOngoing(!isSignalFound) // Don't make it ongoing when signal found so user can dismiss
            .setPriority(if (isSignalFound) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setDefaults(if (isSignalFound) NotificationCompat.DEFAULT_ALL else 0) // Sound/vibration when signal found
            .build()
    }
    
    private fun checkForSignals() {
        val licenseKey = currentLicenseKey ?: run {
            Log.w(TAG, "No license key available for checking signals")
            return
        }
        
        Log.d(TAG, "Checking for signals (background monitoring) - License: $licenseKey")
        
        // Get EA from license
        val ea = getEAFromLicense(licenseKey) ?: run {
            Log.w(TAG, "Could not get EA from license")
            return
        }
        currentEA = ea
        
        Log.d(TAG, "Found EA: $ea, checking for new signals...")
        
        // Get new signals
        val signals = getNewSignalsForEA(ea)
        
        Log.d(TAG, "Checked for signals - found ${signals.size} new signals")
        
        if (signals.isNotEmpty()) {
            Log.d(TAG, "Found ${signals.size} new signals - sending to React Native and bringing app to foreground")
            
            // Update notification to show signal found
            val signalCount = signals.size
            val notification = createNotification("Signal found! Tap to open app ($signalCount signal${if (signalCount > 1) "s" else ""})", true)
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.notify(NOTIFICATION_ID, notification)
            
            // Bring app to foreground when signal is found
            bringAppToForeground()
            
            // Send signals to React Native
            for (signal in signals) {
                sendSignalToReactNative(signal)
            }
        }
        
        // Update last poll time
        lastPollTime = java.time.Instant.now().toString()
        
        // Update notification with last check time (only if no signals found)
        if (signals.isEmpty()) {
            val timeStr = java.time.LocalTime.now().toString().substring(0, 5)
            val notification = createNotification("Monitoring signals... (Last: $timeStr)", false)
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.notify(NOTIFICATION_ID, notification)
        }
    }
    
    private fun getEAFromLicense(licenseKey: String): String? {
        return try {
            val url = URL("$API_BASE_URL/api/get-ea-from-license?licenseKey=${java.net.URLEncoder.encode(licenseKey, "UTF-8")}")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            
            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(response)
                json.optString("eaId", null)
            } else {
                Log.e(TAG, "Failed to get EA from license: HTTP $responseCode")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting EA from license", e)
            null
        }
    }
    
    private fun getNewSignalsForEA(ea: String): List<Map<String, String>> {
        return try {
            val since = lastPollTime ?: java.time.Instant.now().minusSeconds(3600).toString()
            val urlString = "$API_BASE_URL/api/get-new-signals?eaId=$ea&since=${java.net.URLEncoder.encode(since, "UTF-8")}"
            Log.d(TAG, "Fetching signals from: $urlString")
            
            val url = URL(urlString)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            
            val responseCode = connection.responseCode
            Log.d(TAG, "API response code: $responseCode")
            
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(response)
                val signalsArray = json.optJSONArray("signals") ?: return emptyList()
                
                val signals = mutableListOf<Map<String, String>>()
                for (i in 0 until signalsArray.length()) {
                    val signalObj = signalsArray.getJSONObject(i)
                    signals.add(mapOf(
                        "id" to signalObj.optString("id", ""),
                        "asset" to signalObj.optString("asset", ""),
                        "action" to signalObj.optString("action", ""),
                        "price" to signalObj.optString("price", ""),
                        "tp" to signalObj.optString("tp", ""),
                        "sl" to signalObj.optString("sl", ""),
                        "time" to signalObj.optString("time", ""),
                        "latestupdate" to signalObj.optString("latestupdate", "")
                    ))
                }
                Log.d(TAG, "Successfully fetched ${signals.size} signals from API")
                signals
            } else {
                Log.e(TAG, "Failed to get signals: HTTP $responseCode")
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting signals", e)
            e.printStackTrace()
            emptyList()
        }
    }
    
    private fun bringAppToForeground() {
        try {
            Log.d(TAG, "Bringing app to foreground - signal detected")
            
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                putExtra("signalFound", true)
            }
            
            startActivity(intent)
            Log.d(TAG, "App brought to foreground successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error bringing app to foreground", e)
            e.printStackTrace()
        }
    }
    
    private fun sendSignalToReactNative(signal: Map<String, String>) {
        handler.post {
            try {
                val app = applicationContext as? MainApplication
                val reactInstanceManager = app?.reactNativeHost?.reactInstanceManager
                val reactApplicationContext = reactInstanceManager?.currentReactContext
                
                if (reactApplicationContext != null) {
                    val params = Arguments.createMap().apply {
                        putString("id", signal["id"])
                        putString("asset", signal["asset"])
                        putString("action", signal["action"])
                        putString("price", signal["price"])
                        putString("tp", signal["tp"])
                        putString("sl", signal["sl"])
                        putString("time", signal["time"])
                        putString("latestupdate", signal["latestupdate"])
                        putString("type", "DATABASE_SIGNAL")
                        putString("source", "database")
                    }
                    
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("backgroundSignalFound", params)
                    
                    Log.d(TAG, "Signal sent to React Native: ${signal["id"]}")
                } else {
                    Log.w(TAG, "React context not available, will retry when context is ready")
                    // Try to get context again after a delay
                    handler.postDelayed({
                        sendSignalToReactNative(signal)
                    }, 2000)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending signal to React Native", e)
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        scheduler?.shutdown()
        isRunning = false
        Log.d(TAG, "SignalMonitoringService destroyed")
    }
}

