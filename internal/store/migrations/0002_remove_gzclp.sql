DROP TABLE IF EXISTS gzclp_settings;
DROP TABLE IF EXISTS gzclp_day_exercises;

ALTER TABLE workouts DROP COLUMN workout_type;
ALTER TABLE workouts DROP COLUMN workout_day;
