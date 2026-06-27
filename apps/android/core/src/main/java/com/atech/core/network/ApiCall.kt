package com.atech.core.network

import com.atech.core.common.DomusError
import com.atech.core.common.DomusResult
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.ResponseException
import io.ktor.client.plugins.ServerResponseException
import io.ktor.client.statement.HttpResponse
import io.ktor.serialization.JsonConvertException
import java.io.IOException

/**
 * Runs an API [request], deserializes the body to [T], and folds every expected
 * failure into [DomusResult.Failure]. Repositories call this so they never throw.
 */
suspend inline fun <reified T> safeApiCall(
    crossinline request: suspend () -> HttpResponse,
): DomusResult<T> =
    try {
        DomusResult.Success(request().body())
    } catch (e: ClientRequestException) {
        DomusResult.Failure(httpError(e, e.response.status.value))
    } catch (e: ServerResponseException) {
        DomusResult.Failure(httpError(e, e.response.status.value))
    } catch (e: ResponseException) {
        DomusResult.Failure(httpError(e, e.response.status.value))
    } catch (e: HttpRequestTimeoutException) {
        DomusResult.Failure(DomusError(DomusError.Kind.NETWORK, "Request timed out", cause = e))
    } catch (e: JsonConvertException) {
        DomusResult.Failure(DomusError(DomusError.Kind.SERIALIZATION, e.message ?: "Bad response", cause = e))
    } catch (e: IOException) {
        DomusResult.Failure(DomusError(DomusError.Kind.NETWORK, e.message ?: "Network unavailable", cause = e))
    } catch (e: Exception) {
        DomusResult.Failure(DomusError(DomusError.Kind.UNKNOWN, e.message ?: "Unknown error", cause = e))
    }

@PublishedApi
internal fun httpError(e: Throwable, status: Int): DomusError {
    val kind = when (status) {
        401 -> DomusError.Kind.UNAUTHORIZED
        403 -> DomusError.Kind.FORBIDDEN
        404 -> DomusError.Kind.NOT_FOUND
        429 -> DomusError.Kind.RATE_LIMITED
        in 400..499 -> DomusError.Kind.CLIENT
        in 500..599 -> DomusError.Kind.SERVER
        else -> DomusError.Kind.UNKNOWN
    }
    return DomusError(kind, e.message ?: "HTTP $status", httpStatus = status, cause = e)
}
