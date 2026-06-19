// Abstract Repository Interfaces corresponding to Domus API Endpoints
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  TokenPair,
  RefreshRequest,
  ChangePasswordRequest,
  UserPublic,
  UserUpdateRequest,
  HomeOut,
  HomeCreate,
  HomeUpdate,
  RoomOut,
  RoomCreate,
  RoomUpdate,
  IntegrationOut,
  IntegrationCreate,
  IntegrationUpdate,
  DiscoveryResult,
  DeviceOut,
  DeviceCreate,
  DeviceUpdate,
  DeviceStateOut,
  Page,
  SceneOut,
  SceneCreate,
  SceneUpdate,
  SceneActivateResult,
  AutomationOut,
  AutomationCreate,
  AutomationUpdate,
  AutomationRunResult,
  NotificationOut,
} from "@/types/api";

export interface IAuthRepository {
  register(req: RegisterRequest): Promise<RegisterResponse>;
  login(req: LoginRequest): Promise<TokenPair>;
  refresh(req: RefreshRequest): Promise<TokenPair>;
  logout(req: RefreshRequest): Promise<void>;
  changePassword(req: ChangePasswordRequest): Promise<void>;
  getMe(): Promise<UserPublic>;
  updateMe(req: UserUpdateRequest): Promise<UserPublic>;
  deleteMe(): Promise<void>;
}

export interface IHomeRepository {
  list(): Promise<HomeOut[]>;
  get(id: string): Promise<HomeOut>;
  create(req: HomeCreate): Promise<HomeOut>;
  update(id: string, req: HomeUpdate): Promise<HomeOut>;
  delete(id: string): Promise<void>;
}

export interface IRoomRepository {
  list(homeId?: string): Promise<RoomOut[]>;
  create(req: RoomCreate): Promise<RoomOut>;
  update(id: string, req: RoomUpdate): Promise<RoomOut>;
  delete(id: string): Promise<void>;
}

export interface IDeviceRepository {
  list(params: {
    home_id: string;
    room_id?: string | null;
    device_type?: string;
    online?: boolean;
    limit?: number;
    offset?: number;
    sort?: string;
  }): Promise<Page<DeviceOut>>;
  get(id: string): Promise<DeviceOut>;
  create(req: DeviceCreate): Promise<DeviceOut>;
  update(id: string, req: DeviceUpdate): Promise<DeviceOut>;
  delete(id: string): Promise<void>;
  turnOn(id: string): Promise<DeviceStateOut>;
  turnOff(id: string): Promise<DeviceStateOut>;
  toggle(id: string): Promise<DeviceStateOut>;
  getState(id: string): Promise<DeviceStateOut>;
  getHistory(
    id: string,
    limit?: number,
    offset?: number,
  ): Promise<DeviceStateOut[]>;
}

export interface IIntegrationRepository {
  listAvailable(): Promise<string[]>;
  list(homeId?: string): Promise<IntegrationOut[]>;
  create(req: IntegrationCreate): Promise<IntegrationOut>;
  get(id: string): Promise<IntegrationOut>;
  update(id: string, req: IntegrationUpdate): Promise<IntegrationOut>;
  delete(id: string): Promise<void>;
  discover(id: string): Promise<DiscoveryResult>;
}

export interface ISceneRepository {
  list(homeId?: string): Promise<SceneOut[]>;
  create(req: SceneCreate): Promise<SceneOut>;
  get(id: string): Promise<SceneOut>;
  update(id: string, req: SceneUpdate): Promise<SceneOut>;
  delete(id: string): Promise<void>;
  activate(id: string): Promise<SceneActivateResult>;
}

export interface IAutomationRepository {
  list(homeId?: string): Promise<AutomationOut[]>;
  create(req: AutomationCreate): Promise<AutomationOut>;
  get(id: string): Promise<AutomationOut>;
  update(id: string, req: AutomationUpdate): Promise<AutomationOut>;
  delete(id: string): Promise<void>;
  trigger(
    id: string,
    context?: Record<string, any>,
  ): Promise<AutomationRunResult>;
}

export interface INotificationRepository {
  list(params: {
    home_id: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationOut[]>;
  markRead(id: string): Promise<NotificationOut>;
}
