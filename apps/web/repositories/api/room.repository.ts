// API Room Repository implementation
import type { IRoomRepository } from '../types';
import type { RoomOut, RoomCreate, RoomUpdate } from '@/types/api';
import { apiClient } from '@/services/api-client';

export class ApiRoomRepository implements IRoomRepository {
    public async list(homeId?: string): Promise<RoomOut[]> {
        return apiClient.get('/rooms', {
            params: homeId ? { home_id: homeId } : undefined,
        });
    }

    public async create(req: RoomCreate): Promise<RoomOut> {
        return apiClient.post('/rooms', req);
    }

    public async update(id: string, req: RoomUpdate): Promise<RoomOut> {
        return apiClient.patch(`/rooms/${id}`, req);
    }

    public async delete(id: string): Promise<void> {
        return apiClient.delete(`/rooms/${id}`);
    }
}
