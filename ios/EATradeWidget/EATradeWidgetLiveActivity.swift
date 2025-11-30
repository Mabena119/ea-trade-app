//
//  EATradeWidgetLiveActivity.swift
//  EATradeWidget
//
//  Created by Silvinho Mabena on 2025/11/28.
//

import ActivityKit
import WidgetKit
import SwiftUI
import UIKit

// EATradeWidgetAttributes is defined in EATrade/EATradeWidgetAttributes.swift (shared file)

struct EATradeWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EATradeWidgetAttributes.self) { context in
            // Debug: Log the image local path
            let _ = print("🎨 Live Activity rendering - botName: \(context.state.botName), isActive: \(context.state.isActive), imageLocalPath: \(context.state.botImageLocalPath ?? "nil")")
            
            // Create a unique button ID that changes on every render to force recreation
            // This ensures buttons remain interactive even after moving away and coming back
            let timestamp = Date().timeIntervalSince1970
            let buttonID = "\(context.state.botName)_\(context.state.isPaused)_\(context.state.isActive)_\(Int(timestamp * 1000) % 10000)"
            
            // Create a fresh intent instance on every render to ensure it's always valid
            // This is critical for maintaining functionality when app is backgrounded
            let toggleIntent = ToggleBotIntent()
            
            // Notification Center UI (like music app)
            HStack(spacing: 12) {
                    // Bot Icon
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 44, height: 44)
                    
                    // Status dot next to image (green when active, orange when paused)
                    if context.state.isActive {
                        ZStack {
                            Circle()
                                .fill(context.state.isPaused ? Color.orange : Color.green)
                                .frame(width: 12, height: 12)
                                .shadow(color: (context.state.isPaused ? Color.orange : Color.green).opacity(0.6), radius: 3, x: 0, y: 0)
                            
                            Circle()
                                .stroke(Color.black.opacity(0.3), lineWidth: 2)
                                .frame(width: 12, height: 12)
                        }
                        .offset(x: 16, y: -16)
                    }
                    
                    Group {
                        // Construct image path from App Group container
                        let appGroupIdentifier = "group.app.eatrade.automated.forex.trading.app"
                        let imageFileName = "botImage.png"
                        
                        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier),
                           let imageFilename = context.state.botImageLocalPath, !imageFilename.isEmpty {
                            let imageURL = containerURL.appendingPathComponent(imageFilename)
                            if let image = UIImage(contentsOfFile: imageURL.path) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 44, height: 44)
                                    .clipped()
                                    .clipShape(Circle())
                            } else {
                                // Fallback: try default filename
                                let defaultImageURL = containerURL.appendingPathComponent(imageFileName)
                                if let image = UIImage(contentsOfFile: defaultImageURL.path) {
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 44, height: 44)
                                        .clipped()
                                        .clipShape(Circle())
                                } else {
                                    Image(systemName: "chart.line.uptrend.xyaxis")
                                        .font(.system(size: 20))
                                        .foregroundColor(.white)
                                }
                            }
                        } else {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                                .font(.system(size: 20))
                                .foregroundColor(.white)
                        }
                    }
                }
                
                // Bot Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.botName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                    
                    HStack(spacing: 4) {
                        Circle()
                            .fill(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                            .frame(width: 6, height: 6)
                        
                        Text(context.state.isActive ? (context.state.isPaused ? "PAUSED" : "ACTIVE") : "INACTIVE")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                    }
                }
                
                Spacer()
                
                // Control Buttons
                HStack(spacing: 8) {
                    // Use the fresh intent instance created at the top level
                    // This ensures the intent is always valid and not stale
                    Button(intent: toggleIntent) {
                        Image(systemName: context.state.isPaused ? "play.fill" : "stop.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(
                                Circle()
                                    .fill(context.state.isPaused ? Color.green : Color.red)
                            )
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .id("toggleButton_nc_\(buttonID)")
                    .allowsHitTesting(true)
                    .disabled(false)
                    
                    Button(intent: OpenQuotesIntent()) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.white.opacity(0.15))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .activityBackgroundTint(Color.black.opacity(0.8))
            .activitySystemActionForegroundColor(Color.white)

        } dynamicIsland: { context in
            // Create a unique button ID that changes on every render to force recreation
            // This ensures buttons remain interactive even after moving away and coming back
            let timestamp = Date().timeIntervalSince1970
            let buttonID = "\(context.state.botName)_\(context.state.isPaused)_\(context.state.isActive)_\(Int(timestamp * 1000) % 10000)"
            
            // Create a fresh intent instance on every render to ensure it's always valid
            // This is critical for maintaining functionality when app is backgrounded
            let toggleIntent = ToggleBotIntent()
            
            return DynamicIsland {
                // Expanded UI - Leading region with bot icon only
                DynamicIslandExpandedRegion(.leading) {
                    // Bot Icon with status indicator
                    ZStack(alignment: .topTrailing) {
                        // Background circle with subtle gradient
                        Circle()
                            .fill(
                                LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color.white.opacity(0.2),
                                        Color.white.opacity(0.1)
                                    ]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 60, height: 60)
                            .overlay(
                                Circle()
                                    .stroke(Color.white.opacity(0.15), lineWidth: 1)
                            )
                        
                        // Bot image
                        let appGroupIdentifier = "group.app.eatrade.automated.forex.trading.app"
                        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier),
                           let imageFilename = context.state.botImageLocalPath, !imageFilename.isEmpty {
                            let imageURL = containerURL.appendingPathComponent(imageFilename)
                            if let image = UIImage(contentsOfFile: imageURL.path) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 60, height: 60)
                                    .clipped()
                                    .clipShape(Circle())
                            } else {
                                Image(systemName: "chart.line.uptrend.xyaxis")
                                    .font(.system(size: 30, weight: .medium))
                                    .foregroundColor(.white.opacity(0.9))
                                    .frame(width: 60, height: 60)
                            }
                        } else {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                                .font(.system(size: 30, weight: .medium))
                                .foregroundColor(.white.opacity(0.9))
                                .frame(width: 60, height: 60)
                        }
                        
                        // Status indicator dot with glow effect (green when active, orange when paused)
                        if context.state.isActive {
                            ZStack {
                                Circle()
                                    .fill(context.state.isPaused ? Color.orange : Color.green)
                                    .frame(width: 16, height: 16)
                                    .shadow(color: (context.state.isPaused ? Color.orange : Color.green).opacity(0.6), radius: 4, x: 0, y: 0)
                                
                                Circle()
                                    .stroke(Color.black.opacity(0.4), lineWidth: 2.5)
                                    .frame(width: 16, height: 16)
                            }
                            .offset(x: 4, y: -4)
                        }
                    }
                    .padding(.leading, 22)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                
                // Expanded UI - Trailing region with controls
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 12) {
                        // Use the fresh intent instance created at the top level
                        // This ensures the intent is always valid and not stale
                        Button(intent: toggleIntent) {
                            Image(systemName: context.state.isPaused ? "play.fill" : "stop.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 52, height: 52)
                                .background(
                                    Circle()
                                        .fill(
                                            LinearGradient(
                                                gradient: Gradient(colors: context.state.isPaused ? [
                                                    Color.green.opacity(0.95),
                                                    Color.green.opacity(0.85)
                                                ] : [
                                                    Color.red.opacity(0.95),
                                                    Color.red.opacity(0.85)
                                                ]),
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                )
                                .overlay(
                                    Circle()
                                        .stroke(Color.white.opacity(0.25), lineWidth: 1.5)
                                )
                                .shadow(color: (context.state.isPaused ? Color.green : Color.red).opacity(0.4), radius: 6, x: 0, y: 2)
                                .contentShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .id("toggleButton_di_\(buttonID)")
                        .allowsHitTesting(true)
                        .disabled(false)
                        
                        // Quotes button with improved styling
                        Button(intent: OpenQuotesIntent()) {
                            Image(systemName: "chart.bar.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 52, height: 52)
                                .background(
                                    Circle()
                                        .fill(
                                            LinearGradient(
                                                gradient: Gradient(colors: [
                                                    Color.white.opacity(0.2),
                                                    Color.white.opacity(0.1)
                                                ]),
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                )
                                .overlay(
                                    Circle()
                                        .stroke(Color.white.opacity(0.25), lineWidth: 1.5)
                                )
                                .contentShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .allowsHitTesting(true)
                    }
                    .padding(.trailing, 22)
                    .padding(.vertical, 4)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .allowsHitTesting(true)
                }
                
                // Expanded UI - Bottom region with bot name and status
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Spacer()
                        
                        // Bot name and status positioned on the right
                        VStack(alignment: .trailing, spacing: 6) {
                            Text(context.state.botName)
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                                .lineLimit(2)
                                .minimumScaleFactor(0.85)
                                .multilineTextAlignment(.trailing)
                            
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                                    .frame(width: 8, height: 8)
                                    .shadow(color: (context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red).opacity(0.5), radius: 2, x: 0, y: 0)
                                
                                Text(context.state.isActive ? (context.state.isPaused ? "PAUSED" : "ACTIVE") : "INACTIVE")
                                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                                    .foregroundColor(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                                    .tracking(1)
                            }
                        }
                        .padding(.trailing, 22)
                        .padding(.bottom, 8)
                    }
                }
            } compactLeading: {
                // Construct image path from App Group container
                let appGroupIdentifier = "group.app.eatrade.automated.forex.trading.app"
                if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier),
                   let imageFilename = context.state.botImageLocalPath, !imageFilename.isEmpty {
                    let imageURL = containerURL.appendingPathComponent(imageFilename)
                    if let image = UIImage(contentsOfFile: imageURL.path) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 32, height: 32)
                            .clipped()
                            .clipShape(Circle())
                    } else {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.system(size: 16))
                            .foregroundColor(.white)
                    }
                } else {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 16))
                        .foregroundColor(.white)
                }
            } compactTrailing: {
                Circle()
                    .fill(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                    .frame(width: 8, height: 8)
            } minimal: {
                // Construct image path from App Group container
                let appGroupIdentifier = "group.app.eatrade.automated.forex.trading.app"
                if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier),
                   let imageFilename = context.state.botImageLocalPath, !imageFilename.isEmpty {
                    let imageURL = containerURL.appendingPathComponent(imageFilename)
                    if let image = UIImage(contentsOfFile: imageURL.path) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 24, height: 24)
                            .clipped()
                            .clipShape(Circle())
                    } else {
                        Circle()
                            .fill(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                            .frame(width: 6, height: 6)
                    }
                } else {
                    Circle()
                        .fill(context.state.isActive ? (context.state.isPaused ? Color.orange : Color.green) : Color.red)
                        .frame(width: 6, height: 6)
                }
            }
            .keylineTint(Color.black.opacity(0.8))
        }
    }
}

extension EATradeWidgetAttributes {
    fileprivate static var preview: EATradeWidgetAttributes {
        EATradeWidgetAttributes(name: "EA TRADE")
    }
}

extension EATradeWidgetAttributes.ContentState {
    fileprivate static var active: EATradeWidgetAttributes.ContentState {
        EATradeWidgetAttributes.ContentState(botName: "EA TRADE", isActive: true, isPaused: false, botImageLocalPath: nil)
     }
     
     fileprivate static var inactive: EATradeWidgetAttributes.ContentState {
        EATradeWidgetAttributes.ContentState(botName: "EA TRADE", isActive: false, isPaused: false, botImageLocalPath: nil)
     }
}

#Preview("Notification", as: .content, using: EATradeWidgetAttributes.preview) {
   EATradeWidgetLiveActivity()
} contentStates: {
    EATradeWidgetAttributes.ContentState.active
    EATradeWidgetAttributes.ContentState.inactive
}
