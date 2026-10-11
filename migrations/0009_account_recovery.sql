-- Accounts get a generated password that must be changed at first sign-in, except a kid's account,
-- whose password an administrator sets. A forgotten password is asked for (reset_requested_at) and
-- an administrator answers with a one-time code (stored hashed) that is good until reset_allowed_until
-- and for a few wrong tries.

ALTER TABLE users ADD COLUMN kid BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN reset_requested_at DATETIME;
ALTER TABLE users ADD COLUMN reset_allowed_until DATETIME;
ALTER TABLE users ADD COLUMN reset_code_hash TEXT;
ALTER TABLE users ADD COLUMN reset_attempts INTEGER NOT NULL DEFAULT 0;
