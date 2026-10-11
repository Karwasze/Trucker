import type {
  CreatedWorkout,
  ExerciseDB,
  NewWorkout,
  PlanToday,
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
    deleteWorkout: (id: number) =>
      request<{ success: boolean }>(`/api/workouts?id=${id}`, { method: 'DELETE' }),

    listExercises: async () => (await request<ExerciseDB[] | null>('/api/exercises')) ?? [],
    createExercise: (name: string) =>
      request<ExerciseDB>('/api/exercises', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteExercise: (id: number) =>
      request<{ success: boolean }>(`/api/exercises?id=${id}`, { method: 'DELETE' }),

    listPlans: async () => (await request<TrainingPlan[] | null>('/api/plans')) ?? [],
    planToday: async (planId: number, date: string) => {
      const day = await request<PlanToday>(`/api/plans/today?id=${planId}&date=${q(date)}`);
      return { ...day, exercises: day.exercises ?? [] };
    },

    latestSets: async (name: string) =>
      (await request<{ sets: Set[] | null }>(`/api/latest-exercise?name=${q(name)}`)).sets ?? [],

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
export function localDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
