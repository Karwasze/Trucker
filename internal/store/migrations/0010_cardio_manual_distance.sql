-- Whether distance_m was entered by hand, for workouts Apple Health has no
-- distance for (e.g. an indoor ride without a speed sensor). Existing
-- workouts all came from Health, so they default to measured.
ALTER TABLE cardio_workouts ADD COLUMN manual_distance INTEGER NOT NULL DEFAULT 0;
