import type {
  Achievement,
  BodyweightEntry,
  CardioActivity,
  CardioInsights,
  CardioWorkout,
  CreatedWorkout,
  DateRange,
  DietDay,
  DietInsights,
  Goal,
  GoalToday,
  ExerciseDB,
  HeartRateZones,
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
  StrengthInsights,
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

const q = encodeURIComponent;

/** An insights path for date, over the timespan from from (null for all time), with planId's plan. */
function insightsPath(base: string, date: string, from: string | null, planId: number | null) {
  let path = `${base}?date=${q(date)}`;
  if (from) path += `&from=${q(from)}`;
  if (planId !== null) path += `&plan_id=${planId}`;
  return path;
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

  /** A query string limiting a list to `range`, joined to the path with `sep`. */
  const within = (range: DateRange | undefined, sep: '?' | '&' = '?') =>
    range ? `${sep}from=${q(range.from)}&to=${q(range.to)}` : '';

  return {
    /** Lifting workouts, newest first, all of them or those within `range`. */
    listWorkouts: async (range?: DateRange) =>
      ((await request<Workout[] | null>(`/api/workouts${within(range)}`)) ?? []).map((w) => ({
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
    /** The heart rate zones in effect on `date`, or null before any were set. */
    heartRateZones: (date: string) => request<HeartRateZones | null>(`/api/heart-rate-zones?date=${q(date)}`),
    /** Records the max and resting heart rate as of `date`; returns the zones then. */
    setHeartRateProfile: (date: string, max_hr: number, resting_hr: number) =>
      request<HeartRateZones>('/api/heart-rate-zones', {
        method: 'PUT',
        body: JSON.stringify({ date, max_hr, resting_hr }),
      }),
    /** Records the zones Apple Watch has as of `date`, from where zones 2 and up start; returns the zones then. */
    setHeartRateZones: (date: string, zone_starts: number[]) =>
      request<HeartRateZones>('/api/heart-rate-zones', {
        method: 'PUT',
        body: JSON.stringify({ date, zone_starts }),
      }),

    /** Days logged, oldest first, all of them or those within `range`. */
    listDiet: async (range?: DateRange) => (await request<DietDay[] | null>(`/api/diet${within(range)}`)) ?? [],
    /** Records a day, replacing what was logged for it. */
    saveDietDay: (day: DietDay) => request<DietDay>('/api/diet', { method: 'PUT', body: JSON.stringify(day) }),
    deleteDietDay: (date: string) => request<{ success: boolean }>(`/api/diet?date=${q(date)}`, { method: 'DELETE' }),
    /** The diet summed up to `today`. */
    dietInsights: (today: string) => request<DietInsights>(`/api/diet/insights?date=${q(today)}`),

    /** Every achievement with the tiers earned so far. */
    listAchievements: async () => (await request<Achievement[] | null>('/api/achievements')) ?? [],

    /** Days with a swim, ride and run, newest first, all of them or those within `range`. */
    listTriathlons: async (range?: DateRange) =>
      (await request<Triathlon[] | null>(`/api/triathlons${within(range)}`)) ?? [],
    /** The date of the oldest lifting or cardio workout, or null before any are logged. */
    oldestWorkoutDate: async () => (await request<{ oldest: string | null }>('/api/history')).oldest,

    /** Cardio workouts, newest first, without their samples, optionally of one activity within `range`. */
    listCardio: async (activity?: CardioActivity, range?: DateRange) =>
      (await request<CardioWorkout[] | null>(
        activity ? `/api/cardio?activity=${q(activity)}${within(range, '&')}` : `/api/cardio${within(range)}`
      )) ?? [],
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
     * Sets the distance of a workout Apple Health had none for, that was
     * indoors (or that was entered by hand), adapting the goal's plan as of
     * `date`. `indoor` says a workout imported before its place was kept
     * was indoors, as Apple Health has it.
     */
    setCardioDistance: (id: number, metres: number, date = localDate(), indoor = false) =>
      request<CardioWorkout>(`/api/cardio?id=${id}&date=${q(date)}`, {
        method: 'PATCH',
        body: JSON.stringify(indoor ? { distance_m: metres, indoor } : { distance_m: metres }),
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
      const res = await request<Insights>(insightsPath('/api/insights', date, from, planId));
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
        // Missing, unlike an empty list, means the server can't work them out.
        cardio_progression: res.cardio_progression ?? null,
        goal: res.goal ?? null,
        triathlon: res.triathlon ? { ...res.triathlon, records: res.triathlon.records ?? [] } : null,
        adherence: res.adherence && { ...res.adherence, missed: res.adherence.missed ?? [] },
      };
    },

    /** Deeper lifting insights, with the same parameters as insights. */
    strengthInsights: async (date: string, from: string | null, planId: number | null) => {
      const res = await request<StrengthInsights>(insightsPath('/api/insights/strength', date, from, planId));
      return {
        ...res,
        projections: res.projections ?? [],
        plateaus: res.plateaus ?? [],
        weak_link: res.weak_link ? { ...res.weak_link, lifts: res.weak_link.lifts ?? [] } : null,
        relative: res.relative ? { ...res.relative, lifts: res.relative.lifts ?? [] } : null,
        patterns: { weekdays: res.patterns?.weekdays ?? [], rest_days: res.patterns?.rest_days ?? [] },
        interference: res.interference ?? null,
        fatigue: res.fatigue ?? [],
      };
    },

    /** Deeper endurance insights up to date, over the timespan from from (null for all time). */
    cardioInsights: async (date: string, from: string | null) => {
      const res = await request<CardioInsights>(insightsPath('/api/insights/cardio', date, from, null));
      return {
        ...res,
        efficiency: res.efficiency ?? [],
        run_weight: res.run_weight ?? null,
        drift: res.drift ?? [],
        intensity: res.intensity ? { ...res.intensity, zone_seconds: res.intensity.zone_seconds ?? [] } : null,
        load: res.load ?? null,
        compliance: res.compliance
          ? {
              ...res.compliance,
              by_kind: res.compliance.by_kind ?? [],
              by_activity: res.compliance.by_activity ?? [],
              by_weekday: res.compliance.by_weekday ?? [],
            }
          : null,
        resting_hr: res.resting_hr ?? null,
        diet: res.diet ?? null,
      };
    },
    /** Records each day's resting heart rate, keeping days not sent. */
    saveRestingHeartRates: (readings: { date: string; bpm: number }[]) =>
      request<{ saved: number }>('/api/resting-heart-rates', { method: 'PUT', body: JSON.stringify(readings) }),

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
