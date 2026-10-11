CREATE TABLE training_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- weekday is 1 (Monday) through 7 (Sunday).
CREATE TABLE training_plan_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL,
    position INTEGER NOT NULL,
    exercise_name TEXT NOT NULL,
    weight_increment REAL NOT NULL DEFAULT 0,
    reps_increment INTEGER NOT NULL DEFAULT 0,
    deload_after INTEGER NOT NULL DEFAULT 0,
    deload_percent REAL NOT NULL DEFAULT 0,
    consecutive_misses INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(plan_id) REFERENCES training_plans(id)
);

CREATE INDEX idx_training_plan_exercises_plan_id ON training_plan_exercises(plan_id);

CREATE TABLE training_plan_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_exercise_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    FOREIGN KEY(plan_exercise_id) REFERENCES training_plan_exercises(id)
);

ALTER TABLE workouts ADD COLUMN plan_id INTEGER;
