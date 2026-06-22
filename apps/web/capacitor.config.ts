import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the static Next.js export (built with NEXT_OUTPUT=export -> `out/`) into
// native Android/iOS/desktop apps. The app talks to your self-hosted Domus API
// over the network via NEXT_PUBLIC_API_URL, which is baked into the web bundle
// at build time — set it before building for native (see RUNNING.md).
const config: CapacitorConfig = {
  appId: "com.domus.app",
  appName: "Domus",
  webDir: "out",
  backgroundColor: "#0a0e17",
  // Self-hosted Domus servers are usually plain HTTP on the LAN. Serve the app
  // over http://localhost (not the https default) so calling http:// APIs and
  // opening ws:// sockets isn't blocked as mixed content. cleartext lets the
  // webview reach those http origins; Android also needs usesCleartextTraffic
  // in AndroidManifest.xml (set), and iOS needs an ATS exception (add when you
  // build for iOS).
  server: {
    androidScheme: "http",
    iosScheme: "http",
    cleartext: true,
  },
};

export default config;
