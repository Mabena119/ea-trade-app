package app.eatrade.automated.forex.trading.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayWindowModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private var overlayViewTag: Int = -1
    
    companion object {
        private const val OVERLAY_PERMISSION_REQUEST_CODE = 1001
        
        fun getOverlayService(context: Context): OverlayService {
            val service = OverlayService.getInstance()
            service.initialize(context)
            return service
        }
    }
    
    override fun getName(): String {
        return "OverlayWindowModule"
    }
    
    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        try {
            val context = reactApplicationContext
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", "Error checking overlay permission", e)
        }
    }
    
    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            val context = reactApplicationContext
            val activity = currentActivity
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(context)) {
                    if (activity != null) {
                        val intent = Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:${context.packageName}")
                        )
                        activity.startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST_CODE)
                        promise.resolve(false)
                    } else {
                        promise.resolve(false)
                    }
                } else {
                    promise.resolve(true)
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", "Error requesting overlay permission", e)
        }
    }
    
    @ReactMethod
    fun showOverlay(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        try {
            val context = reactApplicationContext
            
            // Check permission first
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                promise.resolve(false)
                return
            }
            
            // Get overlay service instance
            val service = getOverlayService(context)
            val success = service.showOverlay(x, y, width, height)
            if (success) {
                overlayViewTag = System.currentTimeMillis().toInt()
            }
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Error showing overlay", e)
        }
    }
    
    @ReactMethod
    fun hideOverlay(promise: Promise) {
        try {
            val context = reactApplicationContext
            val service = getOverlayService(context)
            val success = service.hideOverlay()
            if (success) {
                overlayViewTag = -1
            }
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Error hiding overlay", e)
        }
    }
    
    @ReactMethod
    fun updateOverlayPosition(x: Int, y: Int, promise: Promise) {
        try {
            val context = reactApplicationContext
            val service = getOverlayService(context)
            val success = service.updateOverlayPosition(x, y)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Error updating overlay position", e)
        }
    }
    
    @ReactMethod
    fun updateOverlaySize(width: Int, height: Int, promise: Promise) {
        try {
            val context = reactApplicationContext
            val service = getOverlayService(context)
            val success = service.updateOverlaySize(width, height)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Error updating overlay size", e)
        }
    }
    
    @ReactMethod
    fun getOverlayViewTag(promise: Promise) {
        promise.resolve(overlayViewTag)
    }
    
    @ReactMethod
    fun updateOverlayData(botName: String, isActive: Boolean, isPaused: Boolean, botImageURL: String?, promise: Promise) {
        try {
            val context = reactApplicationContext
            val service = getOverlayService(context)
            service.updateOverlayData(botName, isActive, isPaused, botImageURL)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Error updating overlay data", e)
        }
    }
}
