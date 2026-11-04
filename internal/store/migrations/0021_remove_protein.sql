-- Protein is no longer tracked: drop the grams logged per day and the old
-- daily target, along with what was stored in them. Days kept to and the
-- target weight stay.
ALTER TABLE diet_days DROP COLUMN protein_g;
ALTER TABLE diet_settings DROP COLUMN protein_target_g;
