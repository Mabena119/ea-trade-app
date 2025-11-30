import Foundation
import ActivityKit

// This must match exactly the definition in EATradeWidgetLiveActivity.swift
struct EATradeWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var botName: String
        var isActive: Bool
        var isPaused: Bool // Added to track pause state
        var botImageLocalPath: String? // Changed from botImageURL to botImageLocalPath
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

