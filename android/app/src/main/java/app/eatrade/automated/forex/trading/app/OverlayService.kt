package app.eatrade.automated.forex.trading.app

import android.content.Context
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.*
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import androidx.core.content.ContextCompat
import android.content.SharedPreferences
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.RequestOptions

class OverlayService private constructor(private val context: Context) {
    private var windowManager: WindowManager? = null
    private var overlayView: ImageView? = null
    private var params: WindowManager.LayoutParams? = null
    private var isShowing = false
    private val prefs: SharedPreferences = context.getSharedPreferences("overlay_widget", Context.MODE_PRIVATE)
    private var currentBotImageURL: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        @Volatile
        private var INSTANCE: OverlayService? = null

        fun getInstance(context: Context): OverlayService {
            return INSTANCE ?: synchronized(this) {
                val instance = OverlayService(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }
    }

    init {
        windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    // Helper function to extract foreground from AdaptiveIconDrawable (removes circular background)
    private fun extractForegroundDrawable(drawable: Drawable?): Drawable? {
        return when (drawable) {
            is AdaptiveIconDrawable -> {
                // Extract just the foreground layer (the actual icon without circular background)
                drawable.foreground
            }
            else -> drawable
        }
    }

    // Helper function to load default app icon
    private fun loadDefaultIcon(imageView: ImageView) {
        try {
            val resources = context.resources
            val iconId = resources.getIdentifier("icon", "mipmap", context.packageName)
            val rawDrawable = if (iconId != 0) {
                ContextCompat.getDrawable(context, iconId)
            } else {
                ContextCompat.getDrawable(context, context.applicationInfo.icon)
            }
            // Extract foreground to remove circular background from adaptive icons
            val foregroundDrawable = extractForegroundDrawable(rawDrawable)
            if (foregroundDrawable != null) {
                imageView.setImageDrawable(foregroundDrawable)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun showOverlay(x: Int, y: Int, width: Int, height: Int): Boolean {
        // If overlay is already showing, don't recreate it - preserve current position
        if (isShowing && overlayView != null && params != null) {
            android.util.Log.d("OverlayService", "Overlay already showing at position (${params?.x}, ${params?.y}), skipping recreation to preserve position")
            // Ensure position is saved
            val currentX = params?.x ?: x
            val currentY = params?.y ?: y
            prefs.edit().putInt("overlayX", currentX).putInt("overlayY", currentY).commit()
            return true
        }
        
        if (isShowing) {
            hideOverlay()
        }

        // All view operations must happen on main thread
        var success = false
        val latch = java.util.concurrent.CountDownLatch(1)
        
        mainHandler.post {
            try {
                val density = context.resources.displayMetrics.density
                val maxIconSize = (52 * density).toInt() // Reduced size for a more compact look
                val cornerRadius = (8 * density) // Rounded corners radius
                
                // Always prioritize saved position over passed parameters
                // Check if we have a saved position first
                val hasSavedPosition = prefs.contains("overlayX") && prefs.contains("overlayY")
                val savedX = if (hasSavedPosition) prefs.getInt("overlayX", x) else x
                val savedY = if (hasSavedPosition) prefs.getInt("overlayY", y) else y
                
                android.util.Log.d("OverlayService", "showOverlay: hasSavedPosition=$hasSavedPosition, savedX=$savedX, savedY=$savedY, passedX=$x, passedY=$y")
                
                // Create simple ImageView - no background, rounded corners, wrap content
                val imageView = ImageView(context).apply {
                    // Use WRAP_CONTENT to allow image to display with natural size/aspect ratio
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    adjustViewBounds = true
                    
                    // Set max dimensions but allow natural aspect ratio
                    maxWidth = maxIconSize
                    maxHeight = maxIconSize
                    
                    // Try to load bot image URL if available, otherwise use default app icon
                    val savedBotImageURL = prefs.getString("botImageURL", null)
                    val botImageURLToLoad = savedBotImageURL ?: currentBotImageURL
                    android.util.Log.d("OverlayService", "showOverlay: savedBotImageURL=$savedBotImageURL, currentBotImageURL=$currentBotImageURL, botImageURLToLoad=$botImageURLToLoad")
                    
                    if (!botImageURLToLoad.isNullOrEmpty()) {
                        // Load bot image from URL - we're already on main thread
                        android.util.Log.d("OverlayService", "Loading bot image from URL: $botImageURLToLoad")
                        try {
                            Glide.with(context)
                                .load(botImageURLToLoad)
                                .apply(
                                    RequestOptions()
                                        .diskCacheStrategy(DiskCacheStrategy.ALL)
                                        .fitCenter()
                                        .dontTransform()
                                )
                                .into(this)
                            currentBotImageURL = botImageURLToLoad
                            android.util.Log.d("OverlayService", "Bot image loading initiated")
                        } catch (e: Exception) {
                            android.util.Log.e("OverlayService", "Error loading bot image, falling back to default", e)
                            e.printStackTrace()
                            // Fallback to app icon on error
                            loadDefaultIcon(this)
                        }
                    } else {
                        android.util.Log.d("OverlayService", "No bot image URL available, loading default icon")
                        // Load default app icon
                        loadDefaultIcon(this)
                    }
                    
                    // Absolutely no background - completely transparent
                    background = null
                    setBackgroundColor(0x00000000)
                    
                    // Add rounded corners with clipToOutline
                    clipToOutline = true
                    outlineProvider = object : ViewOutlineProvider() {
                        override fun getOutline(view: View, outline: Outline) {
                            outline.setRoundRect(0, 0, view.width, view.height, cornerRadius)
                        }
                    }
                    
                    // No padding
                    setPadding(0, 0, 0, 0)
                    
                    elevation = (12 * density)
                }
                
                // Post to set outline after view is measured
                imageView.post {
                    imageView.invalidateOutline()
                }
                
                // Window params - use WRAP_CONTENT to allow natural image size
                params = WindowManager.LayoutParams().apply {
                    this.width = WindowManager.LayoutParams.WRAP_CONTENT
                    this.height = WindowManager.LayoutParams.WRAP_CONTENT
                    this.x = savedX
                    this.y = savedY
                    type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    } else {
                        @Suppress("DEPRECATION")
                        WindowManager.LayoutParams.TYPE_PHONE
                    }
                    format = PixelFormat.TRANSLUCENT
                    flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED or
                            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    gravity = Gravity.TOP or Gravity.START
                }
                
                // Make draggable with smooth animations
                var isDragging = false
                val screenWidth = context.resources.displayMetrics.widthPixels
                val screenHeight = context.resources.displayMetrics.heightPixels
                val iconSize = (52 * context.resources.displayMetrics.density).toInt()
                
                imageView.setOnTouchListener(object : View.OnTouchListener {
                    private var initialX = 0
                    private var initialY = 0
                    private var initialTouchX = 0f
                    private var initialTouchY = 0f

                    override fun onTouch(v: View, event: MotionEvent): Boolean {
                        when (event.action) {
                            MotionEvent.ACTION_DOWN -> {
                                initialX = params?.x ?: 0
                                initialY = params?.y ?: 0
                                initialTouchX = event.rawX
                                initialTouchY = event.rawY
                                isDragging = false
                                
                                // Smooth scale down on touch
                                imageView.animate()
                                    .scaleX(0.95f)
                                    .scaleY(0.95f)
                                    .setDuration(150)
                                    .setInterpolator(DecelerateInterpolator())
                                    .start()
                                
                                return true
                            }
                            MotionEvent.ACTION_MOVE -> {
                                val deltaX = Math.abs(event.rawX - initialTouchX)
                                val deltaY = Math.abs(event.rawY - initialTouchY)
                                if (deltaX > 1 || deltaY > 1) {
                                    if (!isDragging) {
                                        isDragging = true
                                    }
                                    
                                    // Calculate new position - completely free movement
                                    val newX = initialX + (event.rawX - initialTouchX).toInt()
                                    val newY = initialY + (event.rawY - initialTouchY).toInt()
                                    
                                    // Use immediate non-blocking update for smooth real-time dragging
                                    updatePositionImmediate(newX, newY)
                                }
                                return true
                            }
                            MotionEvent.ACTION_UP -> {
                                // Smooth scale back up
                                imageView.animate()
                                    .scaleX(1.0f)
                                    .scaleY(1.0f)
                                    .setDuration(150)
                                    .setInterpolator(DecelerateInterpolator())
                                    .start()
                                
                                // Ensure final position is saved persistently
                                if (isDragging && params != null) {
                                    val finalX = params?.x ?: 0
                                    val finalY = params?.y ?: 0
                                    prefs.edit().putInt("overlayX", finalX).putInt("overlayY", finalY).commit()
                                    android.util.Log.d("OverlayService", "Final position saved after drag: x=$finalX, y=$finalY")
                                }
                                
                                // Do nothing on click (as requested)
                                return true
                            }
                        }
                        return false
                    }
                })

                windowManager?.addView(imageView, params)
                overlayView = imageView
                isShowing = true
                success = true
                latch.countDown()
            } catch (e: Exception) {
                android.util.Log.e("OverlayService", "Error in showOverlay", e)
                e.printStackTrace()
                success = false
                latch.countDown()
            }
        }
        
        // Wait for main thread operation to complete (with timeout)
        try {
            latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            android.util.Log.e("OverlayService", "Timeout waiting for overlay creation", e)
        }
        
        return success
    }

    // Non-blocking position update for smooth dragging
    private fun updatePositionImmediate(x: Int, y: Int) {
        if (!isShowing || params == null) return
        
        // Save position immediately (can be done from any thread)
        prefs.edit().putInt("overlayX", x).putInt("overlayY", y).apply()
        
        // WindowManager operations must happen on main thread - fire and forget for smooth dragging
        mainHandler.post {
            try {
                params?.x = x
                params?.y = y
                windowManager?.updateViewLayout(overlayView, params)
            } catch (e: Exception) {
                android.util.Log.e("OverlayService", "Error updating position on main thread", e)
            }
        }
    }

    fun updatePosition(x: Int, y: Int): Boolean {
        if (!isShowing || params == null) return false
        
        // Save position immediately (can be done from any thread)
        prefs.edit().putInt("overlayX", x).putInt("overlayY", y).commit()
        android.util.Log.d("OverlayService", "Position saved: x=$x, y=$y")
        
        // WindowManager operations must happen on main thread
        var success = false
        val latch = java.util.concurrent.CountDownLatch(1)
        
        mainHandler.post {
            try {
                params?.x = x
                params?.y = y
                windowManager?.updateViewLayout(overlayView, params)
                success = true
                latch.countDown()
            } catch (e: Exception) {
                android.util.Log.e("OverlayService", "Error updating position on main thread", e)
                e.printStackTrace()
                success = false
                latch.countDown()
            }
        }
        
        // Wait briefly for the update to complete
        try {
            latch.await(500, java.util.concurrent.TimeUnit.MILLISECONDS)
        } catch (e: InterruptedException) {
            android.util.Log.e("OverlayService", "Timeout waiting for position update", e)
        }
        
        return success
    }


    fun updateSize(width: Int, height: Int): Boolean {
        // Do nothing - size is fixed and should not change
        return true
    }

    fun hideOverlay(): Boolean {
        if (!isShowing || overlayView == null) return false
        try {
            windowManager?.removeView(overlayView)
            overlayView = null
            params = null
            isShowing = false
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }

    fun getOverlayViewTag(): Int {
        return overlayView?.id ?: -1
    }

    fun updateOverlayData(botName: String, isActive: Boolean, isPaused: Boolean, botImageURL: String?) {
        android.util.Log.d("OverlayService", "updateOverlayData called: botName=$botName, isActive=$isActive, botImageURL=$botImageURL, overlayShowing=$isShowing")
        
        // Store the current image URL for persistence
        // Only update if we have a valid URL, or if bot is being stopped (clear URL)
        if (botImageURL != null && botImageURL.isNotEmpty()) {
            currentBotImageURL = botImageURL
            prefs.edit().putString("botImageURL", botImageURL).apply()
            android.util.Log.d("OverlayService", "Saved botImageURL to preferences: $botImageURL")
        } else if (!isActive) {
            // Only clear URL if bot is being stopped
            currentBotImageURL = null
            prefs.edit().remove("botImageURL").apply()
            android.util.Log.d("OverlayService", "Bot stopped, cleared botImageURL from preferences")
        } else {
            // Bot is active but no URL provided - keep existing URL if available
            android.util.Log.d("OverlayService", "Bot active but no URL provided, keeping existing URL if available")
        }
        
        // Update overlay if it's currently showing
        overlayView?.let { imageView ->
            android.util.Log.d("OverlayService", "Overlay is showing, updating image...")
            try {
                // Use provided URL, or fall back to saved URL, or use default icon
                val urlToLoad = if (!botImageURL.isNullOrEmpty()) {
                    botImageURL
                } else if (!currentBotImageURL.isNullOrEmpty()) {
                    android.util.Log.d("OverlayService", "No URL provided, using saved URL: $currentBotImageURL")
                    currentBotImageURL
                } else {
                    null
                }
                
                if (!urlToLoad.isNullOrEmpty()) {
                    android.util.Log.d("OverlayService", "Loading bot image from URL: $urlToLoad")
                    // Load robot image from URL using Glide - must run on main thread
                    mainHandler.post {
                        try {
                            Glide.with(context)
                                .load(urlToLoad)
                                .apply(
                                    RequestOptions()
                                        .diskCacheStrategy(DiskCacheStrategy.ALL)
                                        .fitCenter()
                                        .dontTransform() // Don't apply any transformations (like circular crop)
                                )
                                .into(imageView)
                            android.util.Log.d("OverlayService", "Bot image loading initiated on main thread")
                        } catch (e: Exception) {
                            android.util.Log.e("OverlayService", "Error loading bot image on main thread", e)
                            e.printStackTrace()
                            loadDefaultIcon(imageView)
                        }
                    }
                } else {
                    android.util.Log.d("OverlayService", "No bot image URL available, loading default icon")
                    // Fallback to app icon if no URL provided - extract foreground to remove circular background
                    mainHandler.post {
                        loadDefaultIcon(imageView)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("OverlayService", "Error loading bot image", e)
                e.printStackTrace()
                // On error, show fallback icon - extract foreground to remove circular background
                try {
                    loadDefaultIcon(imageView)
                } catch (fallbackError: Exception) {
                    android.util.Log.e("OverlayService", "Error loading default icon", fallbackError)
                    fallbackError.printStackTrace()
                }
            }
        } ?: run {
            android.util.Log.d("OverlayService", "Overlay not showing yet, URL saved for when overlay is shown")
        }
    }
}
