-- Air quality history: periodic readings of devices that report PM2.5.
CREATE TABLE IF NOT EXISTS air_metrics (
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    pm25 REAL NOT NULL,
    temperature REAL,
    humidity REAL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_air_metrics_device_time ON air_metrics(device_id, recorded_at);
