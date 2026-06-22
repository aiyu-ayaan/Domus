// Utility to resolve local uploaded avatars vs external URLs
import { getServerUrl } from "@/lib/server-url";

export function getAvatarUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/static/")) {
    return `${getServerUrl()}${url}`;
  }
  return url;
}
