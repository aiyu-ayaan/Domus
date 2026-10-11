-- "Ask before switching": clients show a confirmation before they turn this device on or off.
-- Kept on the server so the choice follows the person between web, desktop and Android.
ALTER TABLE devices ADD COLUMN confirm_changes BOOLEAN NOT NULL DEFAULT 0;
