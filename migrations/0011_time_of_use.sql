-- Time-of-day adjustments on top of the flat or slab rate, on the home's clock:
-- [{"start":"22:00","end":"06:00","adjust":-1.5},{"start":"18:00","end":"22:00","adjust":1.1}].
ALTER TABLE electricity_settings ADD COLUMN time_of_use TEXT NOT NULL DEFAULT '[]';
