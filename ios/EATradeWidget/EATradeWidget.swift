import WidgetKit
import SwiftUI

struct EATradeWidget: Widget {
    let kind: String = "EATradeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: EATradeWidgetProvider()) { entry in
            EATradeWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("EA Trade Control")
        .description("Control your trading bot from the notification center")
        .supportedFamilies([.systemMedium])
    }
}

struct EATradeWidgetProvider: TimelineProvider {
    typealias Entry = EATradeWidgetEntry
    
    func placeholder(in context: Context) -> EATradeWidgetEntry {
        EATradeWidgetEntry(
            date: Date(),
            botName: "EA TRADE",
            isActive: true,
            botImage: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (EATradeWidgetEntry) -> ()) {
        let entry = EATradeWidgetEntry(
            date: Date(),
            botName: getBotName(),
            isActive: getBotActiveState(),
            botImage: nil
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = EATradeWidgetEntry(
            date: Date(),
            botName: getBotName(),
            isActive: getBotActiveState(),
            botImage: nil
        )
        
        // Update every 5 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    private func getBotName() -> String {
        if let sharedDefaults = UserDefaults(suiteName: "group.app.eatrade.automated.forex.trading.app") {
            return sharedDefaults.string(forKey: "botName") ?? "EA TRADE"
        }
        return "EA TRADE"
    }
    
    private func getBotActiveState() -> Bool {
        if let sharedDefaults = UserDefaults(suiteName: "group.app.eatrade.automated.forex.trading.app") {
            return sharedDefaults.bool(forKey: "isBotActive")
        }
        return false
    }
}

struct EATradeWidgetEntry: TimelineEntry {
    let date: Date
    let botName: String
    let isActive: Bool
    let botImage: String?
}

struct EATradeWidgetEntryView: View {
    var entry: EATradeWidgetProvider.Entry
    
    var body: some View {
        ZStack {
            // Background
            Color.black.opacity(0.8)
            
            HStack(spacing: 16) {
                // Bot Icon
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.1))
                        .frame(width: 56, height: 56)
                    
                    if entry.isActive {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 12, height: 12)
                            .offset(x: 20, y: -20)
                    }
                    
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 24))
                        .foregroundColor(.white)
                }
                
                // Bot Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.botName)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    
                    HStack(spacing: 6) {
                        Circle()
                            .fill(entry.isActive ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        
                        Text(entry.isActive ? "ACTIVE" : "INACTIVE")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(entry.isActive ? Color.green : Color.red)
                    }
                }
                
                Spacer()
                
                // Control Buttons
                HStack(spacing: 12) {
                    // Start/Stop Button
                    Button(intent: ToggleBotIntent()) {
                        Image(systemName: entry.isActive ? "stop.fill" : "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(entry.isActive ? .red : .green)
                            .frame(width: 44, height: 44)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                    
                    // Quotes Button
                    Button(intent: OpenQuotesIntent()) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                }
            }
            .padding()
        }
    }
}

#Preview(as: .systemMedium) {
    EATradeWidget()
} timeline: {
    EATradeWidgetEntry(
        date: Date(),
        botName: "EA TRADE",
        isActive: true,
        botImage: nil
    )
}
