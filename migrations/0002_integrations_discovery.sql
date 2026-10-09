-- Integrations, discovery inbox, access control, notifications and settings.

ALTER TABLE users ADD COLUMN all_rooms BOOLEAN NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_room_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
);

-- Linked integration accounts (Tuya QR login, Tapo credentials, Xiaomi cloud).
-- credentials_enc is AES-256-GCM encrypted JSON.
CREATE TABLE IF NOT EXISTS integration_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    integration_type TEXT NOT NULL,
    name TEXT NOT NULL,
    credentials_enc TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',
    last_error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE devices ADD COLUMN external_id TEXT;
ALTER TABLE devices ADD COLUMN account_id TEXT REFERENCES integration_accounts(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN secrets_enc TEXT;
ALTER TABLE devices ADD COLUMN icon TEXT;
ALTER TABLE devices ADD COLUMN last_seen DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_external ON devices(integration_type, external_id);

CREATE TABLE IF NOT EXISTS discovered_devices (
    id TEXT PRIMARY KEY NOT NULL,
    integration_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    account_id TEXT REFERENCES integration_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    model TEXT,
    ip_address TEXT,
    mac_address TEXT,
    config_json TEXT NOT NULL DEFAULT '{}',
    secrets_enc TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'ignored', 'adopted'
    discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (integration_type, external_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    level TEXT NOT NULL DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL
);

ALTER TABLE automations ADD COLUMN last_triggered_at DATETIME;
ALTER TABLE electricity_settings ADD COLUMN fixed_monthly_charge REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_energy_metrics_time ON energy_metrics(recorded_at);
