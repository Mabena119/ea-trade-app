package app.eatrade.automated.forex.trading.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayWindowModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var overlayView: View? = null
    private var windowManager: WindowManager? = null
    private var params: WindowManager.LayoutParams? = null

    override fun getName(): String {
        return "OverlayWindowModule"
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        val context = reactApplicationContext
        val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
        promise.resolve(hasPermission)
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        val context = reactApplicationContext
        val activity = currentActivity
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:${context.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                
                if (activity != null) {
                    activity.startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST_CODE)
                    promise.resolve(false)
                } else {
                    context.startActivity(intent)
                    promise.resolve(false)
                }
            } else {
                promise.resolve(true)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun showOverlay(x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        val context = reactApplicationContext
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            promise.reject("PERMISSION_DENIED", "Overlay permission not granted")
            return
        }

        try {
            windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            
            val layoutParamsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            params = WindowManager.LayoutParams(
                width,
                height,
                layoutParamsType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                this.x = x
                this.y = y
            }

            overlayView = FrameLayout(context).apply {
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
            }

            windowManager?.addView(overlayView, params)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_ERROR", "Failed to show overlay: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateOverlayPosition(x: Int, y: Int, promise: Promise) {
        try {
            params?.x = x
            params?.y = y
            overlayView?.let { view ->
                windowManager?.updateViewLayout(view, params)
                promise.resolve(true)
            } ?: promise.reject("NO_OVERLAY", "Overlay not shown")
        } catch (e: Exception) {
            promise.reject("UPDATE_ERROR", "Failed to update overlay: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateOverlaySize(width: Int, height: Int, promise: Promise) {
        try {
            params?.width = width
            params?.height = height
            overlayView?.let { view ->
                windowManager?.updateViewLayout(view, params)
                promise.resolve(true)
            } ?: promise.reject("NO_OVERLAY", "Overlay not shown")
        } catch (e: Exception) {
            promise.reject("UPDATE_ERROR", "Failed to update overlay size: ${e.message}", e)
        }
    }

    @ReactMethod
    fun hideOverlay(promise: Promise) {
        try {
            overlayView?.let { view ->
                windowManager?.removeView(view)
                overlayView = null
                params = null
                promise.resolve(true)
            } ?: promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("HIDE_ERROR", "Failed to hide overlay: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getOverlayViewTag(promise: Promise) {
        overlayView?.let { view ->
            promise.resolve(view.id)
        } ?: promise.reject("NO_OVERLAY", "Overlay not shown")
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        hideOverlay(object : Promise {
            override fun resolve(value: Any?) {}
            override fun reject(code: String?, message: String?) {}
            override fun reject(code: String?, throwable: Throwable?) {}
            override fun reject(code: String?, message: String?, throwable: Throwable?) {}
            override fun reject(throwable: Throwable?) {}
            override fun reject(code: String?, message: String?, userInfo: WritableMap?, throwable: Throwable?) {}
        })
    }

    companion object {
        const val OVERLAY_PERMISSION_REQUEST_CODE = 1001
    }
}

