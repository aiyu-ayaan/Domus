-- Scene kinds. 'standard' scenes run their actions once; 'screen_sync' scenes stream
-- the dominant colour of a shared screen to lights while the user shares it.
-- config_json holds kind-specific settings (for screen_sync: targets, colour style,
-- brightness range, smoothing, restore behaviour).
ALTER TABLE scenes ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE scenes ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}';
