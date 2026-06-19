// API Automation Repository implementation
import type { IAutomationRepository } from '../types';
import type { AutomationOut, AutomationCreate, AutomationUpdate, AutomationRunResult } from '@/types/api';
import { apiClient } from '@/services/api-client';

export class ApiAutomationRepository implements IAutomationRepository {
    public async list(homeId?: string): Promise<AutomationOut[]> {
        return apiClient.get('/automations', {
            params: homeId ? { home_id: homeId } : undefined,
        });
    }

    public async create(req: AutomationCreate): Promise<AutomationOut> {
        return apiClient.post('/automations', req);
    }

    public async get(id: string): Promise<AutomationOut> {
        return apiClient.get(`/automations/${id}`);
    }

    public async update(id: string, req: AutomationUpdate): Promise<AutomationOut> {
        return apiClient.patch(`/automations/${id}`, req);
    }

    public async delete(id: string): Promise<void> {
        return apiClient.delete(`/automations/${id}`);
    }

    public async trigger(id: string, context?: Record<string, any>): Promise<AutomationRunResult> {
        return apiClient.post(`/automations/${id}/trigger`, context || {});
    }
}
