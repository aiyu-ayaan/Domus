#!/usr/bin/env node
// Dev gateway for the Android app.
// The dev server listens on 127.0.0.1 only, yet its discovery beacon answers phones on the LAN with this
// machine's address. This forwards every LAN address (same port) to the local server so that address works,
// and keeps `adb reverse` set so emulators and USB phones can also use localhost.
// Raw TCP: TLS stays end to end, the app still checks the server's certificate.
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

const PORT = Number(process.env.DOMUS__SERVER__PORT ?? 8443)
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Android', 'Sdk')
const adb = path.join(sdk, 'platform-tools', 'adb')

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address)

for (const address of addresses) {
  net
    .createServer((client) => {
      const server = net.connect(PORT, '127.0.0.1')
      client.pipe(server).pipe(client)
      const close = () => {
        client.destroy()
        server.destroy()
      }
      client.on('error', close)
      server.on('error', close)
    })
    .on('error', (e) =>
      // EADDRINUSE: the server itself already listens on the LAN (host 0.0.0.0), nothing to forward.
      console.log(e.code === 'EADDRINUSE' ? `${address}:${PORT} is already served directly` : `${address}: ${e.message}`),
    )
    .listen(PORT, address, () => console.log(`phone on Wi-Fi  -> https://${address}:${PORT}`))
}
if (addresses.length === 0) console.log('No LAN address found; only adb devices can connect.')

// Devices come and go, and adb forgets the mapping when they do.
let announced = false
const reverse = () =>
  execFile(adb, ['reverse', `tcp:${PORT}`, `tcp:${PORT}`], (error) => {
    if (!error && !announced) console.log(`emulator / USB  -> https://localhost:${PORT}`)
    announced = !error
  })
reverse()
setInterval(reverse, 5000)
