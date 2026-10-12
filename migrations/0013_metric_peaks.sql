-- A stored sample is now the average of every poll in its minute. These keep the highest reading of
-- that minute, so a short spike survives in the history. NULL on rows written before this.
ALTER TABLE energy_metrics ADD COLUMN peak_watts REAL;
ALTER TABLE air_metrics ADD COLUMN pm25_max REAL;
