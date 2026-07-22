#!/bin/bash
set -euo pipefail

# Build script for the Android APK.
# Called by Bazel genrule //apps/android:assemble_debug
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

cd "$WORKSPACE/apps/android"
chmod +x gradlew 2>/dev/null || true

echo "Building APK..."
./gradlew assembleDebug --no-daemon --stacktrace

APK_FILE="$(find app/build/outputs/apk/debug -name "*.apk" 2>/dev/null | head -1)"
if [ -z "$APK_FILE" ]; then
    echo "ERROR: APK not found"
    exit 1
fi

mkdir -p "$(dirname "$APK_OUT")"
cp "$APK_FILE" "$APK_OUT"
echo "APK copied to $APK_OUT"
ls -lh "$APK_OUT"
