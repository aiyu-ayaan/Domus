// Resolves the Domus API base URL at runtime.
//
// Web (served from the Docker bundle or dev): the URL is baked at build time via
// NEXT_PUBLIC_API_URL, so the app "just works" with no setup screen.
// Native (Android / iOS / desktop): there is no bundled server, so the user
// picks one on first launch; we persist it on-device and read it here.
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "domus:server-url";
const ENV_DEFAULT =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** True when running inside the Electron desktop shell. */
export function isElectron(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      !!window.navigator &&
      /electron/i.test(window.navigator.userAgent)
    );
  } catch {
    return false;
  }
}

/** True on Android, iOS, and the Electron desktop shell — false in a browser. */
export function isNativePlatform(): boolean {
  try {
    if (isElectron()) return true;
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True on Android/iOS specifically — embedded WebViews that lack getDisplayMedia(). */
export function isNativeMobilePlatform(): boolean {
  return isNativePlatform() && !isElectron();
}

export function getStoredServerUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The base URL every API/WebSocket/asset call should use. */
export function getServerUrl(): string {
  return (getStoredServerUrl() || ENV_DEFAULT).replace(/\/+$/, "");
}

/** Native app launched without a server picked yet → show the setup screen. */
export function needsServerSetup(): boolean {
  if (typeof window === "undefined") return false;
  return isNativePlatform() && !getStoredServerUrl();
}

/** Accept "192.168.1.5:8000" or "https://domus.example.com/" and tidy it. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, "");
}

export function setServerUrl(input: string): string {
  const url = normalizeServerUrl(input);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, url);
    } catch {}
  }
  return url;
}

export function clearServerUrl(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Reachability check against the API's unauthenticated /health endpoint. */
export async function validateServerUrl(input: string): Promise<boolean> {
  const url = normalizeServerUrl(input);
  if (!url) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
