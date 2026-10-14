-- Solar: devices that measure generation (not consumption), and how exported units are paid.
-- export_mode: 'net' (exported units offset imported ones on the bill) or 'feed_in' (paid at export_rate).
ALTER TABLE electricity_settings ADD COLUMN solar_device_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE electricity_settings ADD COLUMN export_mode TEXT NOT NULL DEFAULT 'net';
ALTER TABLE electricity_settings ADD COLUMN export_rate REAL NOT NULL DEFAULT 0;
