package app.eatrade.automated.forex.trading.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class OverlayService private constructor() {
    internal var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var isOverlayShowing = false
    
    private var currentX = 20
    private var currentY = 100
    private var currentWidth = 140
    private var currentHeight = 140
    
    private var botName: String = "EA Trade"
    private var isActive: Boolean = false
    private var isPaused: Boolean = false
    private var botImageURL: String? = null
    
    private val handler = Handler(Looper.getMainLooper())
    
    private var context: Context? = null
    
    fun initialize(context: Context) {
        this.context = context
        windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }
    
    private fun getContext(): Context {
        return context ?: throw IllegalStateException("OverlayService not initialized")
    }
    
    fun showOverlay(x: Int, y: Int, width: Int, height: Int): Boolean {
        val ctx = getContext()
        
        if (isOverlayShowing) {
            handler.post {
                updateOverlayPosition(x, y)
                updateOverlaySize(width, height)
            }
            return true
        }
        
        if (!Settings.canDrawOverlays(ctx)) {
            return false
        }
        
        // Ensure all UI operations happen on main thread
        var success = false
        val latch = java.util.concurrent.CountDownLatch(1)
        
        handler.post {
            try {
                currentX = x
                currentY = y
                currentWidth = width
                currentHeight = height
                
                val layoutInflater = LayoutInflater.from(ctx)
                overlayView = layoutInflater.inflate(R.layout.overlay_widget, null)
                
                // Setup drag functionality
                setupDragListener()
                
                // Update bot info first (before loading image)
                updateBotInfoSync()
                
                val params = WindowManager.LayoutParams(
                    currentWidth,
                    currentHeight,
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    } else {
                        @Suppress("DEPRECATION")
                        WindowManager.LayoutParams.TYPE_PHONE
                    },
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT
                )
                params.gravity = Gravity.TOP or Gravity.START
                params.x = currentX
                params.y = currentY
                
                windowManager?.addView(overlayView, params)
                isOverlayShowing = true
                
                // Load bot image after view is added
                loadBotImage()
                
                success = true
            } catch (e: Exception) {
                e.printStackTrace()
                success = false
            } finally {
                latch.countDown()
            }
        }
        
        // Wait for UI thread to complete (with timeout)
        try {
            latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
        
        return success
    }
    
    fun hideOverlay(): Boolean {
        if (!isOverlayShowing) {
            return true
        }
        
        var success = false
        val latch = java.util.concurrent.CountDownLatch(1)
        
        handler.post {
            try {
                overlayView?.let { view ->
                    windowManager?.removeView(view)
                }
                overlayView = null
                isOverlayShowing = false
                success = true
            } catch (e: Exception) {
                e.printStackTrace()
                success = false
            } finally {
                latch.countDown()
            }
        }
        
        try {
            latch.await(1, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
        
        return success
    }
    
    fun updateOverlayPosition(x: Int, y: Int): Boolean {
        if (!isOverlayShowing || overlayView == null) {
            return false
        }
        
        try {
            currentX = x
            currentY = y
            
            val params = overlayView?.layoutParams as? WindowManager.LayoutParams
            params?.let {
                it.x = x
                it.y = y
                // Ensure update happens on main thread
                handler.post {
                    windowManager?.updateViewLayout(overlayView, it)
                }
            }
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }
    
    fun updateOverlaySize(width: Int, height: Int): Boolean {
        if (!isOverlayShowing || overlayView == null) {
            return false
        }
        
        try {
            currentWidth = width
            currentHeight = height
            
            val params = overlayView?.layoutParams as? WindowManager.LayoutParams
            params?.let {
                it.width = width
                it.height = height
                // Ensure update happens on main thread
                handler.post {
                    windowManager?.updateViewLayout(overlayView, it)
                }
            }
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }
    
    fun updateOverlayData(name: String, active: Boolean, paused: Boolean, imageURL: String?) {
        botName = name
        isActive = active
        isPaused = paused
        botImageURL = imageURL
        
        if (isOverlayShowing) {
            handler.post {
                updateBotInfoSync()
                loadBotImage()
            }
        }
    }
    
    private fun setupDragListener() {
        overlayView?.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var initialTouchX = 0f
            private var initialTouchY = 0f
            
            override fun onTouch(v: View?, event: MotionEvent?): Boolean {
                when (event?.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = currentX
                        initialY = currentY
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val params = overlayView?.layoutParams as? WindowManager.LayoutParams
                        params?.let {
                            val deltaX = event.rawX - initialTouchX
                            val deltaY = event.rawY - initialTouchY
                            
                            it.x = (initialX + deltaX).toInt()
                            it.y = (initialY + deltaY).toInt()
                            
                            windowManager?.updateViewLayout(overlayView, it)
                            
                            currentX = it.x
                            currentY = it.y
                        }
                        return true
                    }
                }
                return false
            }
        })
    }
    
    private fun loadBotImage() {
        val view = overlayView ?: return
        if (view.parent == null) {
            // View not attached yet, skip loading
            return
        }
        
        val imageView = view.findViewById<ImageView>(R.id.overlay_bot_image)
        if (imageView == null) return
        
        // Load image in background thread
        Thread {
            var bitmap = if (botImageURL != null && botImageURL!!.isNotEmpty()) {
                loadImageFromURL(botImageURL!!)
            } else {
                null
            }
            
            // If no bitmap from URL, load default launcher icon
            if (bitmap == null) {
                try {
                    val ctx = getContext()
                    bitmap = BitmapFactory.decodeResource(ctx.resources, R.mipmap.ic_launcher)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            
            // Convert to circular bitmap
            val circularBitmap = if (bitmap != null) {
                try {
                    getCircularBitmap(bitmap)
                } catch (e: Exception) {
                    e.printStackTrace()
                    bitmap // Fallback to non-circular if error
                }
            } else {
                null
            }
            
            // Update UI on main thread
            handler.post {
                // Double-check view is still attached
                val currentView = overlayView
                if (currentView != null && currentView.parent != null) {
                    val currentImageView = currentView.findViewById<ImageView>(R.id.overlay_bot_image)
                    if (currentImageView != null) {
                        try {
                            if (circularBitmap != null) {
                                currentImageView.setImageBitmap(circularBitmap)
                            } else {
                                // Last resort: Use app logo resource directly
                                currentImageView.setImageResource(R.mipmap.ic_launcher)
                            }
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                }
            }
        }.start()
    }
    
    private fun loadImageFromURL(urlString: String): Bitmap? {
        try {
            // Handle relative URLs
            val fullURL = if (urlString.startsWith("http://") || urlString.startsWith("https://")) {
                urlString
            } else {
                // Remove leading slashes and prepend base URL
                val filename = urlString.trimStart('/')
                "https://www.eatrade.io/admin/uploads/$filename"
            }
            
            val url = URL(fullURL)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.doInput = true
            connection.connect()
            
            val inputStream: InputStream = connection.inputStream
            val bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()
            connection.disconnect()
            
            return bitmap
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }
    
    private fun getCircularBitmap(bitmap: Bitmap): Bitmap {
        val size = Math.min(bitmap.width, bitmap.height)
        val x = (bitmap.width - size) / 2
        val y = (bitmap.height - size) / 2
        
        val squaredBitmap = Bitmap.createBitmap(bitmap, x, y, size, size)
        if (squaredBitmap != bitmap) {
            bitmap.recycle()
        }
        
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        
        val paint = Paint()
        paint.isAntiAlias = true
        paint.shader = BitmapShader(squaredBitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        
        val radius = size / 2f
        canvas.drawCircle(radius, radius, radius, paint)
        
        squaredBitmap.recycle()
        
        return output
    }
    
    private fun updateBotInfoSync() {
        // Image-only overlay - no text to update
        // This function is kept for compatibility but does nothing
    }
    
    private fun updateBotInfo() {
        handler.post {
            updateBotInfoSync()
        }
    }
    
    companion object {
        @Volatile
        private var INSTANCE: OverlayService? = null
        
        fun getInstance(): OverlayService {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: OverlayService().also { INSTANCE = it }
            }
        }
    }
}
