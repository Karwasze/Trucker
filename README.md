# Trucker
Backend API for tracking gym exercises

Run development server with "air". The server listens on `:8081` and serves JSON.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/workouts` | List all workouts (newest first) |
| `POST` | `/api/workouts` | Log a workout, returns `201` with the created workout |
| `DELETE` | `/api/workouts?id={id}` | Delete a workout |
| `GET` | `/api/exercises` | List exercises |
| `POST` | `/api/exercises` | Create an exercise: `{"name": "..."}` |
| `PUT` | `/api/exercises` | Rename an exercise: `{"id": 1, "name": "..."}` |
| `DELETE` | `/api/exercises?id={id}` | Delete an exercise (default exercises are protected) |
| `GET` | `/api/plans` | List training plans |
| `GET` | `/api/plans?id={id}` | Get one training plan |
| `POST` | `/api/plans` | Create a training plan, returns `201` with the created plan |
| `PUT` | `/api/plans` | Replace a training plan (body includes `id`); resets miss counters |
| `DELETE` | `/api/plans?id={id}` | Delete a training plan (its workouts are kept and unlinked) |
| `GET` | `/api/plans/today?id={id}[&date=YYYY-MM-DD]` | What the plan schedules for a date (default today); `exercises` is empty on rest days |
| `GET` | `/api/latest-exercise?name={name}` | Sets from the most recent workout containing the exercise |
| `GET` | `/api/statistics[?exercise={name}]` | Logged exercise names, plus estimated 1RM and volume per date for `exercise` |

Example workout body for `POST /api/workouts`:

```json
{
  "date": "2026-03-15",
  "plan_id": 1,
  "exercises": [
    {"name": "Squat", "sets": [{"reps": 5, "weight": 100}, {"reps": 5, "weight": 100}]}
  ]
}
```

Exercises without a name or without sets are ignored. `plan_id` is optional; see
[Progression](#progression).

## Training plans

A training plan is a weekly schedule: each weekday lists exercises with explicit
per-set targets and the rules used to progress them.

```json
{
  "name": "5x5",
  "days": [
    {
      "weekday": "monday",
      "exercises": [
        {
          "name": "Squat",
          "sets": [{"reps": 5, "weight": 100}, {"reps": 5, "weight": 100}, {"reps": 5, "weight": 100}],
          "weight_increment": 2.5,
          "reps_increment": 0,
          "deload_after": 3,
          "deload_percent": 10
        }
      ]
    }
  ]
}
```

Weekdays are `monday`..`sunday`, each at most once. Responses also include a
server-managed `consecutive_misses` per exercise.

### Progression

When a workout is logged with a `plan_id`, every plan exercise scheduled for that
workout's weekday that also appears in the workout is evaluated:

- **Hit**: each target set is matched in order by a logged set with at least the
  target reps at at least the target weight. Every target set then gains
  `weight_increment` and `reps_increment`, and the miss counter resets.
- **Miss**: the miss counter goes up. When it reaches `deload_after` (if non-zero),
  every target weight is reduced by `deload_percent` and the counter resets.

The `POST /api/workouts` response includes a `progression` array such as
`[{"exercise": "Squat", "result": "progressed"}]` (`progressed`, `missed` or
`deloaded`). Deleting a workout does not undo progression.
