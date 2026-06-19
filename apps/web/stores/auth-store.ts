// Zustand Auth Store implementation
import { create } from "zustand";
import { authRepository } from "@/repositories";
import type {
  UserPublic,
  LoginRequest,
  RegisterRequest,
  UserUpdateRequest,
} from "@/types/api";

interface AuthState {
  user: UserPublic | null;
  accessToken: string | null;
  refreshToken: string | null;
  rememberMe: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setTokens: (accessToken: string | null, refreshToken: string | null) => void;
  setRememberMe: (remember: boolean) => void;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (req: UserUpdateRequest) => Promise<void>;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  rememberMe: false,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setTokens: (accessToken, refreshToken) => {
    set({ accessToken, refreshToken });
    if (typeof window !== "undefined") {
      const remember = get().rememberMe;
      if (accessToken && refreshToken) {
        if (remember) {
          localStorage.setItem("domus_at", accessToken);
          localStorage.setItem("domus_rt", refreshToken);
        } else {
          sessionStorage.setItem("domus_at", accessToken);
          sessionStorage.setItem("domus_rt", refreshToken);
        }
      } else {
        localStorage.removeItem("domus_at");
        localStorage.removeItem("domus_rt");
        sessionStorage.removeItem("domus_at");
        sessionStorage.removeItem("domus_rt");
      }
    }
  },

  setRememberMe: (rememberMe) => {
    set({ rememberMe });
    if (typeof window !== "undefined") {
      localStorage.setItem("domus_remember", String(rememberMe));
    }
  },

  login: async (req) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await authRepository.login(req);
      get().setTokens(tokens.access_token, tokens.refresh_token);

      const user = await authRepository.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const errMsg = err?.error?.message || err?.message || "Login failed";
      set({ isLoading: false, error: errMsg });
      throw err;
    }
  },

  register: async (req) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authRepository.register(req);
      get().setTokens(res.tokens.access_token, res.tokens.refresh_token);
      set({ user: res.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const errMsg =
        err?.error?.message || err?.message || "Registration failed";
      set({ isLoading: false, error: errMsg });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    const { refreshToken } = get();
    try {
      if (refreshToken) {
        await authRepository.logout({ refresh_token: refreshToken });
      }
    } catch {
      // ignore logout errors
    } finally {
      get().setTokens(null, null);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  updateProfile: async (req) => {
    try {
      const updatedUser = await authRepository.updateMe(req);
      set({ user: updatedUser });
    } catch (err: any) {
      throw err;
    }
  },

  initializeAuth: async () => {
    if (typeof window === "undefined") {
      console.log("[AuthStore] initializeAuth: SSR skip");
      return;
    }
    console.log("[AuthStore] initializeAuth: Starting check on client...");
    set({ isLoading: true });

    try {
      console.log(
        "[AuthStore] initializeAuth: Reading rememberMe from localStorage...",
      );
      const rememberStr = localStorage.getItem("domus_remember");
      const rememberMe = rememberStr === "true";
      console.log("[AuthStore] initializeAuth: rememberMe is", rememberMe);
      set({ rememberMe });

      let accessToken = null;
      let refreshToken = null;

      if (rememberMe) {
        console.log(
          "[AuthStore] initializeAuth: Reading tokens from localStorage...",
        );
        accessToken = localStorage.getItem("domus_at");
        refreshToken = localStorage.getItem("domus_rt");
      } else {
        console.log(
          "[AuthStore] initializeAuth: Reading tokens from sessionStorage...",
        );
        accessToken = sessionStorage.getItem("domus_at");
        refreshToken = sessionStorage.getItem("domus_rt");
      }
      console.log(
        "[AuthStore] initializeAuth: Tokens read => accessToken:",
        !!accessToken,
        "refreshToken:",
        !!refreshToken,
      );

      if (accessToken && refreshToken) {
        set({ accessToken, refreshToken });
        try {
          console.log(
            "[AuthStore] initializeAuth: Fetching user details (getMe)...",
          );
          const user = await authRepository.getMe();
          console.log(
            "[AuthStore] initializeAuth: getMe success! User:",
            user?.full_name,
          );
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err) {
          console.warn(
            "[AuthStore] initializeAuth: Invalid token or fetch failed, clearing session.",
            err,
          );
          get().setTokens(null, null);
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      } else {
        console.log(
          "[AuthStore] initializeAuth: No tokens found, setting isLoading: false",
        );
        set({ isLoading: false });
      }
    } catch (err) {
      console.error(
        "[AuthStore] initializeAuth: Fatal error during check:",
        err,
      );
      // Safe fallback to prevent loader freeze
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
