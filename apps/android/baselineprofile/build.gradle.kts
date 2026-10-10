plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "com.aiyu.domus.baselineprofile"
    compileSdk = 37

    defaultConfig {
        minSdk = 28 // profiles can be collected from Android 9
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Both flavors run the same code, so one is recorded: dev, the one a development device is signed in to.
        missingDimensionStrategy("environment", "dev")
    }

    targetProjectPath = ":app"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

baselineProfile {
    useConnectedDevices = true
}

// The flavor decides the applicationId (.dev suffix); hand the real one to the generator.
androidComponents {
    onVariants { variant ->
        val artifacts = variant.artifacts.getBuiltArtifactsLoader()
        variant.instrumentationRunnerArguments.put(
            "targetAppId",
            variant.testedApks.map { artifacts.load(it)?.applicationId ?: "" },
        )
    }
}

dependencies {
    implementation(libs.androidx.test.ext.junit)
    implementation(libs.androidx.test.uiautomator)
    implementation(libs.androidx.benchmark.macro.junit4)
}
