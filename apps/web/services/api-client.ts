// Domus API client wrapper with JWT token insertion and auto-refresh logic
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RequestOptions extends RequestInit {
    params?: Record<string, string | number | boolean | undefined | null>;
}

class ApiClient {
    private async request(path: string, options: RequestOptions = {}): Promise<any> {
        const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/api/v1/${path}`}`);
        
        if (options.params) {
            Object.entries(options.params).forEach(([key, val]) => {
                if (val !== undefined && val !== null) {
                    url.searchParams.append(key, String(val));
                }
            });
        }

        const headers = new Headers(options.headers);
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        // Attach Access Token from Zustand store
        const { accessToken } = useAuthStore.getState();
        if (accessToken && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${accessToken}`);
        }

        const fetchOptions: RequestInit = {
            ...options,
            headers,
        };

        let response = await fetch(url.toString(), fetchOptions);

        // Auto-refresh on 401
        if (response.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
            try {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry original request with new token
                    const newAccessToken = useAuthStore.getState().accessToken;
                    headers.set('Authorization', `Bearer ${newAccessToken}`);
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
                errorData = { error: { code: 'http_error', message: response.statusText, details: null } };
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

        try {
            const url = `${API_BASE_URL}/api/v1/auth/refresh`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });

            if (!res.ok) {
                return false;
            }

            const data = await res.json(); // returns TokenPair
            setTokens(data.access_token, data.refresh_token);
            return true;
        } catch {
            return false;
        }
    }

    public get(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request(path, { ...options, method: 'GET' });
    }

    public post(path: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request(path, {
            ...options,
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    public patch(path: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request(path, {
            ...options,
            method: 'PATCH',
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    public delete(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request(path, { ...options, method: 'DELETE' });
    }
}

export const apiClient = new ApiClient();
