-- A third grant level above control: edit. It lets the user rename a device and change its icon.
-- Edit implies control; the column is only read where can_control is set.

ALTER TABLE user_room_access ADD COLUMN can_edit BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE user_device_access ADD COLUMN can_edit BOOLEAN NOT NULL DEFAULT 0;
