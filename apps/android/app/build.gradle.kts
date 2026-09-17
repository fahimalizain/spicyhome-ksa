import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Read version from root VERSION file
val versionFile = file("${rootDir}/../../VERSION")
val appVersion = if (versionFile.exists()) {
    versionFile.readLines().firstOrNull()?.trim() ?: "0.0.1"
} else {
    "0.0.1"
}

// Read a key from local.properties (gitignored). Returns null when missing.
fun readLocalProperty(key: String): String? {
    val localProps = file("${rootDir}/local.properties")
    if (localProps.exists()) {
        for (line in localProps.readLines()) {
            val trimmed = line.trim()
            if (!trimmed.startsWith("#") && "=" in trimmed) {
                val parts = trimmed.split("=", limit = 2)
                if (parts[0].trim() == key) return parts[1].trim()
            }
        }
    }
    return null
}

// Existing helper kept with identical behavior: local.properties first, then env.
fun getLocalProperty(key: String, default: String = ""): String =
    readLocalProperty(key) ?: System.getenv(key) ?: default

// Distribution-signing secrets: environment variables take priority, then
// local.properties. Used by the stable signing config below.
fun resolveDistributionSecret(key: String): String? =
    System.getenv(key)?.takeIf { it.isNotBlank() } ?: readLocalProperty(key)?.takeIf { it.isNotBlank() }

val sentryDsn = getLocalProperty("SENTRY_DSN")
val sentryEnvironment = getLocalProperty("SENTRY_ENVIRONMENT", "development")

/** Derive a monotonic integer versionCode from a date-based version string.
 *  Format: YYYYMM.DD.N → YYYYMM * 10000 + DD * 100 + min(N, 99).
 *  Returns 1 if parsing fails.
 *  Keep in sync with AppVersion.toVersionCode() in
 *  apps/android/app/src/main/java/com/spicyhome/pos/update/AppVersion.kt. */
fun computeVersionCode(version: String): Int {
    val regex = Regex("""^(\d{6})\.(\d{2})\.(\d+)$""")
    val match = regex.matchEntire(version) ?: return 1
    val yyyymm = match.groupValues[1].toIntOrNull() ?: return 1
    val dd = match.groupValues[2].toIntOrNull() ?: return 1
    val n = match.groupValues[3].toIntOrNull()?.coerceAtMost(99) ?: return 1
    return yyyymm * 10000 + dd * 100 + n
}

val appVersionCode = computeVersionCode(appVersion)

// Distribution signing: a stable keystore so production side-load upgrades
// install in place (Android refuses to upgrade an APK signed with a different
// key). Credentials resolve from environment variables first, then
// local.properties: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
// ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. The path must be absolute (relative
// paths resolve against the repository root).
val keystorePath = resolveDistributionSecret("ANDROID_KEYSTORE_PATH")
val keystoreFile = keystorePath?.let { path ->
    val f = File(path)
    if (f.isAbsolute) file(path) else file("${rootDir}/../..").resolve(path)
}
val hasDistributionSigning = keystoreFile != null &&
    keystoreFile.isFile &&
    !resolveDistributionSecret("ANDROID_KEYSTORE_PASSWORD").isNullOrEmpty() &&
    !resolveDistributionSecret("ANDROID_KEY_ALIAS").isNullOrEmpty() &&
    !resolveDistributionSecret("ANDROID_KEY_PASSWORD").isNullOrEmpty()

android {
    namespace = "com.spicyhome.pos"
    compileSdk = 36

    signingConfigs {
        create("distribution") {
            if (hasDistributionSigning) {
                storeFile = keystoreFile
                storePassword = resolveDistributionSecret("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = resolveDistributionSecret("ANDROID_KEY_ALIAS")
                keyPassword = resolveDistributionSecret("ANDROID_KEY_PASSWORD")
            }
        }
    }

    defaultConfig {
        applicationId = "com.spicyhome.pos"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Sentry auto-init reads these from the merged manifest (not BuildConfig).
        // Values come from local.properties / env — never committed.
        manifestPlaceholders["sentryDsn"] = sentryDsn
        manifestPlaceholders["sentryEnvironment"] = sentryEnvironment
        manifestPlaceholders["sentryRelease"] = "spicyhome-android@$appVersion"
        manifestPlaceholders["sentryDebug"] = "false"
    }

    buildTypes {
        debug {
            manifestPlaceholders["sentryDebug"] = "true"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            manifestPlaceholders["sentryDebug"] = "false"
            // Sign release builds with the distribution keystore when present.
            // Without a keystore the release build type stays unsigned; local
            // day-to-day work uses the debug build type (default debug key).
            if (hasDistributionSigning) {
                signingConfig = signingConfigs.getByName("distribution")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = "11"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        named("main") {
            kotlin.srcDirs(
                "src/main/java",
                file("${rootDir}/../../packages/client-kt/src/generated/src/main/kotlin")
            )
        }
    }
}

// One clear line in build logs so CI/local output shows the resolved version.
println(
    "spicyhome-android: versionName=$appVersion versionCode=$appVersionCode " +
        "signing=${if (hasDistributionSigning) "distribution" else "debug (no distribution keystore)"}"
)

dependencies {
    // Compose BOM
    val composeBom = platform("androidx.compose:compose-bom:2024.02.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.9.3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Lifecycle / ViewModel
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // DataStore
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // FileProvider for the in-app APK updater
    implementation("androidx.core:core-ktx:1.13.1")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Retrofit + OkHttp + Moshi (matching generated client)
    implementation("com.squareup.retrofit2:retrofit:2.10.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.10.0")
    implementation("com.squareup.retrofit2:converter-scalars:2.10.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("com.squareup.moshi:moshi-adapters:1.15.1")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Sentry error monitoring
    implementation("io.sentry:sentry-android:7.22.1")
    implementation("io.sentry:sentry-android-okhttp:7.22.1")

    // Unit tests
    testImplementation("junit:junit:4.13.2")
    testImplementation("io.mockk:mockk:1.13.13")
    testImplementation("com.google.truth:truth:1.4.4")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("androidx.arch.core:core-testing:2.2.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
