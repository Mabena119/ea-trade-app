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
    private val overlayService: OverlayService = OverlayService.getInstance(reactContext)

    override fun getName(): String {
        return "OverlayWindowModule"
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        try {
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(reactApplicationContext)
            } else {
                true
            }
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check overlay permission: ${e.message}", e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            val activity = currentActivity
            if (activity == null) {
                promise.reject("ERROR", "Activity is null")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(reactApplicationContext)) {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${reactApplicationContext.packageName}")
                    )
                    activity.startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST_CODE)
                    promise.resolve(false)
                } else {
                    promise.resolve(true)
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to request overlay permission: ${e.message}", e)
        }
    }

    @ReactMethod
    fun showOverlay(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        try {
            val success = overlayService.showOverlay(x, y, width, height)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to show overlay: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateOverlayPosition(x: Int, y: Int, promise: Promise) {
        try {
            val success = overlayService.updatePosition(x, y)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to update overlay position: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateOverlaySize(width: Int, height: Int, promise: Promise) {
        try {
            val success = overlayService.updateSize(width, height)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to update overlay size: ${e.message}", e)
        }
    }

    @ReactMethod
    fun hideOverlay(promise: Promise) {
        try {
            val success = overlayService.hideOverlay()
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to hide overlay: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getOverlayViewTag(promise: Promise) {
        try {
            val viewTag = overlayService.getOverlayViewTag()
            promise.resolve(viewTag)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get overlay view tag: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateOverlayData(botName: String, isActive: Boolean, isPaused: Boolean, botImageURL: String?, promise: Promise) {
        try {
            overlayService.updateOverlayData(botName, isActive, isPaused, botImageURL)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to update overlay data: ${e.message}", e)
        }
    }

    companion object {
        const val OVERLAY_PERMISSION_REQUEST_CODE = 1001
    }
}

