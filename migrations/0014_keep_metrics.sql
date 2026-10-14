-- History outlives the device: removing a device no longer deletes its readings, and adding the same
-- device again (same integration and external id) takes back its old id, so its history continues.
-- SQLite cannot drop a foreign key, so both metric tables are rebuilt without one.

CREATE TABLE energy_metrics_new (
    id TEXT PRIMARY KEY NOT NULL,
    device_id TEXT NOT NULL,
    power_watts REAL NOT NULL DEFAULT 0.0,
    energy_kwh REAL NOT NULL DEFAULT 0.0,
    voltage REAL,
    current_amps REAL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    peak_watts REAL
);
INSERT INTO energy_metrics_new (id, device_id, power_watts, energy_kwh, voltage, current_amps, recorded_at, peak_watts)
    SELECT id, device_id, power_watts, energy_kwh, voltage, current_amps, recorded_at, peak_watts FROM energy_metrics;
DROP TABLE energy_metrics;
ALTER TABLE energy_metrics_new RENAME TO energy_metrics;
CREATE INDEX idx_energy_metrics_device_time ON energy_metrics(device_id, recorded_at);
CREATE INDEX idx_energy_metrics_time ON energy_metrics(recorded_at);

CREATE TABLE air_metrics_new (
    device_id TEXT NOT NULL,
    pm25 REAL NOT NULL,
    temperature REAL,
    humidity REAL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pm25_max REAL
);
INSERT INTO air_metrics_new (device_id, pm25, temperature, humidity, recorded_at, pm25_max)
    SELECT device_id, pm25, temperature, humidity, recorded_at, pm25_max FROM air_metrics;
DROP TABLE air_metrics;
ALTER TABLE air_metrics_new RENAME TO air_metrics;
CREATE INDEX idx_air_metrics_device_time ON air_metrics(device_id, recorded_at);

-- The id a removed device had, so adding it again picks its history back up.
CREATE TABLE removed_devices (
    integration_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    removed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (integration_type, external_id)
);
