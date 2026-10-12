import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.androidx.baselineprofile)
}

// Release signing from gitignored keystore.properties; without it the release build is unsigned.
val keystoreProps = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use(::load)
}

// The release's name and number: `version` and `build` of the root package.json, bumped by the release PR
// (scripts/set-version.mjs), so the app always matches the release it ships in.
val rootManifest = groovy.json.JsonSlurper().parse(rootProject.file("../../package.json")) as Map<*, *>

android {
    namespace = "com.aiyu.domus"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.aiyu.domus"
        minSdk = 26
        targetSdk = 36
        versionCode = rootManifest["build"] as Int
        versionName = rootManifest["version"] as String
    }

    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            manifestPlaceholders["appName"] = "Domus Dev"
        }
        create("prod") {
            dimension = "environment"
            manifestPlaceholders["appName"] = "Domus"
        }
    }

    signingConfigs {
        keystoreProps.getProperty("storeFile")?.let { path ->
            create("release") {
                storeFile = rootProject.file(path)
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
        debug {
            // Dev flavor isolates applicationId with .dev suffix
        }
    }

    androidResources {
        localeFilters += listOf("en", "hi", "es", "pt", "in", "ar")
        generateLocaleConfig = true
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// One profile for both flavors (same code, different applicationId): src/main/generated/baselineProfiles.
baselineProfile {
    mergeIntoMain = true
}

kotlin {
    compilerOptions {
        optIn.addAll(
            "androidx.compose.material3.ExperimentalMaterial3Api",
            "androidx.compose.material3.ExperimentalMaterial3ExpressiveApi",
        )
    }
}

dependencies {
    implementation(project(":core"))
    implementation(project(":ui-shared"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.kotlinx.serialization.json) // scene / automation bodies are edited as JSON objects
    implementation(libs.zxing.core) // draws the Tuya link QR code
    implementation(libs.markdown.m3) // release notes on the Updates page: headings, lists, tables
    implementation(libs.markdown.coil3) // images in release notes
    implementation(libs.coil.network.okhttp) // lets Coil fetch them
    implementation(libs.androidx.profileinstaller) // compiles the baseline profile at install, also when sideloaded
    baselineProfile(project(":baselineprofile"))
}
