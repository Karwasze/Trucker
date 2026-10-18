import type {
  BodyweightEntry,
  CardioActivity,
  CardioWorkout,
  CreatedWorkout,
  Goal,
  GoalToday,
  ExerciseDB,
  Insights,
  MuscleTarget,
  NewCardioWorkout,
  NewGoal,
  PlannedSession,
  SavedGoal,
  NewWorkout,
  PlanToday,
  Triathlon,
  Set,
  StatisticsResponse,
  TrainingPlan,
  Workout,
} from '@/api/types';

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** A thin typed client for the Trucker Go API. */
export function createApi(baseUrl: string) {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!root) throw new ApiError('No server set. Add its URL in Settings.');
    let res: Response;
    try {
      res = await fetch(root + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new ApiError(`Can't reach the server at ${root}`);
    }
    if (!res.ok) {
      const text = (await res.text()).trim();
      throw new ApiError(text || `Request failed (${res.status})`, res.status);
    }
    return res.json() as Promise<T>;
  }

  const q = encodeURIComponent;

  return {
    listWorkouts: async () =>
      ((await request<Workout[] | null>('/api/workouts')) ?? []).map((w) => ({
        ...w,
        exercises: w.exercises ?? [],
      })),
    createWorkout: (workout: NewWorkout) =>
      request<CreatedWorkout>('/api/workouts', { method: 'POST', body: JSON.stringify(workout) }),
    /** Replaces a workout's date and exercises; its plan and progression are untouched. */
    updateWorkout: ({ plan_id: _planId, ...workout }: Workout) =>
      request<Workout>('/api/workouts', { method: 'PUT', body: JSON.stringify(workout) }),
    deleteWorkout: (id: number) => request<{ success: boolean }>(`/api/workouts?id=${id}`, { method: 'DELETE' }),

    listExercises: async () =>
      ((await request<ExerciseDB[] | null>('/api/exercises')) ?? []).map((e) => ({
        ...e,
        muscles: e.muscles ?? [],
      })),
    createExercise: (name: string) =>
      request<ExerciseDB>('/api/exercises', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteExercise: (id: number) => request<{ success: boolean }>(`/api/exercises?id=${id}`, { method: 'DELETE' }),
    /** Muscle tags of every tagged exercise, keyed by name. */
    exerciseMuscles: async () => (await request<Record<string, MuscleTarget[]> | null>('/api/exercise-muscles')) ?? {},
    /** Replaces an exercise's muscle tags; works for built-in exercises too. */
    setExerciseMuscles: (name: string, muscles: MuscleTarget[]) =>
      request<{ name: string; muscles: MuscleTarget[] }>('/api/exercise-muscles', {
        method: 'PUT',
        body: JSON.stringify({ name, muscles }),
      }),

    listBodyweight: async () => (await request<BodyweightEntry[] | null>('/api/bodyweight')) ?? [],
    /** Replaces every bodyweight entry with `entries`; returns the stored entries, oldest first. */
    replaceBodyweight: async (entries: BodyweightEntry[]) =>
      (await request<BodyweightEntry[] | null>('/api/bodyweight', { method: 'PUT', body: JSON.stringify(entries) })) ??
      [],
    deleteBodyweight: (date: string) =>
      request<{ success: boolean }>(`/api/bodyweight?date=${q(date)}`, { method: 'DELETE' }),

    /** Days with a swim, ride and run, newest first. */
    listTriathlons: async () => (await request<Triathlon[] | null>('/api/triathlons')) ?? [],

    /** Cardio workouts, newest first, without their samples. */
    listCardio: async (activity?: CardioActivity) =>
      (await request<CardioWorkout[] | null>(activity ? `/api/cardio?activity=${q(activity)}` : '/api/cardio')) ?? [],
    /** A cardio workout with its samples and laps. */
    getCardio: (id: number) => request<CardioWorkout>(`/api/cardio?id=${id}`),
    /**
     * Imports workouts, skipping ones already imported; returns the ones saved.
     * Workouts filling planned sessions adapt the goal's plan as of `date`.
     */
    importCardio: async (workouts: NewCardioWorkout[], date = localDate()) =>
      (await request<CardioWorkout[] | null>(`/api/cardio?date=${q(date)}`, {
        method: 'POST',
        body: JSON.stringify(workouts),
      })) ?? [],
    /**
     * Sets the distance of a workout Apple Health had none for (or that was
     * entered by hand), adapting the goal's plan as of `date`.
     */
    setCardioDistance: (id: number, metres: number, date = localDate()) =>
      request<CardioWorkout>(`/api/cardio?id=${id}&date=${q(date)}`, {
        method: 'PATCH',
        body: JSON.stringify({ distance_m: metres }),
      }),
    deleteCardio: (id: number) => request<{ success: boolean }>(`/api/cardio?id=${id}`, { method: 'DELETE' }),

    listGoals: async () => (await request<Goal[] | null>('/api/goals')) ?? [],
    /** Creates the active goal and its plan from `date`. */
    createGoal: async (goal: NewGoal, date: string) =>
      withWarnings(
        await request<SavedGoal>(`/api/goals?date=${q(date)}`, { method: 'POST', body: JSON.stringify(goal) })
      ),
    /** Replaces a goal and regenerates its plan from `date`, keeping filled sessions. */
    updateGoal: async (goal: NewGoal & { id: number }, date: string) =>
      withWarnings(
        await request<SavedGoal>(`/api/goals?date=${q(date)}`, { method: 'PUT', body: JSON.stringify(goal) })
      ),
    deleteGoal: (id: number) => request<{ success: boolean }>(`/api/goals?id=${id}`, { method: 'DELETE' }),
    /** A goal's sessions between from and to (inclusive), judged as of date. */
    goalSessions: async (id: number, date: string, from?: string, to?: string) => {
      let path = `/api/goals/sessions?id=${id}&date=${q(date)}`;
      if (from) path += `&from=${q(from)}`;
      if (to) path += `&to=${q(to)}`;
      return (await request<PlannedSession[] | null>(path)) ?? [];
    },
    /** The active goal and its sessions on date. */
    goalToday: async (date: string) => {
      const res = await request<GoalToday>(`/api/goals/today?date=${q(date)}`);
      return { goal: res.goal ?? null, sessions: res.sessions ?? [] };
    },
    /** Makes a cardio workout fill a session, or empties it for null. */
    matchSession: (sessionId: number, cardioId: number | null, date: string) =>
      request<{ success: boolean }>(`/api/goals/match?date=${q(date)}`, {
        method: 'PUT',
        body: JSON.stringify({ session_id: sessionId, cardio_id: cardioId }),
      }),

    /** Analyses training up to date, over the timespan starting on from (null for all time). */
    insights: async (date: string, from: string | null, planId: number | null) => {
      let path = `/api/insights?date=${q(date)}`;
      if (from) path += `&from=${q(from)}`;
      if (planId !== null) path += `&plan_id=${planId}`;
      const res = await request<Insights>(path);
      return {
        ...res,
        muscles: res.muscles ?? [],
        stalls: res.stalls ?? [],
        progression: res.progression ?? [],
        tonnage: {
          total: res.tonnage?.total ?? 0,
          weekly: res.tonnage?.weekly ?? [],
          by_exercise: res.tonnage?.by_exercise ?? [],
        },
        strength: res.strength ?? [],
        untagged: res.untagged ?? [],
        cardio: res.cardio ?? [],
        goal: res.goal ?? null,
        triathlon: res.triathlon ? { ...res.triathlon, records: res.triathlon.records ?? [] } : null,
        adherence: res.adherence && { ...res.adherence, missed: res.adherence.missed ?? [] },
      };
    },

    listPlans: async () => (await request<TrainingPlan[] | null>('/api/plans')) ?? [],
    getPlan: (id: number) => request<TrainingPlan>(`/api/plans?id=${id}`),
    createPlan: ({ id: _id, ...plan }: TrainingPlan) =>
      request<TrainingPlan>('/api/plans', { method: 'POST', body: JSON.stringify(plan) }),
    /** Replaces the plan; the server resets every exercise's miss counter. */
    updatePlan: (plan: TrainingPlan) =>
      request<TrainingPlan>('/api/plans', { method: 'PUT', body: JSON.stringify(plan) }),
    deletePlan: (id: number) => request<{ success: boolean }>(`/api/plans?id=${id}`, { method: 'DELETE' }),
    planToday: async (planId: number, date: string) => {
      const day = await request<PlanToday>(`/api/plans/today?id=${planId}&date=${q(date)}`);
      return { ...day, exercises: day.exercises ?? [] };
    },

    latestSets: async (name: string) =>
      (await request<{ sets: Set[] | null }>(`/api/latest-exercise?name=${q(name)}`)).sets ?? [],
    /**
     * The sets to do next for an exercise added outside a plan, progressed from
     * history: in `scheme` when given, or in the shape of the last session.
     */
    exerciseTarget: async (name: string, date: string, scheme?: { sets: number; reps: number }) => {
      const res = await request<{ target: Set[] | null; reason?: string }>(
        `/api/latest-exercise?name=${q(name)}&date=${q(date)}` +
          (scheme ? `&sets=${scheme.sets}&reps=${scheme.reps}` : '')
      );
      return { sets: res.target ?? [], reason: res.reason };
    },

    statistics: async (exercise?: string) => {
      const res = await request<StatisticsResponse>(
        exercise ? `/api/statistics?exercise=${q(exercise)}` : '/api/statistics'
      );
      return { exercises: res.exercises ?? [], data: res.data ?? [] };
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** Today's date as YYYY-MM-DD in the device's local timezone. */
const withWarnings = (saved: SavedGoal) => ({ ...saved, warnings: saved.warnings ?? [] });

export function localDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
