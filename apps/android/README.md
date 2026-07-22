# SpicyHome POS — Android Tablet App

## Build path: Gradle (with Bazel wrapper)

Jetpack Compose under `rules_kotlin`/`rules_android` is fragile (requires compose
compiler plugin wiring, resource processing, manifest merging, and D8/R8 dexing
through Bazel — none of which are first-class in rules_kotlin). This project uses a
**Gradle project** for the app sources, wrapped by Bazel genrules that shell out to
the Gradle wrapper.

### Bazel targets

| Target      | Command                                | What it does                                      |
| ----------- | -------------------------------------- | ------------------------------------------------- |
| APK (debug) | `bazel build //apps/android:apk`       | Assembles debug APK via `./gradlew assembleDebug` |
| Unit tests  | `bazel test //apps/android:unit_tests` | Runs `./gradlew testDebugUnitTest`                |

### Prerequisites

- **Android SDK**: Set `ANDROID_HOME` environment variable, or ensure `adb` is on
  `PATH` (the build scripts auto-detect from `adb` location).
  - Platform: `android-36`
  - Build-tools: `36.0.0`
- **Java 21**: Required by AGP 8.7+. The build auto-detects `JAVA_HOME` from `java`
  on `PATH`.
- **Gradle 8.11.1**: Downloaded automatically by the Gradle wrapper (no host install
  needed).

### Direct Gradle usage (bypasses Bazel)

```sh
cd apps/android
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

### Setting ANDROID_HOME

Add to `~/.zshrc` or `~/.bashrc`:

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
```

### App structure

```
apps/android/
├── BUILD.bazel              # Bazel genrule targets wrapping Gradle
├── build.gradle.kts         # Root Gradle build (plugin declarations)
├── settings.gradle.kts      # Gradle settings
├── gradlew / gradlew.bat    # Gradle wrapper
└── app/
    ├── build.gradle.kts     # Android app module
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── java/com/spicyhome/pos/
        │   │   ├── SpicyHomeApp.kt              # Application class
        │   │   ├── MainActivity.kt              # Single-activity entry point
        │   │   ├── data/
        │   │   │   ├── PreferencesManager.kt    # DataStore for server URL & tokens
        │   │   │   ├── api/
        │   │   │   │   └── ApiClientProvider.kt # Wraps generated ApiClient
        │   │   │   └── repository/
        │   │   │       ├── AuthRepository.kt
        │   │   │       ├── MenuRepository.kt
        │   │   │       ├── OrderRepository.kt
        │   │   │       └── TableRepository.kt
        │   │   ├── ui/
        │   │   │   ├── theme/           # Dark theme (Color.kt, Theme.kt)
        │   │   │   ├── navigation/      # NavGraph.kt (Compose Navigation)
        │   │   │   ├── setup/           # Server URL config screen
        │   │   │   ├── login/           # Username + PIN login
        │   │   │   ├── order/           # Main order-taking screen
        │   │   │   └── orders/          # Today's orders list + detail
        │   │   └── util/
        │   │       └── MoneyFormatter.kt  # halalas → SAR, VAT decomposition
        │   └── res/                     # Android resources
        └── test/
            └── java/com/spicyhome/pos/
                ├── util/MoneyFormatterTest.kt
                ├── data/
                │   ├── FakePreferencesManager.kt
                │   ├── api/FakeApiClientProvider.kt
                │   └── repository/
                │       ├── AuthRepositoryTest.kt
                │       └── OrderRepositoryTest.kt
                └── ui/
                    ├── OrderViewModelTest.kt
                    └── LoginViewModelTest.kt
```

### How client-kt is consumed

The generated Kotlin client (`packages/client-kt/src/generated`) is included as a
**source dependency** via `kotlin.srcDirs` in `app/build.gradle.kts`:

```kotlin
sourceSets {
    named("main") {
        kotlin.srcDirs(
            "src/main/java",
            "../../packages/client-kt/src/generated/src/main/kotlin"
        )
    }
}
```

This means all `.kt` files from the generated client are compiled directly
into the Android app. The generated client's Retrofit2, OkHttp, and Moshi
dependencies are declared in the app's `build.gradle.kts` with matching versions.

### Screen flow

```
Setup → Login → Order (category tabs, items, cart, create/send/pay) → Orders list
```

### Key design decisions

- **MVVM**: ViewModels with `StateFlow`, thin Repository wrappers around generated
  API interfaces.
- **Dark theme only**: Material 3 dark color scheme, large touch targets.
- **Landscape-first**: `screenOrientation="sensorLandscape"` in manifest.
- **minSdk 26**: Targets all Android tablets from Android 8.0+.
- **401 auto-logout**: Not wired yet — the client-kt `ResponseExt.kt` extension
  could intercept 401s and clear the stored token.

### Risks

- **rules_kotlin + Compose**: Not attempted due to known fragility with compose
  compiler plugin, resource handling, APK packaging. The Gradle fallback is
  pragmatic and well-tested.
- **Response types are `Unit`**: The NestJS controllers lack `@ApiResponse`
  decorators, so the generated Kotlin client produces `Call<Unit>` for some
  endpoints. The actual server returns typed JSON — Moshi deserialization will
  fail silently for Unit-typed calls. Fix by adding `@ApiResponse` decorators to
  NestJS controllers (tracked in client-kt README).
- **Gradle wrapper in Bazel sandbox**: The genrule uses `local = True` and
  `no-sandbox` to allow network access for dependency downloads. On first build,
  Gradle downloads ~500 MB of dependencies. Subsequent builds use the Gradle
  cache at `~/.gradle`.
