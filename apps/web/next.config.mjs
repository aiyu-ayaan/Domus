import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Env lives in the repo root (.env + .env.local), shared by api and web. Next
// only reads .env files from this app dir, so we pull the NEXT_PUBLIC_* keys up
// from the root here. Precedence: shell env > root .env.local > root .env. Only
// NEXT_PUBLIC_* are loaded (never API secrets), and a missing file is fine — in
// the Docker web build the root file isn't present and values come from ARGs.
const shellKeys = new Set(
  Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_")),
);
for (const file of [".env", ".env.local"]) {
  const path = fileURLToPath(new URL(`../../${file}`, import.meta.url));
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || shellKeys.has(m[1])) continue; // shell always wins
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); // .env.local overrides .env
  }
}

/** @type {import('next').NextConfig} */
// Set NEXT_OUTPUT=export to emit a static bundle in `out/` for the native
// (Capacitor) Android/iOS/desktop builds. Set NEXT_OUTPUT=standalone for the
// production Docker image. Leave unset for the normal local web build.
const isExport = process.env.NEXT_OUTPUT === "export";
const isStandalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig = {
  ...(isExport
    ? { output: "export", images: { unoptimized: true } }
    : isStandalone
      ? {
          output: "standalone",
          outputFileTracingRoot: resolve(
            fileURLToPath(new URL("../..", import.meta.url)),
          ),
        }
      : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
