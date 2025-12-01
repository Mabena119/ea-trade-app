import WidgetKit
import AppIntents
import ActivityKit
import Foundation

// App Intents for widget buttons
struct ToggleBotIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Polling"
    
    func perform() async throws -> some IntentResult {
        // Access shared UserDefaults
        guard let sharedDefaults = UserDefaults(suiteName: "group.app.eatrade.automated.forex.trading.app") else {
            return .result()
        }
        
        // Get current pause state
        let currentIsPaused = sharedDefaults.bool(forKey: "isPaused")
        
        // Toggle the pause state
        let newIsPaused = !currentIsPaused
        sharedDefaults.set(newIsPaused, forKey: "isPaused")
        sharedDefaults.synchronize()
        
        // Send Darwin notification to wake up main app immediately
        let notificationName = CFNotificationName("com.eatrade.widgetPollingToggled" as CFString)
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterPostNotification(
            center,
            notificationName,
            nil,
            nil,
            true
        )
        
        // Update Live Activity immediately if available
        if #available(iOS 16.1, *) {
            let activities = Activity<EATradeWidgetAttributes>.activities
            if let activity = activities.first {
                let currentState = activity.contentState
                let updatedState = EATradeWidgetAttributes.ContentState(
                    botName: currentState.botName,
                    isActive: currentState.isActive,
                    isPaused: newIsPaused,
                    botImageLocalPath: currentState.botImageLocalPath
                )
                Task {
                    await activity.update(using: updatedState)
                }
            }
        }
        
        return .result()
    }
}

struct OpenQuotesIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Quotes"
    
    func perform() async throws -> some IntentResult {
        // Open the app with a deep link to quotes
        let url = URL(string: "myapp://quotes")!
        let openURLIntent = OpenURLIntent(url)
        _ = try await openURLIntent.perform()
        return .result()
    }
}
