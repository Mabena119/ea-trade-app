# Building APK Locally - Complete Guide

## Prerequisites

### Required Software
- ✅ Java JDK (you have: OpenJDK 21.0.8)
- ✅ EAS CLI (installed at: /opt/homebrew/bin/eas)
- ✅ Android native code (present in /android directory)
- ⚠️ Android SDK (needs to be set up)

---

## Option 1: EAS Build Local (Recommended) ⭐

This is the **easiest and fastest** way to build an APK locally using EAS Build.

### Step 1: Install EAS CLI (Already Done ✅)
```bash
npm install -g eas-cli
```

### Step 2: Login to Expo
```bash
eas login
```

### Step 3: Build APK Locally
```bash
# Build a preview APK (for testing)
eas build --platform android --profile preview --local

# OR build a production APK
eas build --platform android --profile production --local
```

### What This Does:
- Uses Docker to create a clean build environment
- Handles all dependencies automatically
- Produces a signed APK ready for distribution
- Output: `build-*.apk` in your project root

### Pros:
- ✅ No need to install Android SDK
- ✅ Consistent builds across machines
- ✅ Handles signing automatically
- ✅ Works on macOS, Linux, and Windows

### Cons:
- ❌ Requires Docker to be installed
- ❌ First build is slower (downloads Docker image)

---

## Option 2: Direct Gradle Build (Traditional)

This method uses the Android SDK and Gradle directly.

### Step 1: Install Android SDK

#### On macOS (using Homebrew):
```bash
brew install --cask android-studio
```

Or install Android Command Line Tools:
```bash
brew install --cask android-commandlinetools
```

#### Set up environment variables:
Add to your `~/.zshrc` or `~/.bash_profile`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

Then reload:
```bash
source ~/.zshrc
```

### Step 2: Install Required Android SDK Components
```bash
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

### Step 3: Pre-build the Expo app
```bash
npx expo prebuild --platform android
```

### Step 4: Build the APK
```bash
cd android
./gradlew assembleRelease
```

### Output Location:
```
android/app/build/outputs/apk/release/app-release.apk
```

### Pros:
- ✅ Full control over build process
- ✅ Faster subsequent builds
- ✅ Can customize build configuration

### Cons:
- ❌ Requires Android SDK setup (~5GB download)
- ❌ More complex setup
- ❌ Need to manage signing keys manually

---

## Quick Build Scripts

I've created helper scripts for you:

### Build with EAS (Recommended):
```bash
npm run build:apk:eas
```

### Build with Gradle:
```bash
npm run build:apk:gradle
```

---

## Troubleshooting

### Issue: "ANDROID_HOME not set"
**Solution:** Set up Android SDK and environment variables (see Option 2, Step 1)

### Issue: "Docker not found"
**Solution:** Install Docker Desktop:
```bash
brew install --cask docker
```

### Issue: "Gradle build failed"
**Solution:** Clean and rebuild:
```bash
cd android
./gradlew clean
./gradlew assembleRelease
```

### Issue: "Java version mismatch"
**Solution:** You have Java 21, which is compatible. If issues persist:
```bash
brew install openjdk@17
```

---

## APK Signing (For Production)

### Generate a keystore:
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### Configure signing in `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file('my-release-key.keystore')
            storePassword 'YOUR_PASSWORD'
            keyAlias 'my-key-alias'
            keyPassword 'YOUR_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

---

## Recommended Workflow

1. **For Testing:** Use EAS Build with `preview` profile
   ```bash
   eas build --platform android --profile preview --local
   ```

2. **For Production:** Use EAS Build with `production` profile
   ```bash
   eas build --platform android --profile production --local
   ```

3. **Install on Device:**
   ```bash
   adb install build-*.apk
   ```

---

## Next Steps

After building:
1. Test the APK on a physical device
2. Upload to Google Play Console (for production)
3. Or distribute via Firebase App Distribution (for testing)

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `eas build -p android --profile preview --local` | Build preview APK locally |
| `eas build -p android --profile production --local` | Build production APK locally |
| `cd android && ./gradlew assembleRelease` | Build with Gradle |
| `cd android && ./gradlew assembleDebug` | Build debug APK |
| `adb install app.apk` | Install APK on connected device |
| `adb devices` | List connected devices |

---

## Support

If you encounter issues:
1. Check the [Expo documentation](https://docs.expo.dev/build/setup/)
2. Check the [EAS Build documentation](https://docs.expo.dev/build/introduction/)
3. Review build logs for specific errors




