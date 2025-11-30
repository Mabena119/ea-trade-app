# Widget Extension Setup - Step by Step

## Step 1: Create Widget Extension Target in Xcode

1. In Xcode, go to **File → New → Target**
2. Select **"Widget Extension"**
3. In the dialog that appears:
   - **Product Name:** `EATradeWidget`
   - **Team:** Select your Apple Developer team (or "Add account..." if needed)
   - **Organization Identifier:** `app.eatrade.automated.forex.trading.app` (should auto-fill)
   - **Bundle Identifier:** Should auto-fill as `app.eatrade.automated.forex.trading.app.EATradeWidget`
   - **Include Live Activity:** ✅ Check this
   - **Include Control:** ✅ Check this  
   - **Include Configuration App Intent:** ✅ Check this
   - **Project:** Should show "EATrade"
   - **Embed in Application:** Should show "EATrade" ✅ checked
4. Click **"Finish"**

## Step 2: Replace Generated Files

After Xcode creates the widget extension, it will generate default Swift files. You need to **replace** them with the custom files I created:

### Files to Replace:

1. **EATradeWidget.swift**
   - Xcode will create: `ios/EATradeWidget/EATradeWidget.swift`
   - **Replace** its contents with the file I created at `ios/EATradeWidget/EATradeWidget.swift`
   - This file contains the actual widget UI and logic

2. **EATradeWidgetBundle.swift** (or similar name)
   - Xcode might create: `ios/EATradeWidget/EATradeWidgetBundle.swift` or `EATradeWidgetBundle.swift`
   - **Replace** its contents with the file I created at `ios/EATradeWidget/EATradeWidgetBundle.swift`

3. **Info.plist**
   - Xcode will create: `ios/EATradeWidget/Info.plist`
   - **Replace** its contents with the file I created at `ios/EATradeWidget/Info.plist`

4. **EATradeWidget.entitlements**
   - Xcode will create: `ios/EATradeWidget/EATradeWidget.entitlements`
   - **Replace** its contents with the file I created at `ios/EATradeWidget/EATradeWidget.entitlements`

### How to Replace:

**Option A: Copy-Paste**
1. Open the file Xcode generated
2. Select all (Cmd+A)
3. Delete
4. Open the file I created (in your file system or in another editor)
5. Copy all contents
6. Paste into the Xcode file
7. Save

**Option B: File Replacement**
1. Close Xcode
2. In Finder, navigate to `ios/EATradeWidget/`
3. Replace the generated files with the ones I created
4. Reopen Xcode

## Step 3: Add Native Module Files to Main App Target

Make sure these files are added to the **EATrade** (main app) target, NOT the widget target:

1. **WidgetDataManager.swift** - Should be at `ios/EATrade/WidgetDataManager.swift`
2. **WidgetDataManagerBridge.m** - Should be at `ios/EATrade/WidgetDataManagerBridge.m`

To verify:
- Select each file in Xcode
- Check the "Target Membership" in the File Inspector (right panel)
- Make sure only **EATrade** is checked (NOT EATradeWidget)

## Step 4: Configure App Groups

1. Select the **EATrade** target (main app)
2. Go to **Signing & Capabilities** tab
3. Click **"+ Capability"**
4. Add **"App Groups"**
5. Check the box for: `group.app.eatrade.automated.forex.trading.app`
6. Repeat steps 1-5 for the **EATradeWidget** target

## Step 5: Build and Test

1. Select the **EATrade** scheme (main app)
2. Build and run: **Product → Run** (Cmd+R)
3. On your device/simulator:
   - Long press on home screen
   - Tap the "+" button (top left)
   - Search for "EA Trade"
   - Add the widget
   - Or add it to Notification Center by swiping down

## Troubleshooting

- **"No such module 'WidgetKit'"**: Make sure deployment target is iOS 17.0+
- **"App Group not found"**: Configure App Groups in Apple Developer Portal
- **Widget not updating**: Check that WidgetDataManager is properly bridged

