package com.aiyu.domus.core

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.SocketTimeoutException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class FoundServer(val name: String, val url: String)

/** Finds Domus servers on the local network: broadcasts a probe, servers answer (backend `infrastructure/beacon.rs`). */
object ServerDiscovery {
    private const val PORT = 48443
    private val PROBE = "DOMUS_DISCOVER".toByteArray()

    suspend fun scan(timeoutMillis: Long = 1_800): List<FoundServer> = withContext(Dispatchers.IO) {
        val found = LinkedHashMap<String, FoundServer>()
        runCatching {
            DatagramSocket().use { socket ->
                socket.broadcast = true
                socket.soTimeout = 300
                // The limited broadcast can leave by mobile data; each interface's own broadcast address reaches Wi-Fi.
                (broadcastAddresses() + InetAddress.getByName("255.255.255.255")).forEach {
                    runCatching { socket.send(DatagramPacket(PROBE, PROBE.size, it, PORT)) }
                }
                val buffer = ByteArray(512)
                val deadline = System.currentTimeMillis() + timeoutMillis
                while (System.currentTimeMillis() < deadline) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    try {
                        socket.receive(packet)
                    } catch (_: SocketTimeoutException) {
                        continue
                    }
                    val host = packet.address.hostAddress ?: continue
                    parseReply(String(packet.data, 0, packet.length), host)?.let { found[it.url] = it }
                }
            }
        }
        // Broadcasts don't cross an emulator's NAT or a USB cable. A server reachable through `adb reverse`
        // (the dev gateway sets it) or on the emulator's host address is offered too; on a normal phone
        // nothing listens there and this adds nothing.
        if (found.isEmpty()) {
            listOf("localhost", "10.0.2.2").firstOrNull { host ->
                runCatching { Socket().use { it.connect(InetSocketAddress(host, 8443), 400) } }.isSuccess
            }?.let { found["dev"] = FoundServer("This computer", "https://$it:8443") }
        }
        found.values.toList()
    }

    private fun broadcastAddresses(): List<InetAddress> = runCatching {
        NetworkInterface.getNetworkInterfaces().asSequence()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.interfaceAddresses.asSequence() }
            .mapNotNull { it.broadcast }
            .toList()
    }.getOrDefault(emptyList())

    /** Null for anything that is not a Domus server with TLS on (the app never talks cleartext). */
    internal fun parseReply(text: String, host: String): FoundServer? = runCatching {
        val reply = Json.parseToJsonElement(text).jsonObject
        if (reply["service"]?.jsonPrimitive?.contentOrNull != "domus") return null
        if (reply["tls"]?.jsonPrimitive?.booleanOrNull != true) return null
        val port = reply["port"]?.jsonPrimitive?.intOrNull?.takeIf { it in 1..65535 } ?: return null
        val name = reply["name"]?.jsonPrimitive?.contentOrNull?.take(60)?.ifBlank { null } ?: "Domus"
        FoundServer(name, "https://$host:$port")
    }.getOrNull()
}
