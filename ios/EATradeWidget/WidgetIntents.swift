import AppIntents
import Foundation

struct ToggleBotIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Bot"
    static var description = IntentDescription("Start or stop the trading bot")
    
    func perform() async throws -> some IntentResult {
        // Open the app with a deep link to toggle bot
        if let url = URL(string: "myapp://toggle-bot") {
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}

struct OpenQuotesIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Quotes"
    static var description = IntentDescription("Open the quotes page")
    
    func perform() async throws -> some IntentResult {
        // Open the app with a deep link to quotes
        if let url = URL(string: "myapp://quotes") {
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}

