// Utility to resolve local uploaded avatars vs external URLs
export function getAvatarUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/static/")) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
    return `${base}${url}`;
  }
  return url;
}
