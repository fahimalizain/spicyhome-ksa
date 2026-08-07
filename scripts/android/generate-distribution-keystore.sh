#!/bin/bash
set -euo pipefail

# SpicyHome POS — generate the Android distribution keystore.
#
# The distribution keystore signs production release APKs so side-load
# upgrades install in place (Android refuses to upgrade an APK signed with a
# different key). Every CI release was previously signed with a fresh
# ephemeral debug keystore, which forced an uninstall on every tablet.
#
# Usage:
#   scripts/android/generate-distribution-keystore.sh [--help] [--out PATH] [--force]
#
# Passwords:
#   - Interactive (TTY): prompted, defaulting ANDROID_KEY_PASSWORD to the
#     keystore password and ANDROID_KEY_ALIAS to "spicyhome".
#   - Non-interactive (CI): ALL of ANDROID_KEYSTORE_PASSWORD (and optionally
#     ANDROID_KEY_PASSWORD / ANDROID_KEY_ALIAS) must be exported.
#
# Output path precedence: --out PATH > ANDROID_KEYSTORE_PATH env > default
# apps/android/keystore/spicyhome-distribution.jks (gitignored).
#
# The keystore is the ONE secret that must survive forever: losing it means
# every tablet needs another uninstall + reinstall. Back it up offline.
# NEVER commit the keystore or any of the passwords.

DEFAULT_OUT="$(cd "$(dirname "$0")/../.." && pwd)/apps/android/keystore/spicyhome-distribution.jks"

OUT_PATH=""
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help | -h)
      sed -n '4,26p' "$0" | sed 's/^# \{0,1\}//'
      echo
      echo "Options:"
      echo "  --help          Show this help"
      echo "  --out PATH      Write the keystore to PATH (default: apps/android/keystore/spicyhome-distribution.jks)"
      echo "  --force         Overwrite an existing keystore (invalidates all installed tablets!)"
      echo
      echo "Environment:"
      echo "  ANDROID_KEYSTORE_PATH   Output path (same precedence as --out)"
      echo "  ANDROID_KEYSTORE_PASSWORD  Keystore password (required; min 6 chars)"
      echo "  ANDROID_KEY_PASSWORD       Key password (defaults to keystore password)"
      echo "  ANDROID_KEY_ALIAS          Key alias (default: spicyhome)"
      exit 0
      ;;
    --out)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --out requires a path" >&2
        exit 1
      fi
      OUT_PATH="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    *)
      echo "Error: unknown argument '$1' (use --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v keytool >/dev/null 2>&1; then
  echo "Error: keytool not found on PATH (part of a JDK installation)." >&2
  exit 1
fi

KEYSTORE_PATH="${OUT_PATH:-${ANDROID_KEYSTORE_PATH:-$DEFAULT_OUT}}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-spicyhome}"
KEYSTORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD:-}"
KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-}"

if [ -z "$KEYSTORE_PASSWORD" ]; then
  if [ -t 0 ]; then
    read -rsp "Keystore password (min 6 chars): " KEYSTORE_PASSWORD
    echo
    read -rsp "Repeat keystore password: " KEYSTORE_CONFIRM
    echo
    if [ "$KEYSTORE_PASSWORD" != "$KEYSTORE_CONFIRM" ]; then
      echo "Error: passwords do not match" >&2
      exit 1
    fi
  else
    echo "Error: ANDROID_KEYSTORE_PASSWORD is required when running non-interactively." >&2
    exit 1
  fi
fi

if [ "${#KEYSTORE_PASSWORD}" -lt 6 ]; then
  echo "Error: keystore password must be at least 6 characters." >&2
  exit 1
fi

if [ -z "$KEY_PASSWORD" ]; then
  KEY_PASSWORD="$KEYSTORE_PASSWORD"
  echo "Using keystore password as key password."
fi

if [ -e "$KEYSTORE_PATH" ] && [ "$FORCE" -ne 1 ]; then
  echo "Error: $KEYSTORE_PATH already exists." >&2
  echo "Use --force only if you understand this invalidates every installed tablet" >&2
  echo "(all devices would need an uninstall + reinstall)." >&2
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_PATH")"

keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE_PATH" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storetype JKS \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=SpicyHome POS, OU=SpicyHome, O=SpicyHome, L=Riyadh, ST=Riyadh, C=SA"

chmod 600 "$KEYSTORE_PATH"
BASE64="$(base64 < "$KEYSTORE_PATH" | tr -d '\n')"

cat <<EOF

==============================================================
Distribution keystore created: $KEYSTORE_PATH
Alias: $KEY_ALIAS
Validity: 10000 days, RSA 2048, DN CN=SpicyHome POS, C=SA

Add this value to the GitHub secret ANDROID_KEYSTORE_BASE64:
$BASE64

Required GitHub secrets (repo Settings > Secrets and variables > Actions):
  ANDROID_KEYSTORE_BASE64     <base64 string printed above>
  ANDROID_KEYSTORE_PASSWORD   <keystore password you just set>
  ANDROID_KEY_ALIAS           $KEY_ALIAS
  ANDROID_KEY_PASSWORD        <key password (defaults to keystore password)>

NEVER commit the keystore file or any of these passwords.
Losing the keystore + passwords = the next release can no longer upgrade
devices in place (one more uninstall wave). Back them up offline.
See docs/android/apk-signing.md for full instructions.
==============================================================
EOF
