package com.aiyu.domus.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

/** Release streams. A channel takes its own builds and every steadier one. [stage] orders them: alpha < beta < stable. */
enum class UpdateChannel(val label: String, val stage: Int) { STABLE("Stable", 2), BETA("Beta", 1), ALPHA("Alpha", 0) }

data class AppUpdate(val version: String, val url: String)

/** Finds a newer APK among the GitHub releases (.github/workflows/release.yml names them `Docus-<version>.apk`). */
object Updates {
    private const val RELEASES = "https://api.github.com/repos/aiyu-ayaan/Domus-Rust/releases?per_page=30"
    private val VERSION = Regex("""^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$""")

    /** `1.2.3-beta.4` as [major, minor, patch, stage, number]; null for any other shape (a `-dev` build among them). */
    fun versionKey(text: String): List<Int>? {
        val (major, minor, patch, label, number) = VERSION.matchEntire(text.trim())?.destructured ?: return null
        val stage = when (label) { "alpha" -> 0; "beta" -> 1; else -> 2 }
        // A stable release has no pre-release number and still sorts above every one of its pre-releases.
        return listOf(major.toInt(), minor.toInt(), patch.toInt(), stage, number.toIntOrNull() ?: Int.MAX_VALUE)
    }

    private fun newer(a: List<Int>, b: List<Int>): Boolean =
        a.zip(b).firstOrNull { (x, y) -> x != y }?.let { (x, y) -> x > y } ?: false

    /** The channel a build belongs to, the default: whoever installed an alpha wants alphas. */
    fun channelOf(version: String): UpdateChannel =
        UpdateChannel.entries.firstOrNull { it.stage == versionKey(version)?.get(3) } ?: UpdateChannel.STABLE

    /**
     * The newest release on [channel] that is newer than [installed] and carries an APK, from GitHub's
     * release list. Releases without one (a Docker-only release) are passed over.
     */
    fun pick(releasesJson: String, installed: String, channel: UpdateChannel): AppUpdate? {
        val current = versionKey(installed) ?: return null
        var best: Pair<List<Int>, AppUpdate>? = null
        for (release in Json.parseToJsonElement(releasesJson).jsonArray) {
            val tag = release.jsonObject["tag_name"]?.jsonPrimitive?.content ?: continue
            val key = versionKey(tag) ?: continue
            if (key[3] < channel.stage || !newer(key, current) || best?.let { !newer(key, it.first) } == true) continue
            val apk = release.jsonObject["assets"]?.jsonArray
                ?.mapNotNull { it.jsonObject["browser_download_url"]?.jsonPrimitive?.content }
                ?.firstOrNull { it.endsWith(".apk") } ?: continue
            best = key to AppUpdate(tag.removePrefix("v"), apk)
        }
        return best?.second
    }

    /** Asks GitHub. Throws when it can't be reached. */
    suspend fun check(installed: String, channel: UpdateChannel): AppUpdate? = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(RELEASES).header("Accept", "application/vnd.github+json").build()
        OkHttpClient().newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw java.io.IOException("GitHub answered ${response.code}")
            pick(response.body!!.string(), installed, channel)
        }
    }
}
