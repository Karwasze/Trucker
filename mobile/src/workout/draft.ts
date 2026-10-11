import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { CreatedWorkout, NewWorkout, PlanExercise, Set } from '@/api/types';

const STORAGE_KEY = 'trucker.draft';

/** Inputs are kept as strings so partially typed values ("2.") survive. */
export type DraftSet = { weight: string; reps: string; done: boolean };

export type DraftExercise = {
  key: string;
  name: string;
  /** Human-readable plan target, e.g. "3 × 5 @ 100 kg". */
  target?: string;
  sets: DraftSet[];
};

export type Draft = {
  date: string;
  /** Plan the workout is logged against (drives server-side progression). */
  planId: number | null;
  /** The active plan setting this draft was built from. */
  basedOn: number | null;
  /** Fingerprint of the plan targets it was built from, to notice plan edits. */
  source?: string;
  exercises: DraftExercise[];
  /** Set once the workout has been posted to the server. */
  logged?: CreatedWorkout;
};

let keyCounter = 0;
const newKey = () => `${Date.now()}-${keyCounter++}`;

export const toDraftSets = (sets: Set[]): DraftSet[] =>
  sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps), done: false }));

export function describeSets(sets: Set[]) {
  if (sets.length === 0) return '';
  const same = sets.every((s) => s.reps === sets[0].reps && s.weight === sets[0].weight);
  if (same) return `${sets.length} × ${sets[0].reps} @ ${sets[0].weight} kg`;
  return sets.map((s) => `${s.reps}@${s.weight}`).join(', ');
}

export function draftExercise(name: string, sets: Set[], target?: string): DraftExercise {
  return { key: newKey(), name, target, sets: toDraftSets(sets) };
}

export const planFingerprint = (exercises: PlanExercise[]) =>
  JSON.stringify(exercises.map((e) => [e.name, e.sets]));

export function draftFromPlan(date: string, planId: number | null, exercises: PlanExercise[]): Draft {
  return {
    date,
    planId,
    basedOn: planId,
    source: planFingerprint(exercises),
    exercises: exercises.map((e) => draftExercise(e.name, e.sets, describeSets(e.sets))),
  };
}

/** Completed sets only: a set that wasn't ticked off wasn't done. */
export function toWorkout(draft: Draft): NewWorkout {
  return {
    date: draft.date,
    ...(draft.planId !== null && { plan_id: draft.planId }),
    exercises: draft.exercises
      .map((e) => ({
        name: e.name,
        sets: e.sets
          .filter((s) => s.done)
          .map((s) => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps, 10) || 0 }))
          .filter((s) => s.reps > 0),
      }))
      .filter((e) => e.sets.length > 0),
  };
}

export const completedSetCount = (draft: Draft) =>
  toWorkout(draft).exercises.reduce((n, e) => n + e.sets.length, 0);

/**
 * The in-progress workout, persisted so it survives the app being closed.
 * `draft` is undefined until storage has been read, null if there is none.
 */
export function useDraft() {
  const [draft, setDraftState] = useState<Draft | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setDraftState(raw ? (JSON.parse(raw) as Draft) : null))
      .catch(() => setDraftState(null));
  }, []);

  const setDraft = useCallback((update: Draft | null | ((d: Draft) => Draft)) => {
    setDraftState((prev) => {
      const next = typeof update === 'function' ? (prev ? update(prev) : prev) : update;
      if (next) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      else AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return next ?? null;
    });
  }, []);

  return { draft, setDraft };
}
