import Foundation
import React

@objc(WidgetDataManager)
class WidgetDataManager: NSObject {
    
    private let appGroupIdentifier = "group.app.eatrade.automated.forex.trading.app"
    
    @objc
    func updateWidgetData(_ botName: String, isActive: Bool, logoUrl: String?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            rejecter("ERROR", "Failed to access App Group", nil)
            return
        }
        
        sharedDefaults.set(botName, forKey: "widget_bot_name")
        sharedDefaults.set(isActive, forKey: "widget_bot_active")
        if let logoUrl = logoUrl {
            sharedDefaults.set(logoUrl, forKey: "widget_logo_url")
        } else {
            sharedDefaults.removeObject(forKey: "widget_logo_url")
        }
        
        // Reload widget timeline
        WidgetCenter.shared.reloadTimelines(ofKind: "EATradeWidget")
        
        resolver(true)
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}

