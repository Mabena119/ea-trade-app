import WidgetKit
import AppIntents
import ActivityKit
import Foundation

// App Intents for widget buttons
// This intent is designed to work independently in the widget extension context
// It does not require a connection to the main app
struct ToggleBotIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Polling"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = true
    static var description = IntentDescription("Toggle bot polling state")
    
    // Execute without requiring MainActor to avoid connection context issues
    func perform() async throws -> some IntentResult {
        // Execute all operations independently to avoid connection context issues
        // This intent runs in the widget extension context, not the main app context
        // The "No ConnectionContext found" warning is expected - we work around it by executing directly
        
        // Log that we're starting - this helps debug if the intent is being called
        print("🚀 ToggleBotIntent: perform() called - starting execution")
        
        // Execute operations immediately without waiting for connection context
        // This ensures the intent works even when the app is backgrounded
        
        // Access shared UserDefaults
        guard let sharedDefaults = UserDefaults(suiteName: "group.app.eatrade.automated.forex.trading.app") else {
            print("❌ ToggleBotIntent: Failed to access shared UserDefaults")
            return .result()
        }
        
        // Get current pause state
        let currentIsPaused = sharedDefaults.bool(forKey: "isPaused")
        
        // Toggle the pause state
        let newIsPaused = !currentIsPaused
        sharedDefaults.set(newIsPaused, forKey: "isPaused")
        sharedDefaults.synchronize()
        
        print("✅ ToggleBotIntent: Updated isPaused to \(newIsPaused)")
        
        // Update Live Activity synchronously - this must complete before returning
        // This runs in the widget extension context and doesn't require app connection
        if #available(iOS 16.1, *) {
            do {
                let activities = Activity<EATradeWidgetAttributes>.activities
                if let activity = activities.first {
                    let currentState = activity.contentState
                    let updatedState = EATradeWidgetAttributes.ContentState(
                        botName: currentState.botName,
                        isActive: currentState.isActive,
                        isPaused: newIsPaused,
                        botImageLocalPath: currentState.botImageLocalPath
                    )
                    // Update the activity synchronously - this is safe in widget extension context
                    await activity.update(using: updatedState)
                    print("✅ ToggleBotIntent: Updated Live Activity to isPaused=\(newIsPaused)")
                } else {
                    print("⚠️ ToggleBotIntent: No active Live Activity found")
                }
            } catch {
                print("❌ ToggleBotIntent: Error updating Live Activity: \(error)")
                // Don't throw - we've already updated UserDefaults and posted notification
                // The UI will update when the app processes the Darwin notification
            }
        }
        
        // Send Darwin notification to wake up main app immediately
        // This ensures the main app updates its state even if Live Activity update failed
        let notificationName = CFNotificationName("com.eatrade.widgetPollingToggled" as CFString)
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterPostNotification(
            center,
            notificationName,
            nil,
            nil,
            true
        )
        
        print("✅ ToggleBotIntent: Posted Darwin notification")
        
        // Always return success - operations are independent of connection context
        // The "No ConnectionContext found" warning is expected and harmless
        // The intent executes successfully in the widget extension context
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
