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

// Read Sentry DSN from local.properties (gitignored) or environment
fun getLocalProperty(key: String, default: String = ""): String {
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
    return System.getenv(key) ?: default
}

val sentryDsn = getLocalProperty("SENTRY_DSN")
val sentryEnvironment = getLocalProperty("SENTRY_ENVIRONMENT", "development")

/** Derive a monotonic integer versionCode from a date-based version string.
 *  Format: YYYYMM.DD.N → YYYYMM * 10000 + DD * 100 + min(N, 99).
 *  Returns 1 if parsing fails. */
fun computeVersionCode(version: String): Int {
    val regex = Regex("""^(\d{6})\.(\d{2})\.(\d+)$""")
    val match = regex.matchEntire(version) ?: return 1
    val yyyymm = match.groupValues[1].toIntOrNull() ?: return 1
    val dd = match.groupValues[2].toIntOrNull() ?: return 1
    val n = match.groupValues[3].toIntOrNull()?.coerceAtMost(99) ?: return 1
    return yyyymm * 10000 + dd * 100 + n
}

// Optional -P overrides let CI pass the release version explicitly; without
// them the date-based version from the VERSION file is used as before.
val versionCodeOverride = providers.gradleProperty("versionCode").orNull
val resolvedVersionCode: Int = versionCodeOverride?.let { raw ->
    raw.trim().toIntOrNull()?.takeIf { it > 0 }
        ?: throw GradleException("Invalid -PversionCode value \"$raw\": expected a positive integer.")
} ?: computeVersionCode(appVersion)

val versionNameOverride = providers.gradleProperty("versionName").orNull?.trim()
val resolvedVersionName: String = versionNameOverride?.takeIf { it.isNotEmpty() } ?: appVersion

// Release signing is driven by environment variables so CI can inject the
// keystore without committing secrets. Blank values count as missing. The
// signing config is created only when all inputs are present and the keystore
// file exists; debug and local builds need none of this.
fun getEnvVar(name: String): String? = System.getenv(name)?.trim()?.takeIf { it.isNotEmpty() }

val releaseKeystorePath = getEnvVar("SPICYHOME_ANDROID_KEYSTORE")
val releaseKeystorePassword = getEnvVar("SPICYHOME_ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = getEnvVar("SPICYHOME_ANDROID_KEY_ALIAS")
val releaseKeyPassword = getEnvVar("SPICYHOME_ANDROID_KEY_PASSWORD")
val releaseKeystoreFile = releaseKeystorePath?.let { file(it) }

/** Reason release signing cannot be used, or null when it is fully configured. */
val releaseSigningProblem: String? = run {
    val missing = listOf(
        "SPICYHOME_ANDROID_KEYSTORE" to releaseKeystorePath,
        "SPICYHOME_ANDROID_KEYSTORE_PASSWORD" to releaseKeystorePassword,
        "SPICYHOME_ANDROID_KEY_ALIAS" to releaseKeyAlias,
        "SPICYHOME_ANDROID_KEY_PASSWORD" to releaseKeyPassword,
    ).filter { it.second == null }.map { it.first }

    when {
        missing.isNotEmpty() -> "missing environment variables: ${missing.joinToString(", ")}"
        releaseKeystoreFile?.exists() != true -> "keystore file not found: $releaseKeystorePath"
        else -> null
    }
}

android {
    namespace = "com.spicyhome.pos"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.spicyhome.pos"
        minSdk = 26
        targetSdk = 36
        versionCode = resolvedVersionCode
        versionName = resolvedVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Sentry auto-init reads these from the merged manifest (not BuildConfig).
        // Values come from local.properties / env — never committed.
        manifestPlaceholders["sentryDsn"] = sentryDsn
        manifestPlaceholders["sentryEnvironment"] = sentryEnvironment
        manifestPlaceholders["sentryRelease"] = "spicyhome-android@$appVersion"
        manifestPlaceholders["sentryDebug"] = "false"
    }

    // Created only when every signing input is available; otherwise the release
    // build type has no signing config and release tasks fail fast below.
    if (releaseSigningProblem == null) {
        signingConfigs {
            create("release") {
                storeFile = releaseKeystoreFile
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["sentryDebug"] = "true"
        }
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            manifestPlaceholders["sentryDebug"] = "false"
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

// Fail fast with an actionable message when a release task runs without signing
// configured. Only tasks whose name contains "Release" are affected, so debug
// and local builds stay untouched.
tasks.matching { it.name.contains("Release") }.configureEach {
    val signingProblem = releaseSigningProblem
    doFirst {
        if (signingProblem != null) {
            throw GradleException(
                "Release signing is not configured: $signingProblem. " +
                    "Set SPICYHOME_ANDROID_KEYSTORE, SPICYHOME_ANDROID_KEYSTORE_PASSWORD, " +
                    "SPICYHOME_ANDROID_KEY_ALIAS and SPICYHOME_ANDROID_KEY_PASSWORD, " +
                    "then retry (see docs/play-release.md)."
            )
        }
    }
}

// CI reads the resolved version from here instead of duplicating the
// version-code formula in shell. Runs without signing env vars.
tasks.register("printVersionInfo") {
    group = "help"
    description = "Prints the resolved versionCode and versionName."
    val resolvedCode = resolvedVersionCode
    val resolvedName = resolvedVersionName
    doLast {
        println("VERSION_CODE=$resolvedCode")
        println("VERSION_NAME=$resolvedName")
    }
}
