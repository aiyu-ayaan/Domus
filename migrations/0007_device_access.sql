-- Per-device grants: a user can be given single devices instead of a whole room.
-- Every grant is either full (see and control) or see-only (can_control = 0).

ALTER TABLE user_room_access ADD COLUMN can_control BOOLEAN NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_device_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    can_control BOOLEAN NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, device_id)
);
