# Android APK signing & versionCode

How production Android APKs are signed so **side-load upgrades install in
place** without uninstalling the app first, and how `versionCode` is derived
from the date-based `VERSION`.

## Why side-load upgrades failed (root cause)

Every CI release used to run `./gradlew assembleDebug`, which signs the APK
with an **ephemeral debug keystore** that Gradle generates fresh on each
machine. Each GitHub Actions runner therefore produced a _different_ signing
certificate per release:

| Release      | versionCode | Signer (debug cert SHA-256) |
| ------------ | ----------- | --------------------------- |
| v202608.01.0 | 2026080100  | `030f518a…` (different)     |
| v202608.01.1 | 2026080101  | `0af51881…` (different)     |
| v202608.01.2 | 2026080102  | `b250f548…` (different)     |

`versionCode` was already monotonic and correct — that was **not** the
problem. Android refuses to install an APK over an existing install when the
incoming APK is signed with a **different certificate** (same `applicationId`,
different signer → `INSTALL_FAILED_UPDATE_INCOMPATIBLE`). So every release
forced `adb uninstall` / manual uninstall before the new APK could install.

The fix: sign all production APKs with one **stable distribution keystore**,
stored as a GitHub secret (`ANDROID_KEYSTORE_BASE64`) and decoded only inside
the release workflow. With a stable signer, upgrades are plain in-place
installs (`adb install -r` or the in-app updater).

## versionCode formula

`versionCode` is derived from the root `VERSION` file (`YYYYMM.DD.N`, e.g.
`202608.01.2`):

```
versionCode = YYYYMM * 10000 + DD * 100 + min(N, 99)
```

| Version       | Computation               | versionCode |
| ------------- | ------------------------- | ----------- |
| `202608.01.0` | 202608·10000 + 01·100 + 0 | 2026080100  |
| `202608.01.1` | 202608·10000 + 01·100 + 1 | 2026080101  |
| `202608.01.2` | 202608·10000 + 01·100 + 2 | 2026080102  |

Properties:

- **Monotonic**: any later date or same-day increment yields a larger code
  (e.g. `202607.31.99` → `2026073199` < `202608.01.0` → `2026080100`).
- **Capped increment**: the `.N` field is capped at 99 (`202608.01.99` and
  `202608.01.100` produce the same code). In practice a single day never
  produces 100 releases; the cap only guards against overflow.
- **Fallback**: unparseable versions produce `1`.

The formula exists in two places that must stay in sync:

- Gradle: `computeVersionCode()` in `apps/android/app/build.gradle.kts`.
- App code: `AppVersion.toVersionCode()` in
  `apps/android/app/src/main/java/com/spicyhome/pos/update/AppVersion.kt`
  (unit-tested in `AppVersionTest`).

The release workflow independently recomputes the expected code from the
bumped `VERSION` and fails the build if the APK disagrees.

## Distribution keystore purpose

One RSA 2048 key pair (JKS, 10000-day validity, DN `CN=SpicyHome POS, C=SA`)
that signs **every production Android APK**. It is:

- Decoded inside CI from the `ANDROID_KEYSTORE_BASE64` secret to a temp file,
  used for `assembleRelease`, verified, then wiped from the runner.
- **Never committed** to git (`.gitignore` covers `*.jks`, `*.keystore` and
  `apps/android/keystore/`).
- The **single long-lived secret** of this project: losing it means every
  tablet needs another uninstall + reinstall wave.

Debug APKs (local dev, PR CI) keep using the default debug keystore — they are
fine for development but are never shipped.

## Required GitHub secrets

| Secret                      | Value                                           |
| --------------------------- | ----------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64 one-liner of the `.jks` file (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore store password                         |
| `ANDROID_KEY_ALIAS`         | Key alias (default `spicyhome`)                 |
| `ANDROID_KEY_PASSWORD`      | Key password (defaults to the store password)   |

The release workflow **fails closed**: if any of these secrets is missing, the
release job stops with a clear error before building anything.

## Generating a keystore

```sh
bash scripts/android/generate-distribution-keystore.sh
```

Run it **once**, on a trusted machine, and keep the output offline:

- Interactive: it prompts for passwords and writes the keystore to
  `apps/android/keystore/spicyhome-distribution.jks` (gitignored).
- Non-interactive (CI): export `ANDROID_KEYSTORE_PASSWORD` first
  (min 6 chars), plus optionally `ANDROID_KEY_PASSWORD` / `ANDROID_KEY_ALIAS`.
- `--out PATH` writes elsewhere; `--force` overwrites (dangerous — see
  Rotation policy below); `--help` prints usage.

The script prints:

1. The keystore path.
2. A **base64 one-liner** to paste into the `ANDROID_KEYSTORE_BASE64` secret.
3. The list of required secrets and the aliases/passwords mapping.
4. A reminder to back the keystore up offline and never commit it.

## Adding secrets to GitHub

1. Repository **Settings → Secrets and variables → Actions**.
2. **New repository secret** → name `ANDROID_KEYSTORE_BASE64`, paste the
   base64 one-liner printed by the generation script.
3. Repeat for `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
   `ANDROID_KEY_PASSWORD`.
4. Secrets are write-only: after saving, the values can never be viewed again.
   Store them in your password manager alongside the keystore backup.

## Local release build (optional)

Two equivalent ways — both trigger `assembleRelease` in
`apps/android/build_apk.sh`:

1. **Environment variables** (exported, then passed to Bazel):

   ```sh
   export ANDROID_KEYSTORE_PATH=/absolute/path/to/spicyhome-distribution.jks
   export ANDROID_KEYSTORE_PASSWORD=...
   export ANDROID_KEY_ALIAS=spicyhome
   export ANDROID_KEY_PASSWORD=...
   bazel build //apps/android:apk \
     --action_env=ANDROID_HOME \
     --action_env=JAVA_HOME \
     --action_env=ANDROID_KEYSTORE_PATH \
     --action_env=ANDROID_KEYSTORE_PASSWORD \
     --action_env=ANDROID_KEY_ALIAS \
     --action_env=ANDROID_KEY_PASSWORD
   ```

   Bazel inherits each value from the shell environment, so passwords never
   appear in `argv` or shell history.

2. **`apps/android/local.properties`** (gitignored) — Gradle reads these
   directly, so no `--action_env` is needed:

   ```properties
   ANDROID_KEYSTORE_PATH=/absolute/path/to/spicyhome-distribution.jks
   ANDROID_KEYSTORE_PASSWORD=...
   ANDROID_KEY_ALIAS=spicyhome
   ANDROID_KEY_PASSWORD=...
   ```

   then `bazel build //apps/android:apk --action_env=ANDROID_HOME=... --action_env=JAVA_HOME=...`.

Environment variables take priority over `local.properties`. The keystore path
may be relative to the **repository root** (e.g.
`apps/android/keystore/spicyhome-distribution.jks`).

Without any keystore, the build falls back to `assembleDebug` and prints a
warning that the APK is debug-signed and unsuitable for production upgrades.
The release workflow never ships such an APK (it verifies the signer).

## One-time tablet migration

The very first distribution-signed release cannot upgrade existing
debug-signed installs. Once per tablet, **once**:

1. Uninstall the old app (Settings → Apps → SpicyHome POS → Uninstall, or
   `adb uninstall com.spicyhome.pos`). Note: this deletes local data —
   re-login afterwards.
2. Install the first distribution-signed APK (side-load or in-app updater).
3. Grant “Install unknown apps” permission if prompted.

Every subsequent release installs **in place** — no uninstall, no data loss.
New tablets installing for the first time skip the uninstall step entirely.

## In-app updater and the same signing cert

The in-app updater (`update/ApkInstaller.kt` → `SystemApkInstaller`) launches
the system package installer with a `FileProvider` URI; Android then applies
the exact same signature rule as `adb install`:

- Same signer + newer `versionCode` → upgrade in place.
- Different signer → `INSTALL_FAILED_UPDATE_INCOMPATIBLE` → updater must fail
  with a clear “uninstall required” message.

Because the distribution keystore is stable, the updater can upgrade directly
from a previously shipped release. The updater decides "is there a newer
release?" via `AppVersion.isNewerThan` on the versionName components
(`YYYYMM.DD.N`); Android's PackageManager then enforces `versionCode` + same
signer at install time. `AppVersion.toVersionCode()` exists so the Gradle
formula is unit-tested and stays aligned with what Android sees in the APK;
release CI also asserts the APK versionCode.

## Verification commands

On the CI runner or a machine with the Android SDK build-tools:

```sh
# versionCode / versionName from the APK
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging spicyhome-pos-android-v202608.01.2.apk \
  | grep -E "versionCode|versionName"

# Signer certificate
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs spicyhome-pos-android-v202608.01.2.apk
```

Expected:

- `versionCode='2026080102'`, `versionName='202608.01.2'` (matches `VERSION`).
- Signer DN contains `CN=SpicyHome POS` — **never** `CN=Android Debug`.

The release workflow runs exactly these checks (plus a recomputed
`versionCode` assertion) and fails the release on any mismatch.

## Rotation policy

- **Never rotate** the keystore unless absolutely necessary (compromise, loss).
- Changing the keystore **invalidates every installed tablet**: each device
  needs one more uninstall + reinstall wave.
- If you must rotate: generate a new keystore with
  `scripts/android/generate-distribution-keystore.sh --force`, update all four
  secrets, and coordinate the uninstall wave with the first release signed
  with the new key.
- Keep offline backups of the keystore file **and** both passwords in a
  password manager. Without them, upgrades silently become uninstall+reinstall.
