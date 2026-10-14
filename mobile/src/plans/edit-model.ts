import type { PlanExercise, Set, TrainingPlan } from '@/api/types';

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const weekdayLabel = (day: string, short = false) => {
  const name = day.charAt(0).toUpperCase() + day.slice(1);
  return short ? name.slice(0, 3) : name;
};

/** Training days in Monday-first order, as "Mon · Wed · Fri". */
export const scheduleOf = (plan: TrainingPlan) =>
  sortDays(plan.days)
    .map((d) => weekdayLabel(d.weekday, true))
    .join(' · ');

export const sortDays = <T extends { weekday: string }>(days: T[]) =>
  [...days].sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday as Weekday) - WEEKDAYS.indexOf(b.weekday as Weekday)
  );

// Inputs are strings while editing so partially typed numbers survive.
export type EditExercise = {
  key: string;
  name: string;
  sets: string;
  reps: string;
};

export type EditDay = { weekday: Weekday; exercises: EditExercise[] };

export type EditPlan = { id?: number; name: string; days: EditDay[] };

let keyCounter = 0;
const newKey = () => `ex-${Date.now()}-${keyCounter++}`;

function toEditExercise(e: PlanExercise): EditExercise {
  return { key: newKey(), name: e.name, sets: String(e.sets), reps: String(e.reps) };
}

export function toEditPlan(plan?: TrainingPlan): EditPlan {
  if (!plan) return { name: '', days: [] };
  return {
    id: plan.id,
    name: plan.name,
    days: sortDays(plan.days).map((d) => ({
      weekday: d.weekday as Weekday,
      exercises: d.exercises.map(toEditExercise),
    })),
  };
}

/** A new plan exercise, following the sets × reps last logged for it if any. */
export function newEditExercise(name: string, lastSets: Set[]): EditExercise {
  return {
    key: newKey(),
    name,
    sets: String(lastSets.length || 3),
    reps: String(lastSets.length ? Math.max(...lastSets.map((s) => s.reps)) : 5),
  };
}

/**
 * Converts the edit form back to the API shape. Returns an error message
 * instead when an input isn't valid; the rules mirror validatePlan on the
 * server so problems are reported before saving.
 */
export function fromEditPlan(edit: EditPlan): { plan: TrainingPlan } | { error: string } {
  const name = edit.name.trim();
  if (!name) return { error: 'Give the plan a name.' };

  const whole = (value: string) => (value.trim() === '' ? NaN : Number(value));
  const days: TrainingPlan['days'] = [];

  for (const day of edit.days) {
    const exercises: PlanExercise[] = [];
    for (const e of day.exercises) {
      const sets = whole(e.sets);
      const reps = whole(e.reps);
      if (!Number.isInteger(sets) || sets <= 0 || !Number.isInteger(reps) || reps <= 0) {
        return { error: `${e.name} on ${weekdayLabel(day.weekday)}: enter at least 1 set and 1 rep.` };
      }
      exercises.push({ name: e.name, sets, reps });
    }
    days.push({ weekday: day.weekday, exercises });
  }

  return { plan: { id: edit.id ?? 0, name, days } };
}
