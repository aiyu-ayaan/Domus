// API Home Repository implementation
import type { IHomeRepository } from '../types';
import type { HomeOut, HomeCreate, HomeUpdate } from '@/types/api';
import { apiClient } from '@/services/api-client';

export class ApiHomeRepository implements IHomeRepository {
    public async list(): Promise<HomeOut[]> {
        return apiClient.get('/homes');
    }

    public async get(id: string): Promise<HomeOut> {
        return apiClient.get(`/homes/${id}`);
    }

    public async create(req: HomeCreate): Promise<HomeOut> {
        return apiClient.post('/homes', req);
    }

    public async update(id: string, req: HomeUpdate): Promise<HomeOut> {
        return apiClient.patch(`/homes/${id}`, req);
    }

    public async delete(id: string): Promise<void> {
        return apiClient.delete(`/homes/${id}`);
    }
}
