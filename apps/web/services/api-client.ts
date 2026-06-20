// Domus API client wrapper with JWT token insertion and auto-refresh logic
import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

class ApiClient {
  private async request(
    path: string,
    options: RequestOptions = {},
  ): Promise<any> {
    // Every REST endpoint lives under /api/v1. Normalize the leading slash and
    // prepend the prefix unless the caller already included it.
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const prefixed = normalized.startsWith("/api/v1")
      ? normalized
      : `/api/v1${normalized}`;
    const url = new URL(`${API_BASE_URL}${prefixed}`);

    if (options.params) {
      Object.entries(options.params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    // Attach Access Token from Zustand store
    const { accessToken } = useAuthStore.getState();
    if (accessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const fetchOptions: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
    };

    let response;
    try {
      response = await fetch(url.toString(), fetchOptions);
    } finally {
      clearTimeout(timeoutId);
    }

    // Auto-refresh on 401
    if (
      response.status === 401 &&
      !path.includes("/auth/refresh") &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/logout")
    ) {
      try {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry original request with new token
          const newAccessToken = useAuthStore.getState().accessToken;
          headers.set("Authorization", `Bearer ${newAccessToken}`);
          response = await fetch(url.toString(), fetchOptions);
        } else {
          useAuthStore.getState().logout();
        }
      } catch (err) {
        useAuthStore.getState().logout();
        throw err;
      }
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          error: {
            code: "http_error",
            message: response.statusText,
            details: null,
          },
        };
      }
      throw errorData;
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  private async refreshToken(): Promise<boolean> {
    const { refreshToken, setTokens } = useAuthStore.getState();
    if (!refreshToken) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `${API_BASE_URL}/api/v1/auth/refresh`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json(); // returns TokenPair
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public get(path: string, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request(path, { ...options, method: "GET" });
  }

  public post(
    path: string,
    body?: any,
    options?: Omit<RequestOptions, "method" | "body">,
  ) {
    return this.request(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public postForm(
    path: string,
    body: FormData,
    options?: Omit<RequestOptions, "method" | "body">,
  ) {
    return this.request(path, {
      ...options,
      method: "POST",
      body,
    });
  }

  public patch(
    path: string,
    body?: any,
    options?: Omit<RequestOptions, "method" | "body">,
  ) {
    return this.request(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete(
    path: string,
    options?: Omit<RequestOptions, "method" | "body">,
  ) {
    return this.request(path, { ...options, method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
