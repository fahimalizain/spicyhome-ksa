#!/bin/bash
set -euo pipefail

# Locate the workspace root
# When running via bazel test, $1 is the (relative) path to MODULE.bazel in runfiles
if [ $# -ge 1 ] && [ -n "$1" ]; then
    # Resolve the real path (follow symlinks if in runfiles)
    REAL_MODULE="$(readlink -f "$1" 2>/dev/null || echo "$1")"
    WORKSPACE="$(dirname "$REAL_MODULE")"
elif [ -n "${BUILD_WORKSPACE_DIRECTORY:-}" ]; then
    WORKSPACE="$BUILD_WORKSPACE_DIRECTORY"
else
    # Navigate up from the script location
    WORKSPACE="$(cd "$(dirname "$0")" && while [ ! -f "MODULE.bazel" ] && [ "$(pwd)" != "/" ]; do cd ..; done; pwd)"
fi

echo "Workspace: $WORKSPACE"

ANDROID_HOME="${ANDROID_HOME:-}"
JAVA_HOME="${JAVA_HOME:-}"

if [ -z "$ANDROID_HOME" ] || [ ! -d "$ANDROID_HOME/platforms" ]; then
    echo "ERROR: ANDROID_HOME=$ANDROID_HOME is not valid."
    exit 1
fi
if [ -z "$JAVA_HOME" ] || [ ! -f "$JAVA_HOME/bin/java" ]; then
    echo "ERROR: JAVA_HOME=$JAVA_HOME is not valid."
    exit 1
fi

export ANDROID_HOME JAVA_HOME

cd "$WORKSPACE/apps/android"
chmod +x gradlew 2>/dev/null || true

echo "Running tests..."
./gradlew testDebugUnitTest --no-daemon --stacktrace

echo "All tests passed."
