-- The bodyweight in kg the diet aims for, if set, for projecting when it's
-- reached.
ALTER TABLE diet_settings ADD COLUMN target_weight_kg REAL;
