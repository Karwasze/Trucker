-- Plan exercises now hold only a sets × reps scheme; target weights and
-- increments are worked out from logged workouts. The old progression
-- columns and training_plan_sets rows are no longer read but are kept, so
-- no data is lost.
ALTER TABLE training_plan_exercises ADD COLUMN set_count INTEGER NOT NULL DEFAULT 3;
ALTER TABLE training_plan_exercises ADD COLUMN reps INTEGER NOT NULL DEFAULT 5;

UPDATE training_plan_exercises
SET set_count = (SELECT COUNT(*) FROM training_plan_sets s WHERE s.plan_exercise_id = training_plan_exercises.id),
    reps = (SELECT MAX(s.reps) FROM training_plan_sets s WHERE s.plan_exercise_id = training_plan_exercises.id)
WHERE EXISTS (SELECT 1 FROM training_plan_sets s WHERE s.plan_exercise_id = training_plan_exercises.id);
