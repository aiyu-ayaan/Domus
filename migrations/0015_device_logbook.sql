-- Device logbook: one row per meaningful change of a device (on/off, mode, brightness, online...),
-- with who made it. Kept like the metrics, so it outlives a removed device.
CREATE TABLE device_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    at DATETIME NOT NULL,
    field TEXT NOT NULL,
    -- JSON values; NULL when the device did not report the field
    value TEXT,
    previous TEXT,
    -- JSON actor (user, automation, screen_sync); NULL for a change made on the device itself
    actor TEXT
);
CREATE INDEX idx_device_events_device_time ON device_events(device_id, at);
CREATE INDEX idx_device_events_time ON device_events(at);
