import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), botName: "EA TRADE", isActive: true, logoUrl: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = loadWidgetData()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = loadWidgetData()
        let timeline = Timeline(entries: [entry], policy: .atEnd)
        completion(timeline)
    }
    
    private func loadWidgetData() -> SimpleEntry {
        let sharedDefaults = UserDefaults(suiteName: "group.app.eatrade.automated.forex.trading.app")
        let botName = sharedDefaults?.string(forKey: "widget_bot_name") ?? "EA TRADE"
        let isActive = sharedDefaults?.bool(forKey: "widget_bot_active") ?? false
        let logoUrl = sharedDefaults?.string(forKey: "widget_logo_url")
        
        return SimpleEntry(
            date: Date(),
            botName: botName,
            isActive: isActive,
            logoUrl: logoUrl
        )
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let botName: String
    let isActive: Bool
    let logoUrl: String?
}

struct EATradeWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        default:
            MediumWidgetView(entry: entry)
        }
    }
}

struct SmallWidgetView: View {
    var entry: SimpleEntry
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if let logoUrl = entry.logoUrl, let url = URL(string: logoUrl) {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .foregroundColor(.white)
                    }
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .foregroundColor(.white)
                        .font(.system(size: 24))
                }
                
                Spacer()
                
                Circle()
                    .fill(entry.isActive ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
            }
            
            Text(entry.botName)
                .font(.headline)
                .foregroundColor(.white)
                .lineLimit(1)
            
            Text(entry.isActive ? "ACTIVE" : "INACTIVE")
                .font(.caption)
                .foregroundColor(entry.isActive ? .green : .red)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(
                colors: [Color.black.opacity(0.8), Color.black.opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

struct MediumWidgetView: View {
    var entry: SimpleEntry
    
    var body: some View {
        HStack(spacing: 16) {
            // Logo
            if let logoUrl = entry.logoUrl, let url = URL(string: logoUrl) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .foregroundColor(.white)
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .foregroundColor(.white)
                    .font(.system(size: 32))
                    .frame(width: 56, height: 56)
            }
            
            // Info
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.botName)
                    .font(.headline)
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                HStack(spacing: 6) {
                    Circle()
                        .fill(entry.isActive ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    
                    Text(entry.isActive ? "ACTIVE" : "INACTIVE")
                        .font(.caption)
                        .foregroundColor(entry.isActive ? .green : .red)
                }
            }
            
            Spacer()
            
            // Controls
            HStack(spacing: 12) {
                Button(intent: ToggleBotIntent()) {
                    Image(systemName: entry.isActive ? "stop.fill" : "play.fill")
                        .foregroundColor(entry.isActive ? .red : .green)
                        .font(.system(size: 20))
                }
                .buttonStyle(.plain)
                
                Button(intent: OpenQuotesIntent()) {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .foregroundColor(.white)
                        .font(.system(size: 20))
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(
                colors: [Color.black.opacity(0.8), Color.black.opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

struct EATradeWidget: Widget {
    let kind: String = "EATradeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            EATradeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("EA Trade Bot")
        .description("Control your trading bot from the notification center")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemSmall) {
    EATradeWidget()
} timeline: {
    SimpleEntry(date: .now, botName: "HOSTED EA V1.1", isActive: true, logoUrl: nil)
    SimpleEntry(date: .now, botName: "HOSTED EA V1.1", isActive: false, logoUrl: nil)
}

