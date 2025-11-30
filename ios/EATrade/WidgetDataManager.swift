import Foundation
import WidgetKit
import ActivityKit
import React
import UIKit

@objc(WidgetDataManager)
class WidgetDataManager: RCTEventEmitter {
    
    override static func moduleName() -> String! {
        return "WidgetDataManager"
    }
    
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    // Required for RCTEventEmitter
    override func supportedEvents() -> [String]! {
        return ["WidgetPollingToggled"]
    }
    
    // Store as Any? to avoid @available on stored property
    private var currentActivity: Any?
    
    // App Group identifier
    private let appGroupIdentifier = "group.app.eatrade.automated.forex.trading.app"
    private let imageFileName = "botImage.png"
    
    // Notification observer for widget button clicks
    private var notificationObserver: NSObjectProtocol?
    
    override init() {
        super.init()
        setupNotificationObserver()
    }
    
    deinit {
        // Remove CFNotificationCenter observer
        let notificationName = CFNotificationName("com.eatrade.widgetPollingToggled" as CFString)
        CFNotificationCenterRemoveObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),
            notificationName,
            nil
        )
    }
    
    // Setup observer for Darwin notifications from widget extension
    private func setupNotificationObserver() {
        // Listen for Darwin notifications using CFNotificationCenter
        // This works across app extensions and main app
        let notificationName = "com.eatrade.widgetPollingToggled" as CFString
        
        // C callback function for CFNotificationCenter
        let callback: @convention(c) (CFNotificationCenter?, UnsafeMutableRawPointer?, CFNotificationName?, UnsafeRawPointer?, CFDictionary?) -> Void = { (center, observer, name, object, userInfo) in
            // Get the WidgetDataManager instance from the observer pointer
            if let observer = observer {
                let manager = Unmanaged<WidgetDataManager>.fromOpaque(observer).takeUnretainedValue()
                manager.handleWidgetPollingToggled()
            }
        }
        
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),
            callback,
            notificationName,
            nil,
            .deliverImmediately
        )
    }
    
    // Handle widget polling toggle notification
    private func handleWidgetPollingToggled() {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            return
        }
        
        let isPaused = sharedDefaults.bool(forKey: "isPaused")
        
        // Send event to React Native
        DispatchQueue.main.async { [weak self] in
            self?.sendEvent(withName: "WidgetPollingToggled", body: ["isPaused": isPaused])
        }
    }
    
    // Get the shared container URL
    private var sharedContainerURL: URL? {
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
    }
    
    // Get the local image file path
    private var localImagePath: URL? {
        guard let containerURL = sharedContainerURL else { return nil }
        return containerURL.appendingPathComponent(imageFileName)
    }
    
    // Download and save image to shared container
    private func downloadAndSaveImage(from urlString: String, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: urlString) else {
            print("❌ Invalid image URL: \(urlString)")
            completion(nil)
            return
        }
        
        guard let containerURL = sharedContainerURL else {
            print("❌ Failed to access App Group container")
            completion(nil)
            return
        }
        
        let imagePath = containerURL.appendingPathComponent(imageFileName)
        
        // Download image asynchronously
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error = error {
                print("❌ Failed to download image: \(error.localizedDescription)")
                completion(nil)
                return
            }
            
            guard let data = data, let image = UIImage(data: data) else {
                print("❌ Invalid image data")
                completion(nil)
                return
            }
            
            // Save image to shared container
            do {
                // Convert to PNG data for better compatibility
                if let pngData = image.pngData() {
                    try pngData.write(to: imagePath)
                    print("✅ Image saved to: \(imagePath.path)")
                    completion(imagePath.path)
                } else {
                    print("❌ Failed to convert image to PNG")
                    completion(nil)
                }
            } catch {
                print("❌ Failed to save image: \(error.localizedDescription)")
                completion(nil)
            }
        }.resume()
    }
    
    @objc func updateWidgetData(_ botName: String, isActive: Bool, isPaused: Bool, botImageURL: String?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            reject("ERROR", "Failed to access shared UserDefaults", nil)
            return
        }
        
        sharedDefaults.set(botName, forKey: "botName")
        sharedDefaults.set(isActive, forKey: "isBotActive")
        sharedDefaults.set(isPaused, forKey: "isPaused")
        
            // Download and save image if URL is provided
        if let imageURL = botImageURL, !imageURL.isEmpty {
            print("📥 Downloading image from: \(imageURL)")
            downloadAndSaveImage(from: imageURL) { [weak self] localPath in
                guard let self = self else { return }
                
                if let path = localPath {
                    // Store just the filename (relative to App Group container)
                    // Both main app and widget extension can construct the full path
                    sharedDefaults.set(self.imageFileName, forKey: "botImageLocalPath")
                    print("✅ Image saved, filename: \(self.imageFileName), full path: \(path)")
                } else {
                    // If download fails, remove the local path
                    sharedDefaults.removeObject(forKey: "botImageLocalPath")
                    print("⚠️ Image download failed, using default icon")
                }
                
                // Also store the URL for reference (optional)
                sharedDefaults.set(imageURL, forKey: "botImageURL")
                sharedDefaults.synchronize()
                
                // Reload widget timeline
                WidgetCenter.shared.reloadTimelines(ofKind: "EATradeWidget")
                
                // Update Live Activity (iOS 16.1+)
                if #available(iOS 16.1, *) {
                    DispatchQueue.main.async {
                        // Pass filename to Live Activity (it will construct the path)
                        let imageFilename = sharedDefaults.string(forKey: "botImageLocalPath")
                        self.updateLiveActivity(botName: botName, isActive: isActive, isPaused: isPaused, botImageLocalPath: imageFilename)
                    }
                }
                
                resolve(true)
            }
        } else {
            // No image URL, remove local path
            sharedDefaults.removeObject(forKey: "botImageLocalPath")
            sharedDefaults.removeObject(forKey: "botImageURL")
            sharedDefaults.synchronize()
            
            // Reload widget timeline
            WidgetCenter.shared.reloadTimelines(ofKind: "EATradeWidget")
            
            // Update Live Activity (iOS 16.1+)
            if #available(iOS 16.1, *) {
                DispatchQueue.main.async {
                    self.updateLiveActivity(botName: botName, isActive: isActive, isPaused: isPaused, botImageLocalPath: nil)
                }
            }
            
            resolve(true)
        }
    }
    
    private func updateLiveActivity(botName: String, isActive: Bool, isPaused: Bool, botImageLocalPath: String?) {
        if #available(iOS 16.1, *) {
            print("📱 Updating Live Activity - botName: \(botName), isActive: \(isActive), isPaused: \(isPaused), imageLocalPath: \(botImageLocalPath ?? "nil")")
            let attributes = EATradeWidgetAttributes(name: botName)
            // Store local path in ContentState (we'll update the struct to use localPath instead of URL)
            let contentState = EATradeWidgetAttributes.ContentState(botName: botName, isActive: isActive, isPaused: isPaused, botImageLocalPath: botImageLocalPath)
            
            if isActive {
                // Start or update Live Activity
                if let activity = currentActivity as? Activity<EATradeWidgetAttributes> {
                    // Update existing activity
                    Task {
                        await activity.update(using: contentState)
                    }
                } else {
                    // Start new activity
                    if ActivityAuthorizationInfo().areActivitiesEnabled {
                        do {
                            let activity = try Activity<EATradeWidgetAttributes>.request(
                                attributes: attributes,
                                contentState: contentState,
                                pushType: nil
                            )
                            currentActivity = activity
                            print("Live Activity started: \(botName)")
                        } catch {
                            print("Failed to start Live Activity: \(error)")
                        }
                    } else {
                        print("Live Activities are not enabled")
                    }
                }
            } else {
                // End Live Activity
                if let activity = currentActivity as? Activity<EATradeWidgetAttributes> {
                    Task {
                        await activity.end(dismissalPolicy: .immediate)
                    }
                    currentActivity = nil
                    print("Live Activity ended")
                }
            }
        } else {
            print("Live Activities require iOS 16.1+")
        }
    }
    
    // Check if widget button was clicked and sync the pause state
    @objc func syncWidgetPollingState(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            reject("ERROR", "Failed to access shared UserDefaults", nil)
            return
        }
        
        // Check if widget button was clicked
        let widgetToggled = sharedDefaults.bool(forKey: "widgetPollingToggled")
        let isPaused = sharedDefaults.bool(forKey: "isPaused")
        
        if widgetToggled {
            // Clear the flag
            sharedDefaults.set(false, forKey: "widgetPollingToggled")
            sharedDefaults.synchronize()
            
            // Return the new pause state
            resolve(["isPaused": isPaused, "wasToggled": true])
        } else {
            // No change
            resolve(["isPaused": isPaused, "wasToggled": false])
        }
    }
}

