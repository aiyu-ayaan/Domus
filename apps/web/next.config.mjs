/** @type {import('next').NextConfig} */
// Set NEXT_OUTPUT=export to emit a static bundle in `out/` for the native
// (Capacitor) Android/iOS/desktop builds. Unset for the normal web/server build.
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig = {
  ...(isExport ? { output: "export", images: { unoptimized: true } } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
