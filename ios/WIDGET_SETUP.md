# iOS WidgetKit Extension Setup

This guide explains how to add the WidgetKit extension to your Xcode project.

## Steps to Add Widget Extension

1. **Open Xcode Project**
   ```bash
   cd ios
   open EATrade.xcworkspace
   ```

2. **Add Widget Extension Target**
   - In Xcode, go to File → New → Target
   - Select "Widget Extension"
   - Name it "EATradeWidget"
   - Bundle Identifier: `app.eatrade.automated.forex.trading.app.EATradeWidget`
   - Language: Swift
   - Include Configuration Intent: Yes (for interactive widgets)

3. **Add App Group**
   - Select the main app target (EATrade)
   - Go to Signing & Capabilities
   - Click "+ Capability"
   - Add "App Groups"
   - Add group: `group.app.eatrade.automated.forex.trading.app`
   - Repeat for EATradeWidget target

4. **Copy Widget Files**
   - Copy `ios/EATradeWidget/EATradeWidget.swift` to the widget extension target
   - Copy `ios/EATradeWidget/WidgetIntents.swift` to the widget extension target
   - Update Info.plist in widget extension with the provided Info.plist

5. **Add WidgetDataManager to Main App**
   - Add `ios/EATrade/WidgetDataManager.swift` to the main app target
   - Add `ios/EATrade/WidgetDataManager.m` to the main app target
   - Update `EATrade-Bridging-Header.h` to include WidgetKit imports

6. **Update App Entitlements**
   - Ensure `ios/EATrade/EATrade.entitlements` includes App Groups:
   ```xml
   <key>com.apple.security.application-groups</key>
   <array>
       <string>group.app.eatrade.automated.forex.trading.app</string>
   </array>
   ```

7. **Build and Run**
   - Build the project
   - Run on device or simulator
   - Add widget to home screen or notification center
   - Long press home screen → Add Widget → EA Trade Widget

## Widget Features

- **Small Widget**: Shows bot name, status, and logo
- **Medium Widget**: Shows bot name, status, logo, and control buttons
- **Interactive Controls**: Start/Stop and Quotes buttons that open the app

## Data Sharing

The widget uses App Groups to share data between the main app and widget:
- Bot name
- Bot active status
- Logo URL

Data is updated automatically when the bot state changes in the app.

