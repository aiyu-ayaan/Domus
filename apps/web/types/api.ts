// TypeScript DTOs derived from Domus OpenAPI Specification

export type Role = 'owner' | 'admin' | 'user' | 'guest';

export type DeviceType =
    | 'light'
    | 'plug'
    | 'switch'
    | 'sensor'
    | 'camera'
    | 'thermostat'
    | 'fan'
    | 'lock'
    | 'other';

export type IntegrationType = 'tapo' | 'xiaomi' | 'tuya' | 'mqtt' | 'matter' | 'zigbee';

export type NotificationType =
    | 'device_offline'
    | 'automation_failed'
    | 'new_device_found'
    | 'security_alert'
    | 'info';

export type TriggerType = 'device_state' | 'device_offline' | 'new_device' | 'time' | 'manual';

export type ConditionOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in';

export type ActionType =
    | 'device.turn_on'
    | 'device.turn_off'
    | 'device.toggle'
    | 'scene.activate'
    | 'notification.send';

// ==========================================
// Authentication & Users
// ==========================================

export interface UserPublic {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
    role: Role;
    is_active: boolean;
    is_verified: boolean;
    created_at: string;
}

export interface TokenPair {
    access_token: string;
    refresh_token: string;
    token_type: string;
}

export interface RegisterResponse {
    user: UserPublic;
    tokens: TokenPair;
}

export interface RegisterRequest {
    email: string;
    password: string;
    full_name: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RefreshRequest {
    refresh_token: string;
}

export interface ChangePasswordRequest {
    current_password: string;
    new_password: string;
}

export interface UserUpdateRequest {
    full_name?: string;
    avatar_url?: string | null;
}

// ==========================================
// Homes
// ==========================================

export interface HomeOut {
    id: string;
    name: string;
    description: string | null;
    timezone: string;
    owner_id: string;
    created_at: string;
}

export interface HomeCreate {
    name: string;
    description: string | null;
    timezone: string;
}

export interface HomeUpdate {
    name?: string;
    description?: string | null;
    timezone?: string;
}

// ==========================================
// Rooms
// ==========================================

export interface RoomOut {
    id: string;
    home_id: string;
    name: string;
    icon: string;
    created_at: string;
}

export interface RoomCreate {
    home_id: string;
    name: string;
    icon: string;
}

export interface RoomUpdate {
    name?: string;
    icon?: string;
}

// ==========================================
// Integrations & Discovery
// ==========================================

export interface IntegrationOut {
    id: string;
    home_id: string;
    name: string;
    type: IntegrationType;
    enabled: boolean;
    last_sync_at: string | null;
    created_at: string;
}

export interface IntegrationCreate {
    home_id: string;
    name: string;
    type: IntegrationType;
    enabled: boolean;
    config: Record<string, any>;
}

export interface IntegrationUpdate {
    name?: string;
    enabled?: boolean;
    config?: Record<string, any>;
}

export interface DiscoveredDevice {
    external_id: string;
    name: string;
    device_type: DeviceType;
    manufacturer: string;
    model: string;
    serial_number: string | null;
    attributes: Record<string, any>;
    already_registered: boolean;
}

export interface DiscoveryResult {
    integration_id: string;
    new_count: number;
    existing_count: number;
    discovered: DiscoveredDevice[];
}

// ==========================================
// Devices
// ==========================================

export interface DeviceOut {
    id: string;
    home_id: string;
    integration_id: string;
    room_id: string | null;
    external_id: string;
    name: string;
    manufacturer: string;
    model: string;
    serial_number: string | null;
    device_type: DeviceType;
    online: boolean;
    last_seen: string | null;
    meta: Record<string, any>;
    created_at: string;
}

export interface DeviceCreate {
    home_id: string;
    integration_id: string;
    room_id?: string | null;
    external_id: string;
    name: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string | null;
    device_type: DeviceType;
}

export interface DeviceUpdate {
    name?: string;
    room_id?: string | null;
    online?: boolean;
}

export interface DeviceStateOut {
    id: string;
    device_id: string;
    state: string; // 'on' | 'off' | 'open' | 'closed' | 'unknown'
    attributes: Record<string, any>;
    created_at: string;
}

export interface Page<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

// ==========================================
// Scenes
// ==========================================

export interface SceneDeviceState {
    device_id: string;
    state: string;
    attributes: Record<string, any>;
}

export interface SceneOut {
    id: string;
    home_id: string;
    name: string;
    description: string | null;
    states: SceneDeviceState[];
    created_at: string;
}

export interface SceneCreate {
    home_id: string;
    name: string;
    description: string | null;
    states: SceneDeviceState[];
}

export interface SceneUpdate {
    name?: string;
    description?: string | null;
    states?: SceneDeviceState[];
}

export interface SceneActivateResult {
    scene_id: string;
    applied: number;
    failed: number;
}

// ==========================================
// Automations
// ==========================================

export interface AutomationTrigger {
    type: TriggerType;
    device_id?: string | null;
    state?: string | null;
    at?: string | null;
}

export interface AutomationCondition {
    field: string;
    op: ConditionOp;
    value: any;
}

export interface AutomationAction {
    type: ActionType;
    device_id?: string;
    scene_id?: string;
    title?: string;
    body?: string;
}

export interface AutomationOut {
    id: string;
    home_id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
    last_triggered_at?: string | null;
    last_error?: string | null;
    created_at: string;
}

export interface AutomationCreate {
    home_id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
}

export interface AutomationUpdate {
    name?: string;
    enabled?: boolean;
    trigger?: AutomationTrigger;
    conditions?: AutomationCondition[];
    actions?: AutomationAction[];
}

export interface AutomationRunResult {
    automation_id: string;
    matched: boolean;
    executed: boolean;
    error: string | null;
}

// ==========================================
// Notifications
// ==========================================

export interface NotificationOut {
    id: string;
    home_id: string;
    type: NotificationType;
    title: string;
    body: string;
    read: boolean;
    meta: Record<string, any>;
    created_at: string;
}

// ==========================================
// Error Envelopes
// ==========================================

export interface ErrorDetails {
    loc: (string | number)[];
    msg: string;
    type: string;
}

export interface ApiError {
    error: {
        code:
            | 'validation_error'
            | 'unauthorized'
            | 'forbidden'
            | 'not_found'
            | 'conflict'
            | 'bad_request'
            | 'http_error';
        message: string;
        details: ErrorDetails[] | null;
    };
}
