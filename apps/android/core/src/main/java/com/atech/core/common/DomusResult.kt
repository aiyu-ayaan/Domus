package com.atech.core.common

/**
 * Outcome of an API call. Repositories never throw for expected failures
 * (network down, 4xx/5xx) — they return [DomusResult.Failure] instead.
 */
sealed interface DomusResult<out T> {
    data class Success<T>(val data: T) : DomusResult<T>
    data class Failure(val error: DomusError) : DomusResult<Nothing>
}

fun <T> DomusResult<T>.getOrNull(): T? = (this as? DomusResult.Success)?.data

inline fun <T, R> DomusResult<T>.map(transform: (T) -> R): DomusResult<R> = when (this) {
    is DomusResult.Success -> DomusResult.Success(transform(data))
    is DomusResult.Failure -> this
}

inline fun <T> DomusResult<T>.onSuccess(block: (T) -> Unit): DomusResult<T> {
    if (this is DomusResult.Success) block(data)
    return this
}

inline fun <T> DomusResult<T>.onFailure(block: (DomusError) -> Unit): DomusResult<T> {
    if (this is DomusResult.Failure) block(error)
    return this
}

/** A failed call, classified so the UI can react (e.g. re-login on [Unauthorized]). */
data class DomusError(
    val kind: Kind,
    val message: String,
    val httpStatus: Int? = null,
    val cause: Throwable? = null,
) {
    enum class Kind { NETWORK, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, SERVER, CLIENT, SERIALIZATION, UNKNOWN }
}
