package com.atech.core.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.serverDataStore by preferencesDataStore(name = "domus_server")

/** Persists the user-configured backend base URL (set from the app's settings UI). */
class ServerStore(private val context: Context) {

    private val urlKey = stringPreferencesKey("base_url")

    /** Emits the configured URL, or null until the user sets one. */
    val baseUrl: Flow<String?> = context.serverDataStore.data.map { it[urlKey] }

    suspend fun current(): String? = context.serverDataStore.data.first()[urlKey]

    suspend fun save(url: String) {
        context.serverDataStore.edit { it[urlKey] = url.trim().trimEnd('/') }
    }

    suspend fun clear() {
        context.serverDataStore.edit { it.remove(urlKey) }
    }
}
