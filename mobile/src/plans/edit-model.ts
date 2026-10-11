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
export type EditSet = { weight: string; reps: string };

export type EditExercise = {
  key: string;
  name: string;
  sets: EditSet[];
  weightIncrement: string;
  repsIncrement: string;
  deloadAfter: string;
  deloadPercent: string;
  misses: number;
};

export type EditDay = { weekday: Weekday; exercises: EditExercise[] };

export type EditPlan = { id?: number; name: string; days: EditDay[] };

let keyCounter = 0;
const newKey = () => `ex-${Date.now()}-${keyCounter++}`;

const toEditSets = (sets: Set[]): EditSet[] =>
  sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) }));

function toEditExercise(e: PlanExercise): EditExercise {
  return {
    key: newKey(),
    name: e.name,
    sets: toEditSets(e.sets),
    weightIncrement: String(e.weight_increment),
    repsIncrement: String(e.reps_increment),
    deloadAfter: String(e.deload_after),
    deloadPercent: String(e.deload_percent),
    misses: e.consecutive_misses,
  };
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

/** A new plan exercise, starting from the sets last logged for it if any. */
export function newEditExercise(name: string, lastSets: Set[]): EditExercise {
  return {
    key: newKey(),
    name,
    sets: lastSets.length
      ? toEditSets(lastSets)
      : Array.from({ length: 3 }, () => ({ weight: '20', reps: '5' })),
    weightIncrement: '2.5',
    repsIncrement: '0',
    deloadAfter: '3',
    deloadPercent: '10',
    misses: 0,
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

  const num = (value: string) => (value.trim() === '' ? NaN : Number(value));
  const days: TrainingPlan['days'] = [];

  for (const day of edit.days) {
    const where = (e: EditExercise) => `${e.name} on ${weekdayLabel(day.weekday)}`;
    const exercises: PlanExercise[] = [];

    for (const e of day.exercises) {
      if (e.sets.length === 0) return { error: `${where(e)} needs at least one set.` };
      const sets = e.sets.map((s) => ({ weight: num(s.weight), reps: num(s.reps) }));
      if (sets.some((s) => !Number.isInteger(s.reps) || s.reps <= 0)) {
        return { error: `${where(e)}: reps must be a whole number above 0.` };
      }
      if (sets.some((s) => !Number.isFinite(s.weight) || s.weight < 0)) {
        return { error: `${where(e)}: enter a weight of 0 or more for every set.` };
      }

      const weightIncrement = num(e.weightIncrement);
      const repsIncrement = num(e.repsIncrement);
      const deloadAfter = num(e.deloadAfter);
      const deloadPercent = num(e.deloadPercent);
      if (!(weightIncrement >= 0) || !Number.isInteger(repsIncrement) || repsIncrement < 0) {
        return { error: `${where(e)}: increments must be 0 or more.` };
      }
      if (!Number.isInteger(deloadAfter) || deloadAfter < 0) {
        return { error: `${where(e)}: "deload after" must be a whole number (0 = never).` };
      }
      if (deloadAfter > 0 && !(deloadPercent > 0 && deloadPercent <= 100)) {
        return { error: `${where(e)}: deload percent must be between 0 and 100.` };
      }

      exercises.push({
        name: e.name,
        sets,
        weight_increment: weightIncrement,
        reps_increment: repsIncrement,
        deload_after: deloadAfter,
        // Unused when deloading is off, so a blank input is fine then.
        deload_percent: deloadPercent || 0,
        consecutive_misses: e.misses,
      });
    }
    days.push({ weekday: day.weekday, exercises });
  }

  return { plan: { id: edit.id ?? 0, name, days } };
}
