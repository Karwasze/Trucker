-- Default muscle tags for the built-in exercises added after 0006. They may
-- already exist as custom exercises, so tags the user set are kept.
INSERT INTO exercise_muscles (exercise_name, muscle, role)
SELECT t.exercise_name, t.muscle, t.role
FROM (
    SELECT 'Pull-up' AS exercise_name, 'back' AS muscle, 'primary' AS role
    UNION ALL SELECT 'Pull-up', 'biceps', 'secondary'
    UNION ALL SELECT 'Incline Bench Press', 'chest', 'primary'
    UNION ALL SELECT 'Incline Bench Press', 'shoulders', 'secondary'
    UNION ALL SELECT 'Incline Bench Press', 'triceps', 'secondary'
    UNION ALL SELECT 'Incline Dumbbell Press', 'chest', 'primary'
    UNION ALL SELECT 'Incline Dumbbell Press', 'shoulders', 'secondary'
    UNION ALL SELECT 'Incline Dumbbell Press', 'triceps', 'secondary'
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM exercise_muscles m WHERE m.exercise_name = t.exercise_name
);
