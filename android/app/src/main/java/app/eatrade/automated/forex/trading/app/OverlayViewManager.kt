package app.eatrade.automated.forex.trading.app

import android.view.View
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class OverlayViewManager : SimpleViewManager<View>() {
    override fun getName(): String {
        return "OverlayView"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): View {
        return View(reactContext)
    }
}

