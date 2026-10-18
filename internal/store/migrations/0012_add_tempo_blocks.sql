-- The tempo block in the middle of a long session, to check it by: its
-- distance and its speed (m/s) or heart rate range. Sessions planned before
-- have none and are checked as plain long sessions.
ALTER TABLE planned_sessions ADD COLUMN tempo_distance_m REAL;
ALTER TABLE planned_sessions ADD COLUMN tempo_speed_min REAL;
ALTER TABLE planned_sessions ADD COLUMN tempo_speed_max REAL;
ALTER TABLE planned_sessions ADD COLUMN tempo_hr_min REAL;
ALTER TABLE planned_sessions ADD COLUMN tempo_hr_max REAL;
