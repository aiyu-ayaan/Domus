// Repositories provider entry point
// By default, this exports the memory-backed Mock Repositories.
// To connect to a real backend, implement classes using apiClient and switch exports here.

import { MockAuthRepository } from './mock/auth.mock';
import { MockHomeRepository } from './mock/home.mock';
import { MockRoomRepository } from './mock/room.mock';
import { MockDeviceRepository } from './mock/device.mock';
import { MockIntegrationRepository } from './mock/integration.mock';
import { MockSceneRepository } from './mock/scene.mock';
import { MockAutomationRepository } from './mock/automation.mock';
import { MockNotificationRepository } from './mock/notification.mock';

export const authRepository = new MockAuthRepository();
export const homeRepository = new MockHomeRepository();
export const roomRepository = new MockRoomRepository();
export const deviceRepository = new MockDeviceRepository();
export const integrationRepository = new MockIntegrationRepository();
export const sceneRepository = new MockSceneRepository();
export const automationRepository = new MockAutomationRepository();
export const notificationRepository = new MockNotificationRepository();

// Type helper for the UI
export type Repositories = {
    auth: typeof authRepository;
    home: typeof homeRepository;
    room: typeof roomRepository;
    device: typeof deviceRepository;
    integration: typeof integrationRepository;
    scene: typeof sceneRepository;
    automation: typeof automationRepository;
    notification: typeof notificationRepository;
};
