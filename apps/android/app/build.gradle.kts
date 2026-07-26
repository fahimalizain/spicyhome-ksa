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

android {
    namespace = "com.spicyhome.pos"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.spicyhome.pos"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
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
