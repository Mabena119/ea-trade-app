# iOS WidgetKit Extension Setup

This directory contains the iOS WidgetKit extension for the EA Trade app. The widget appears in the iOS notification center and allows users to control their trading bot.

## Files Created

1. **EATradeWidget.swift** - Main widget implementation with SwiftUI views
2. **EATradeWidgetBundle.swift** - Widget bundle entry point
3. **Info.plist** - Widget extension configuration
4. **EATradeWidget.entitlements** - App Group entitlements for data sharing

## Setup Instructions

### 1. Add Widget Extension to Xcode Project

1. Open `ios/EATrade.xcodeproj` in Xcode
2. File → New → Target
3. Select "Widget Extension"
4. Product Name: `EATradeWidget`
5. Organization Identifier: `app.eatrade.automated.forex.trading`
6. Language: Swift
7. Include Configuration Intent: No (we're using App Intents)
8. Click Finish

### 2. Replace Generated Files

Replace the generated Swift files with the ones in this directory:
- Replace `EATradeWidget.swift` with the provided file
- Replace `EATradeWidgetBundle.swift` with the provided file
- Replace `Info.plist` with the provided file
- Replace `EATradeWidget.entitlements` with the provided file

### 3. Configure App Groups

1. Select the main app target (`EATrade`)
2. Go to Signing & Capabilities
3. Add capability: "App Groups"
4. Add group: `group.app.eatrade.automated.forex.trading.app`
5. Repeat for the widget extension target (`EATradeWidget`)

### 4. Add Native Module Bridge

1. Add `WidgetDataManager.swift` to the main app target (already created in `ios/EATrade/`)
2. Add `WidgetDataManagerBridge.m` to the main app target (already created in `ios/EATrade/`)
3. Make sure `EATrade-Bridging-Header.h` includes any necessary imports

### 5. Update Build Settings

1. Ensure Widget Extension deployment target is iOS 17.0+ (for App Intents)
2. Ensure main app deployment target matches

### 6. Build and Test

1. Build the project: `npm run ios` or build in Xcode
2. Run on device or simulator
3. Long press on home screen → Add Widget → EA Trade Widget
4. Add widget to notification center

## How It Works

1. **Data Sharing**: The main app and widget share data via App Group UserDefaults (`group.app.eatrade.automated.forex.trading.app`)

2. **Widget Updates**: When bot state changes, `WidgetDataManager` updates shared UserDefaults and reloads the widget timeline

3. **Widget Actions**: Widget buttons use App Intents to open the app with deep links:
   - Toggle Bot: `myapp://toggleBot`
   - Open Quotes: `myapp://quotes`

4. **Deep Link Handling**: Add deep link handling in `AppDelegate.swift` or `expo-router` to handle these URLs

## Notes

- Widget updates every 5 minutes automatically
- Widget can be manually refreshed by pulling down notification center
- Widget requires iOS 17.0+ for App Intents support
- App Group must be configured in Apple Developer portal

