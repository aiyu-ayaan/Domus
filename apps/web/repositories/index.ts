// Repositories provider entry point
// Dynamically switches between Mock and API implementations based on env.

import { MockAuthRepository } from "./mock/auth.mock";
import { MockHomeRepository } from "./mock/home.mock";
import { MockRoomRepository } from "./mock/room.mock";
import { MockDeviceRepository } from "./mock/device.mock";
import { MockIntegrationRepository } from "./mock/integration.mock";
import { MockSceneRepository } from "./mock/scene.mock";
import { MockAutomationRepository } from "./mock/automation.mock";
import { MockNotificationRepository } from "./mock/notification.mock";
import { MockEnergyRepository } from "./mock/energy.mock";

import { ApiAuthRepository } from "./api/auth.repository";
import { ApiHomeRepository } from "./api/home.repository";
import { ApiRoomRepository } from "./api/room.repository";
import { ApiDeviceRepository } from "./api/device.repository";
import { ApiIntegrationRepository } from "./api/integration.repository";
import { ApiSceneRepository } from "./api/scene.repository";
import { ApiAutomationRepository } from "./api/automation.repository";
import { ApiNotificationRepository } from "./api/notification.repository";
import { ApiEnergyRepository } from "./api/energy.repository";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export const authRepository = useMock
  ? new MockAuthRepository()
  : new ApiAuthRepository();
export const homeRepository = useMock
  ? new MockHomeRepository()
  : new ApiHomeRepository();
export const roomRepository = useMock
  ? new MockRoomRepository()
  : new ApiRoomRepository();
export const deviceRepository = useMock
  ? new MockDeviceRepository()
  : new ApiDeviceRepository();
export const integrationRepository = useMock
  ? new MockIntegrationRepository()
  : new ApiIntegrationRepository();
export const sceneRepository = useMock
  ? new MockSceneRepository()
  : new ApiSceneRepository();
export const automationRepository = useMock
  ? new MockAutomationRepository()
  : new ApiAutomationRepository();
export const notificationRepository = useMock
  ? new MockNotificationRepository()
  : new ApiNotificationRepository();
export const energyRepository = useMock
  ? new MockEnergyRepository()
  : new ApiEnergyRepository();

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
  energy: typeof energyRepository;
};
