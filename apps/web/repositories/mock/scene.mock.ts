// Mock Scene Repository implementation
import type { ISceneRepository } from '../types';
import type { SceneOut, SceneCreate, SceneUpdate, SceneActivateResult, DeviceStateOut } from '@/types/api';
import { mockDb } from '@/mocks/mock-db';

export class MockSceneRepository implements ISceneRepository {
    private delay(ms: number = 100) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    public async list(homeId?: string): Promise<SceneOut[]> {
        await this.delay();
        const scenes = mockDb.get('scenes');
        if (homeId) {
            return scenes.filter((s) => s.home_id === homeId);
        }
        return scenes;
    }

    public async get(id: string): Promise<SceneOut> {
        await this.delay();
        const scenes = mockDb.get('scenes');
        const scene = scenes.find((s) => s.id === id);
        if (!scene) {
            throw { error: { code: 'not_found', message: 'Scene not found', details: null } };
        }
        return scene;
    }

    public async create(req: SceneCreate): Promise<SceneOut> {
        await this.delay(200);
        const scenes = mockDb.get('scenes');
        const newScene: SceneOut = {
            id: 'scene-' + Math.random().toString(36).substr(2, 9),
            home_id: req.home_id,
            name: req.name,
            description: req.description,
            states: req.states,
            created_at: new Date().toISOString(),
        };
        mockDb.set('scenes', [...scenes, newScene]);
        return newScene;
    }

    public async update(id: string, req: SceneUpdate): Promise<SceneOut> {
        await this.delay(150);
        const scenes = mockDb.get('scenes');
        const idx = scenes.findIndex((s) => s.id === id);
        if (idx === -1) {
            throw { error: { code: 'not_found', message: 'Scene not found', details: null } };
        }
        const updated = {
            ...scenes[idx],
            ...req,
        } as SceneOut;
        const updatedList = [...scenes];
        updatedList[idx] = updated;
        mockDb.set('scenes', updatedList);
        return updated;
    }

    public async delete(id: string): Promise<void> {
        await this.delay(100);
        const scenes = mockDb.get('scenes');
        mockDb.set('scenes', scenes.filter((s) => s.id !== id));
    }

    public async activate(id: string): Promise<SceneActivateResult> {
        await this.delay(400); // Simulate activation lag
        const scene = await this.get(id);
        const states = mockDb.get('deviceStates');
        const histories = mockDb.get('deviceHistory');
        const devices = mockDb.get('devices');

        let applied = 0;
        let failed = 0;

        scene.states.forEach((sceneState) => {
            const dev = devices.find((d) => d.id === sceneState.device_id);
            if (!dev) {
                failed++;
                return;
            }

            // Set online
            dev.online = true;
            dev.last_seen = new Date().toISOString();

            // Set state
            const newState: DeviceStateOut = {
                id: 'state-' + Math.random().toString(36).substr(2, 9),
                device_id: sceneState.device_id,
                state: sceneState.state,
                attributes: {
                    ...(states[sceneState.device_id]?.attributes || {}),
                    ...sceneState.attributes,
                },
                created_at: new Date().toISOString(),
            };

            states[sceneState.device_id] = newState;

            // Add history
            const history = histories[sceneState.device_id] || [];
            histories[sceneState.device_id] = [newState, ...history].slice(0, 100);

            // Dispatch WS state change event
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('domus_mock_ws_broadcast', {
                        detail: {
                            type: 'device.state_changed',
                            home_id: scene.home_id,
                            data: {
                                device_id: sceneState.device_id,
                                state: sceneState.state,
                                attributes: newState.attributes,
                            },
                        },
                    })
                );
            }
            applied++;
        });

        // Trigger db save
        mockDb.set('deviceStates', states);
        mockDb.set('deviceHistory', histories);
        mockDb.set('devices', devices);

        return {
            scene_id: id,
            applied,
            failed,
        };
    }
}
