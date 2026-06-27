package com.atech.core.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.atech.core.model.TokenPair
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.tokenDataStore by preferencesDataStore(name = "domus_tokens")

/** Persists the access/refresh token pair across process restarts. */
class TokenStore(private val context: Context) {

    private val accessKey = stringPreferencesKey("access_token")
    private val refreshKey = stringPreferencesKey("refresh_token")

    /** Emits true while a refresh token is stored (i.e. the user has a session). */
    val isLoggedIn: Flow<Boolean> =
        context.tokenDataStore.data.map { it[refreshKey] != null }

    suspend fun current(): TokenPair? {
        val prefs = context.tokenDataStore.data.first()
        val access = prefs[accessKey] ?: return null
        val refresh = prefs[refreshKey] ?: return null
        return TokenPair(access, refresh)
    }

    suspend fun save(tokens: TokenPair) {
        context.tokenDataStore.edit {
            it[accessKey] = tokens.access_token
            it[refreshKey] = tokens.refresh_token
        }
    }

    suspend fun clear() {
        context.tokenDataStore.edit {
            it.remove(accessKey)
            it.remove(refreshKey)
        }
    }
}
