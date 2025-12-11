package app.eatrade.automated.forex.trading.app

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class BackgroundMonitoringModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val context = reactContext

    override fun getName(): String {
        return "BackgroundMonitoringModule"
    }

    @ReactMethod
    fun startMonitoring(licenseKey: String, promise: Promise) {
        try {
            Log.d("BackgroundMonitoring", "🚀 Starting monitoring from React Native")
            Log.d("BackgroundMonitoring", "📋 License Key: $licenseKey")
            
            val serviceIntent = Intent(context, BackgroundMonitoringService::class.java).apply {
                action = "START_MONITORING"
                putExtra("licenseKey", licenseKey)
                val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                format.timeZone = java.util.TimeZone.getTimeZone("UTC")
                putExtra("lastPollTime", format.format(java.util.Date()))
            }

            Log.d("BackgroundMonitoring", "📱 Android version: ${android.os.Build.VERSION.SDK_INT}")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                Log.d("BackgroundMonitoring", "🔄 Starting foreground service (Android O+)")
                context.startForegroundService(serviceIntent)
            } else {
                Log.d("BackgroundMonitoring", "🔄 Starting regular service (Android < O)")
                context.startService(serviceIntent)
            }

            // Set React context in service
            BackgroundMonitoringService.getInstance()?.setReactContext(context)
            Log.d("BackgroundMonitoring", "✅ React context set in service")

            promise.resolve(true)
            Log.d("BackgroundMonitoring", "✅ Monitoring started successfully - service should be running now")
        } catch (e: Exception) {
            Log.e("BackgroundMonitoring", "❌ Error starting monitoring", e)
            Log.e("BackgroundMonitoring", "❌ Error details: ${e.message}")
            Log.e("BackgroundMonitoring", "❌ Stack trace: ${e.stackTraceToString()}")
            promise.reject("ERROR", "Failed to start monitoring: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        try {
            Log.d("BackgroundMonitoring", "Stopping monitoring from React Native")
            
            val serviceIntent = Intent(context, BackgroundMonitoringService::class.java).apply {
                action = "STOP_MONITORING"
            }
            context.stopService(serviceIntent)

            promise.resolve(true)
            Log.d("BackgroundMonitoring", "Monitoring stopped successfully")
        } catch (e: Exception) {
            Log.e("BackgroundMonitoring", "Error stopping monitoring", e)
            promise.reject("ERROR", "Failed to stop monitoring: ${e.message}", e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        val isRunning = BackgroundMonitoringService.getInstance() != null
        promise.resolve(isRunning)
    }

    @ReactMethod
    fun bringAppToForeground(promise: Promise) {
        try {
            Log.d("BackgroundMonitoring", "📱 Bringing app to foreground (called from React Native)")
            
            val service = BackgroundMonitoringService.getInstance()
            if (service != null) {
                service.bringAppToForeground()
                promise.resolve(true)
                Log.d("BackgroundMonitoring", "✅ App brought to foreground via service")
            } else {
                // Service not running, try direct intent
                Log.d("BackgroundMonitoring", "⚠️ Service not running, using direct intent")
                val mainIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    action = Intent.ACTION_MAIN
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }
                context.startActivity(mainIntent)
                promise.resolve(true)
                Log.d("BackgroundMonitoring", "✅ App brought to foreground via direct intent")
            }
        } catch (e: Exception) {
            Log.e("BackgroundMonitoring", "❌ Error bringing app to foreground", e)
            promise.reject("ERROR", "Failed to bring app to foreground: ${e.message}", e)
        }
    }

}
