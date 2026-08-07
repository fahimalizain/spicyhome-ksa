#!/bin/bash
set -euo pipefail

# Build script for the Android APK.
# Called by Bazel genrule //apps/android:assemble_debug.
# Produces a distribution-signed RELEASE APK when ANDROID_KEYSTORE_PATH (plus
# ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD) are set,
# otherwise a DEBUG-signed APK for local development.
# $1 = output APK path (may be relative to execroot)
# WORKSPACE env var is set by the genrule cmd

APK_OUT="$1"
WORKSPACE="${WORKSPACE:-}"

if [ -z "$WORKSPACE" ] || [ ! -d "$WORKSPACE" ]; then
    echo "ERROR: WORKSPACE=$WORKSPACE is not set or invalid."
    exit 1
fi

# Make APK_OUT absolute if relative
if [[ "$APK_OUT" != /* ]]; then
    APK_OUT="$PWD/$APK_OUT"
fi

echo "Workspace: $WORKSPACE"
echo "APK output: $APK_OUT"

# Android SDK
ANDROID_HOME="${ANDROID_HOME:-}"
if [ -z "$ANDROID_HOME" ] || [ ! -d "$ANDROID_HOME/platforms" ]; then
    echo "ERROR: ANDROID_HOME=$ANDROID_HOME is not valid."
    echo "Set ANDROID_HOME to your SDK path or pass --action_env=ANDROID_HOME=..."
    exit 1
fi

# Java
JAVA_HOME="${JAVA_HOME:-}"
if [ -z "$JAVA_HOME" ] || [ ! -f "$JAVA_HOME/bin/java" ]; then
    echo "ERROR: JAVA_HOME=$JAVA_HOME is not valid."
    exit 1
fi

export ANDROID_HOME JAVA_HOME

# Distribution signing credentials (also read by Gradle from local.properties).
# Export them explicitly so the Gradle daemon sees them.
ANDROID_KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-}"
ANDROID_KEYSTORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD:-}"
ANDROID_KEY_ALIAS="${ANDROID_KEY_ALIAS:-}"
ANDROID_KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-}"
if [ -n "$ANDROID_KEYSTORE_PATH" ] || [ -n "$ANDROID_KEYSTORE_PASSWORD" ] || [ -n "$ANDROID_KEY_ALIAS" ] || [ -n "$ANDROID_KEY_PASSWORD" ]; then
    export ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD
fi

cd "$WORKSPACE/apps/android"
chmod +x gradlew 2>/dev/null || true

if [ -f "$WORKSPACE/VERSION" ]; then
    APP_VERSION="$(tr -d '[:space:]' < "$WORKSPACE/VERSION")"
    echo "App version: $APP_VERSION"
fi

HAS_DISTRIBUTION_SIGNING=0
if [ -n "$ANDROID_KEYSTORE_PATH" ] && [ -f "$ANDROID_KEYSTORE_PATH" ]; then
    if [ -n "$ANDROID_KEYSTORE_PASSWORD" ] && [ -n "$ANDROID_KEY_ALIAS" ] && [ -n "$ANDROID_KEY_PASSWORD" ]; then
        HAS_DISTRIBUTION_SIGNING=1
    else
        echo "WARNING: ANDROID_KEYSTORE_PATH is set and the file exists, but one of" >&2
        echo "ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD is missing." >&2
        echo "Falling back to a debug-signed APK." >&2
    fi
fi

if [ "$HAS_DISTRIBUTION_SIGNING" -eq 1 ]; then
    echo "Distribution keystore found at $ANDROID_KEYSTORE_PATH — building RELEASE APK."
    ./gradlew assembleRelease --no-daemon --stacktrace
    APK_FILE="$(find app/build/outputs/apk/release -name "*.apk" ! -name "*-unsigned.apk" ! -name "*-unscaled.apk" 2>/dev/null | head -1)"
    if [ -z "$APK_FILE" ]; then
        echo "ERROR: Release APK not found under app/build/outputs/apk/release."
        echo "Check the distribution signing configuration in app/build.gradle.kts."
        exit 1
    fi
else
    echo "WARNING: No distribution keystore configured — building a DEBUG-signed APK." >&2
    echo "This APK is signed with an ephemeral debug key and is NOT suitable for" >&2
    echo "production side-load upgrades (signature mismatch would force an uninstall)." >&2
    echo "Set ANDROID_KEYSTORE_PATH / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS /" >&2
    echo "ANDROID_KEY_PASSWORD (or the same keys in apps/android/local.properties) to" >&2
    echo "build a distribution-signed release APK. See docs/android/apk-signing.md." >&2
    ./gradlew assembleDebug --no-daemon --stacktrace
    APK_FILE="$(find app/build/outputs/apk/debug -name "*.apk" 2>/dev/null | head -1)"
    if [ -z "$APK_FILE" ]; then
        echo "ERROR: APK not found"
        exit 1
    fi
fi

mkdir -p "$(dirname "$APK_OUT")"
cp "$APK_FILE" "$APK_OUT"
echo "APK copied to $APK_OUT"
ls -lh "$APK_OUT"
