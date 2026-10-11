-- Alerts about accounts, discovery and failing automations are for administrators only.
-- The ones an automation sends on purpose stay visible to everyone.

ALTER TABLE notifications ADD COLUMN admin_only BOOLEAN NOT NULL DEFAULT 0;

UPDATE notifications SET admin_only = 1
WHERE title IN ('Password reset requested', 'New device added', 'New device found')
   OR title LIKE 'Automation "%" had problems';
