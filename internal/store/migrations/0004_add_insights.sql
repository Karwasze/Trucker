CREATE TABLE bodyweight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    weight REAL NOT NULL
);

-- Keyed by exercise name, like logged workouts, so tags survive removing an
-- exercise from the library.
CREATE TABLE exercise_muscles (
    exercise_name TEXT NOT NULL,
    muscle TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
    PRIMARY KEY (exercise_name, muscle)
);

INSERT OR IGNORE INTO exercise_muscles (exercise_name, muscle, role) VALUES
    ('Squat', 'quads', 'primary'),
    ('Squat', 'glutes', 'primary'),
    ('Squat', 'hamstrings', 'secondary'),
    ('Bench Press', 'chest', 'primary'),
    ('Bench Press', 'triceps', 'secondary'),
    ('Bench Press', 'shoulders', 'secondary'),
    ('Deadlift', 'hamstrings', 'primary'),
    ('Deadlift', 'glutes', 'primary'),
    ('Deadlift', 'back', 'primary'),
    ('Deadlift', 'quads', 'secondary'),
    ('Overhead Press', 'shoulders', 'primary'),
    ('Overhead Press', 'triceps', 'secondary'),
    ('Front Squat', 'quads', 'primary'),
    ('Front Squat', 'glutes', 'secondary'),
    ('Front Squat', 'core', 'secondary'),
    ('Sumo Deadlift', 'glutes', 'primary'),
    ('Sumo Deadlift', 'quads', 'primary'),
    ('Sumo Deadlift', 'hamstrings', 'secondary'),
    ('Sumo Deadlift', 'back', 'secondary'),
    ('Lat Pulldown', 'back', 'primary'),
    ('Lat Pulldown', 'biceps', 'secondary'),
    ('Bent Over Row', 'back', 'primary'),
    ('Bent Over Row', 'biceps', 'secondary'),
    ('Leg Curl', 'hamstrings', 'primary'),
    ('Leg Extension', 'quads', 'primary'),
    ('Leg Press', 'quads', 'primary'),
    ('Leg Press', 'glutes', 'secondary'),
    ('Tricep Pushdown', 'triceps', 'primary'),
    ('Bicep Curl', 'biceps', 'primary'),
    ('Calf Raise', 'calves', 'primary'),
    ('Lateral Raise', 'shoulders', 'primary'),
    ('Chest Fly', 'chest', 'primary');
