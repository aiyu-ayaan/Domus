package com.aiyu.domus.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

/** Release streams. A channel takes its own builds and every steadier one. [stage] orders them: alpha < beta < stable. */
enum class UpdateChannel(val label: String, val stage: Int, val code: String) {
    STABLE("Stable", 2, "channel.stable"),
    BETA("Beta", 1, "channel.beta"),
    ALPHA("Alpha", 0, "channel.alpha"),
}

/** [notes] is the release's description in Markdown; empty when it has none. */
data class AppUpdate(val version: String, val url: String, val notes: String = "")

/** What GitHub said: a newer release if there is one, and the notes of the installed version (null when it was never released). */
data class UpdateCheck(val update: AppUpdate?, val installedNotes: String?)

/** Finds a newer APK among the GitHub releases (.github/workflows/release.yml names them `Domus-<version>.apk`). */
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
            best = key to AppUpdate(tag.removePrefix("v"), apk, release.jsonObject["body"]?.jsonPrimitive?.contentOrNull.orEmpty())
        }
        return best?.second
    }

    /** The Markdown notes of the release of [version]; a dev build shows those of the release it was built from. */
    fun notesOf(releasesJson: String, version: String): String? {
        val tag = "v" + version.trim().removeSuffix("-dev")
        return Json.parseToJsonElement(releasesJson).jsonArray
            .firstOrNull { it.jsonObject["tag_name"]?.jsonPrimitive?.content == tag }
            ?.jsonObject?.get("body")?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
    }

    /** Asks GitHub. Throws when it can't be reached. */
    suspend fun check(installed: String, channel: UpdateChannel): UpdateCheck = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(RELEASES).header("Accept", "application/vnd.github+json").build()
        OkHttpClient().newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw java.io.IOException("GitHub answered ${response.code}")
            val releases = response.body!!.string()
            UpdateCheck(pick(releases, installed, channel), notesOf(releases, installed))
        }
    }

    /** Downloads [update]'s APK into [directory], replacing any earlier download; [onProgress] hears 0..1. Throws when it fails. */
    suspend fun download(update: AppUpdate, directory: java.io.File, onProgress: (Float) -> Unit = {}): java.io.File = withContext(Dispatchers.IO) {
        directory.deleteRecursively()
        directory.mkdirs()
        val file = java.io.File(directory, "Domus-${update.version}.apk")
        OkHttpClient().newCall(Request.Builder().url(update.url).build()).execute().use { response ->
            if (!response.isSuccessful) throw java.io.IOException("The download answered ${response.code}")
            val body = response.body!!
            // -1 when the server doesn't say; then nothing is reported and the bar stays at 0.
            val total = body.contentLength()
            val buffer = ByteArray(64 * 1024)
            var done = 0L
            file.outputStream().use { out ->
                val input = body.byteStream()
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                    done += read
                    if (total > 0) onProgress(done.toFloat() / total)
                }
            }
        }
        file
    }
}
