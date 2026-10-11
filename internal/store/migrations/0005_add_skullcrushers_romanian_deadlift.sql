-- Default muscle tags for the built-in exercises added after 0004. They may
-- already exist as custom exercises, so tags the user set are kept.
INSERT INTO exercise_muscles (exercise_name, muscle, role)
SELECT t.exercise_name, t.muscle, t.role
FROM (
    SELECT 'Skullcrushers' AS exercise_name, 'triceps' AS muscle, 'primary' AS role
    UNION ALL SELECT 'Romanian Deadlift', 'hamstrings', 'primary'
    UNION ALL SELECT 'Romanian Deadlift', 'glutes', 'primary'
    UNION ALL SELECT 'Romanian Deadlift', 'back', 'secondary'
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM exercise_muscles m WHERE m.exercise_name = t.exercise_name
);
