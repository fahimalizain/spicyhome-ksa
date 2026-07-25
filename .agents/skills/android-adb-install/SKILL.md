---
name: android-adb-install
description: Build the Android debug APK via Bazel, install it on a device over ADB, and detect crashes via logcat. Use when the user wants to deploy the Android app to a device, run on a tablet, test on hardware, debug crashes, or mentions ADB install, APK install, install on device.
---

# Android ADB Install

Build the Android debug APK (`//apps/android:apk`) via Bazel and sideload it onto a device connected over ADB.

## Prerequisites

- `ANDROID_HOME` set (default on macOS: `~/Library/Android/sdk`)
- `JAVA_HOME` set to JDK 21+ (default on macOS: `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`)
- At least one device connected via ADB

## Workflow

### 1. Check connected devices

```bash
adb devices -l
```

- **No devices**: stop and tell the user to connect a device over USB or TCP/IP.
- **Multiple devices**: ask the user which one to target (show serial and model, e.g. `192.168.0.8:34155 model:SM_T500`).
- **Exactly one**: proceed automatically with that serial.

### 2. Verify environment variables

Check that `ANDROID_HOME` and `JAVA_HOME` are set in the current shell. If either is missing, check the common macOS defaults noted above. If still not found, ask the user.

### 3. Build the APK via Bazel

```bash
bazel build //apps/android:apk \
  --action_env=ANDROID_HOME="$ANDROID_HOME" \
  --action_env=JAVA_HOME="$JAVA_HOME"
```

- Output: `bazel-bin/apps/android/spicyhome-pos-debug.apk`
- Package: `com.spicyhome.pos`
- The `--action_env` flags are **required** — they pass the env vars into the genrule's sandbox.

### 4. Install on the selected device

```bash
adb -s <serial> install -r bazel-bin/apps/android/spicyhome-pos-debug.apk
```

The `-r` flag replaces the existing app if already installed.

### 5. Verify no crash on launch

After install, check for immediate crashes without waiting for the user to mention it:

```bash
adb -s <serial> logcat -c                              # clear the buffer
sleep 1
timeout 12 adb -s <serial> logcat -s AndroidRuntime:E  # watch for FATAL EXCEPTION
```

If a crash is detected, dump the full stack trace:

```bash
adb -s <serial> logcat -d -s AndroidRuntime:E
```

Common crash patterns to look for:

- `FATAL EXCEPTION` — app crash, read the exception class and first frame for root cause
- `AndroidRuntime` priority `E` — runtime errors
- Filter by package to exclude system noise

If a crash occurs, read the relevant source files, fix the issue, rebuild and reinstall.

### 6. Offer live logcat

After confirming no crash, ask the user: **"No crash detected. Want to observe live logcat output?"** Do not start it automatically. If the user says yes:

```bash
adb -s <serial> logcat -s com.spicyhome.pos
```

To include info-level logs from the app process:

```bash
adb -s <serial> logcat --pid=$(adb -s <serial> shell pidof com.spicyhome.pos) -v time
```
