pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Domus"
include(":app")       // screens and navigation
include(":core")      // server discovery, TLS trust, API client, live state (no UI)
include(":ui-shared") // Material 3 Expressive theme, motion and shared components
