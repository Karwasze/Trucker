-- Whether a workout was indoors (e.g. on a treadmill), as Apple Health
-- records it. The watch only estimates an indoor workout's distance, so it
-- can be entered by hand. NULL for workouts imported before this was kept.
ALTER TABLE cardio_workouts ADD COLUMN indoor INTEGER;
