package app.eatrade.automated.forex.trading.app.overlay

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Outline
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * SYSTEM_ALERT_WINDOW overlay: circular EA logo (from [botImageURL] or app icon), draggable.
 */
class OverlayWindowModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var windowManager: WindowManager? = null
  private var overlayRoot: FrameLayout? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var logoView: ImageView? = null

  private var lastBotName: String = "EA Trade"
  private var lastPaused: Boolean = false
  private var lastBotImageUrl: String? = null

  private val imageLoadExecutor = Executors.newSingleThreadExecutor()
  private val logoLoadGeneration = AtomicInteger(0)

  override fun getName(): String = "OverlayWindowModule"

  private fun canDrawOverlays(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(reactApplicationContext)
    } else {
      true
    }

  @ReactMethod
  fun checkOverlayPermission(promise: Promise) {
    promise.resolve(canDrawOverlays())
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }
    if (Settings.canDrawOverlays(reactApplicationContext)) {
      promise.resolve(true)
      return
    }
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactApplicationContext.packageName}")
    ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    reactApplicationContext.startActivity(intent)
    promise.resolve(false)
  }

  @ReactMethod
  fun openAppNotificationSettings(promise: Promise) {
    try {
      val pkg = reactApplicationContext.packageName
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
          }
        } else {
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$pkg")
          }
        }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_NOTIF_SETTINGS", e.message, e)
    }
  }

  private fun applyCircleClip(iv: ImageView, diameterPx: Int) {
    iv.scaleType = ImageView.ScaleType.CENTER_CROP
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      iv.outlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          val w = if (view.width > 0) view.width else diameterPx
          val h = if (view.height > 0) view.height else diameterPx
          outline.setOval(0, 0, w, h)
        }
      }
      iv.clipToOutline = true
      iv.elevation = 10f
    }
  }

  private fun applyPausedAlpha() {
    logoView?.alpha = if (lastPaused) 0.55f else 1f
  }

  private fun loadLogoIntoView() {
    val iv = logoView ?: return
    val generation = logoLoadGeneration.incrementAndGet()
    val url = lastBotImageUrl?.trim().orEmpty()

    imageLoadExecutor.execute {
      val bmp: Bitmap? =
        try {
          if (url.isNotEmpty()) {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.instanceFollowRedirects = true
            conn.useCaches = false
            BitmapFactory.decodeStream(conn.inputStream)
          } else {
            null
          }
        } catch (_: Exception) {
          null
        }

      if (logoLoadGeneration.get() != generation) {
        bmp?.recycle()
        return@execute
      }

      UiThreadUtil.runOnUiThread {
        if (logoLoadGeneration.get() != generation) {
          bmp?.recycle()
          return@runOnUiThread
        }
        try {
          if (bmp != null) {
            iv.setImageBitmap(bmp)
          } else {
            val pm = reactApplicationContext.packageManager
            val icon = pm.getApplicationIcon(reactApplicationContext.packageName)
            iv.setImageDrawable(icon)
          }
        } catch (_: Exception) {
          iv.setImageResource(android.R.drawable.ic_dialog_info)
        }
      }
    }
  }

  private fun attachDrag(root: FrameLayout, wm: WindowManager, params: WindowManager.LayoutParams) {
    root.setOnTouchListener(object : View.OnTouchListener {
      private var initX = 0
      private var initY = 0
      private var downRawX = 0f
      private var downRawY = 0f

      override fun onTouch(v: View, e: MotionEvent): Boolean {
        when (e.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            initX = params.x
            initY = params.y
            downRawX = e.rawX
            downRawY = e.rawY
            return true
          }
          MotionEvent.ACTION_MOVE -> {
            params.x = initX + (e.rawX - downRawX).toInt()
            params.y = initY + (e.rawY - downRawY).toInt()
            try {
              wm.updateViewLayout(root, params)
            } catch (_: Exception) {
            }
            return true
          }
        }
        return false
      }
    })
  }

  @ReactMethod
  fun showOverlay(x: Double, y: Double, width: Double, height: Double, promise: Promise) {
    if (!canDrawOverlays()) {
      promise.resolve(false)
      return
    }
    UiThreadUtil.runOnUiThread {
      try {
        val ctx = reactApplicationContext
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        overlayRoot?.let { old ->
          try {
            wm.removeView(old)
          } catch (_: Exception) {
          }
        }
        overlayRoot = null
        logoView = null
        layoutParams = null

        val diameter = max(max(width.roundToInt(), height.roundToInt()), 96)

        val root = FrameLayout(ctx).apply {
          setBackgroundColor(android.graphics.Color.TRANSPARENT)
        }

        val iv = ImageView(ctx)
        val lpIv = FrameLayout.LayoutParams(diameter, diameter)
        iv.layoutParams = lpIv
        applyCircleClip(iv, diameter)
        logoView = iv
        root.addView(iv)

        val type =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
          }
        val params = WindowManager.LayoutParams(
          diameter,
          diameter,
          type,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
          PixelFormat.TRANSLUCENT
        ).apply {
          gravity = Gravity.TOP or Gravity.START
          this.x = x.roundToInt()
          this.y = y.roundToInt()
        }
        layoutParams = params
        attachDrag(root, wm, params)

        wm.addView(root, params)
        overlayRoot = root

        applyPausedAlpha()
        iv.contentDescription = lastBotName
        loadLogoIntoView()

        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("E_OVERLAY_SHOW", e.message, e)
      }
    }
  }

  @ReactMethod
  fun updateOverlayPosition(x: Double, y: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val lp = layoutParams
      val v = overlayRoot
      val wm = windowManager
      if (lp == null || v == null || wm == null) {
        promise.resolve(false)
        return@runOnUiThread
      }
      lp.x = x.roundToInt()
      lp.y = y.roundToInt()
      try {
        wm.updateViewLayout(v, lp)
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun updateOverlaySize(width: Double, height: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val lp = layoutParams
      val v = overlayRoot
      val wm = windowManager
      val iv = logoView
      if (lp == null || v == null || wm == null || iv == null) {
        promise.resolve(false)
        return@runOnUiThread
      }
      val diameter = max(max(width.roundToInt(), height.roundToInt()), 96)
      lp.width = diameter
      lp.height = diameter
      iv.layoutParams = FrameLayout.LayoutParams(diameter, diameter)
      applyCircleClip(iv, diameter)
      try {
        wm.updateViewLayout(v, lp)
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun hideOverlay(promise: Promise) {
    logoLoadGeneration.incrementAndGet()
    UiThreadUtil.runOnUiThread {
      try {
        overlayRoot?.let { v ->
          windowManager?.removeView(v)
        }
      } catch (_: Exception) {
      }
      overlayRoot = null
      logoView = null
      layoutParams = null
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun getOverlayViewTag(promise: Promise) {
    promise.resolve(-1)
  }

  @ReactMethod
  fun updateOverlayData(
    botName: String,
    isActive: Boolean,
    isPaused: Boolean,
    botImageURL: String?,
    promise: Promise
  ) {
    lastBotName = botName.ifBlank { "EA Trade" }
    lastPaused = isPaused
    val nextUrl = botImageURL?.trim()?.takeIf { it.isNotEmpty() }
    lastBotImageUrl = nextUrl

    UiThreadUtil.runOnUiThread {
      logoView?.contentDescription = lastBotName
      applyPausedAlpha()
      if (logoView != null) {
        loadLogoIntoView()
      }
      promise.resolve(true)
    }
  }
}
