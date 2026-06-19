// API Auth Repository implementation
import type { IAuthRepository } from '../types';
import type {
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    TokenPair,
    RefreshRequest,
    ChangePasswordRequest,
    UserPublic,
    UserUpdateRequest,
} from '@/types/api';
import { apiClient } from '@/services/api-client';

export class ApiAuthRepository implements IAuthRepository {
    public async register(req: RegisterRequest): Promise<RegisterResponse> {
        return apiClient.post('/auth/register', req);
    }

    public async login(req: LoginRequest): Promise<TokenPair> {
        return apiClient.post('/auth/login', req);
    }

    public async refresh(req: RefreshRequest): Promise<TokenPair> {
        return apiClient.post('/auth/refresh', req);
    }

    public async logout(req: RefreshRequest): Promise<void> {
        return apiClient.post('/auth/logout', req);
    }

    public async changePassword(req: ChangePasswordRequest): Promise<void> {
        return apiClient.post('/auth/change-password', req);
    }

    public async getMe(): Promise<UserPublic> {
        return apiClient.get('/users/me');
    }

    public async updateMe(req: UserUpdateRequest): Promise<UserPublic> {
        return apiClient.patch('/users/me', req);
    }

    public async deleteMe(): Promise<void> {
        return apiClient.delete('/users/me');
    }
}
