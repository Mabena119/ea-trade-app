package app.eatrade.automated.forex.trading.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class SignalMonitoringModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String {
        return "SignalMonitoringModule"
    }
    
    @ReactMethod
    fun startMonitoring(licenseKey: String, promise: Promise) {
        try {
            SignalMonitoringService.startService(reactApplicationContext, licenseKey)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to start signal monitoring: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        try {
            SignalMonitoringService.stopService(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to stop signal monitoring: ${e.message}", e)
        }
    }
}

