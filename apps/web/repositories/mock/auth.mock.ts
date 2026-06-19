// Mock Auth Repository implementation
import type { IAuthRepository } from "../types";
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  TokenPair,
  RefreshRequest,
  ChangePasswordRequest,
  UserPublic,
  UserUpdateRequest,
} from "@/types/api";
import { mockDb } from "@/mocks/mock-db";

export class MockAuthRepository implements IAuthRepository {
  private delay(ms: number = 300) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async register(req: RegisterRequest): Promise<RegisterResponse> {
    await this.delay(500);
    if (!req.email || !req.password || !req.full_name) {
      throw {
        error: {
          code: "validation_error",
          message: "Missing fields",
          details: [
            { loc: ["body"], msg: "Required fields missing", type: "missing" },
          ],
        },
      };
    }

    const user: UserPublic = {
      id: "user-" + Math.random().toString(36).substr(2, 9),
      email: req.email,
      full_name: req.full_name,
      avatar_url: null,
      role: "owner", // first registered is owner
      is_active: true,
      is_verified: true,
      created_at: new Date().toISOString(),
    };

    mockDb.set("user", user);

    const tokens: TokenPair = {
      access_token:
        "mock-access-token-" + Math.random().toString(36).substr(2, 9),
      refresh_token:
        "mock-refresh-token-" + Math.random().toString(36).substr(2, 9),
      token_type: "bearer",
    };

    return { user, tokens };
  }

  public async login(req: LoginRequest): Promise<TokenPair> {
    await this.delay(400);
    if (req.email === "owner@example.com" && req.password === "supersecret1") {
      return {
        access_token: "mock-access-token-owner",
        refresh_token: "mock-refresh-token-owner",
        token_type: "bearer",
      };
    }
    // General register mock behavior (allow any password for convenience in testing)
    if (req.password.length >= 8) {
      const user = mockDb.get("user");
      if (user && user.email === req.email) {
        return {
          access_token: "mock-access-token-" + user.id,
          refresh_token: "mock-refresh-token-" + user.id,
          token_type: "bearer",
        };
      }
    }
    throw {
      error: {
        code: "unauthorized",
        message:
          "Invalid credentials. Use email owner@example.com and password supersecret1",
        details: null,
      },
    };
  }

  public async refresh(req: RefreshRequest): Promise<TokenPair> {
    await this.delay(200);
    if (!req.refresh_token.startsWith("mock-refresh-token-")) {
      throw {
        error: {
          code: "unauthorized",
          message: "Invalid refresh token",
          details: null,
        },
      };
    }
    return {
      access_token:
        "mock-access-token-refreshed-" +
        Math.random().toString(36).substr(2, 9),
      refresh_token:
        "mock-refresh-token-refreshed-" +
        Math.random().toString(36).substr(2, 9),
      token_type: "bearer",
    };
  }

  public async logout(req: RefreshRequest): Promise<void> {
    await this.delay(100);
    return;
  }

  public async changePassword(req: ChangePasswordRequest): Promise<void> {
    await this.delay(300);
    if (req.current_password !== "supersecret1") {
      throw {
        error: {
          code: "unauthorized",
          message: "Incorrect current password",
          details: null,
        },
      };
    }
    return;
  }

  public async getMe(): Promise<UserPublic> {
    await this.delay(150);
    return mockDb.get("user");
  }

  public async updateMe(req: UserUpdateRequest): Promise<UserPublic> {
    await this.delay(250);
    const user = mockDb.get("user");
    const updated = {
      ...user,
      ...req,
    };
    mockDb.set("user", updated);
    return updated;
  }

  public async deleteMe(): Promise<void> {
    await this.delay(300);
    return;
  }
}
