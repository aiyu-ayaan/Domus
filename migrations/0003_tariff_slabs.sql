-- Slab (telescopic) tariffs, e.g. MSEDCL: [{"up_to_kwh":100,"rate":4.71},{"up_to_kwh":null,"rate":10.29}].
-- Empty means the flat rate_per_kwh applies.
ALTER TABLE electricity_settings ADD COLUMN slabs TEXT NOT NULL DEFAULT '[]';
