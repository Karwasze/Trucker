-- The app dropped Apple Health's total distance on import (it came in
-- "meters", which it didn't convert), so workouts were saved without one.
-- Their samples hold the cumulative distance, so the last one's is the
-- total. Workouts whose samples have no distance (e.g. an indoor ride
-- without a speed sensor) are left for entering by hand.
UPDATE cardio_workouts
SET distance_m = json_extract(samples, '$[#-1].d')
WHERE distance_m IS NULL
    AND samples IS NOT NULL
    AND json_valid(samples)
    AND json_extract(samples, '$[#-1].d') > 0;
