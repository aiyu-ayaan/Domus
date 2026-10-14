-- Notify administrators when a device stays on longer than this many minutes (NULL = never).
ALTER TABLE devices ADD COLUMN left_on_alert_minutes INTEGER;
