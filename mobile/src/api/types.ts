// Mirrors the JSON shapes in internal/store/models.go.

export type Set = {
  weight: number;
  reps: number;
};

export type Exercise = {
  name: string;
  sets: Set[];
};

export type Workout = {
  id: number;
  date: string;
  plan_id?: number;
  exercises: Exercise[];
};

export type NewWorkout = Omit<Workout, 'id'>;

export type ProgressionResult = {
  exercise: string;
  result: 'progressed' | 'missed' | 'deloaded';
};

export type CreatedWorkout = Workout & { progression?: ProgressionResult[] };

export type Muscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

/** Mirrors store.Muscles, in display order. */
export const MUSCLES: Muscle[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
];

export type MuscleRole = 'primary' | 'secondary';

export type MuscleTarget = {
  muscle: Muscle;
  role: MuscleRole;
};

export type ExerciseDB = {
  id: number;
  name: string;
  is_default: boolean;
  muscles: MuscleTarget[];
};

/** A planned sets × reps scheme; weights are worked out from history. */
export type PlanExercise = {
  name: string;
  sets: number;
  reps: number;
};

/** What to lift next for a plan exercise. */
export type ExerciseTarget = {
  name: string;
  sets: Set[];
  /** Why the target is what it is, e.g. why the weight went up. */
  reason?: string;
};

export type PlanDay = {
  weekday: string;
  exercises: PlanExercise[];
};

export type TrainingPlan = {
  id: number;
  name: string;
  days: PlanDay[];
};

export type PlanToday = {
  plan_id: number;
  date: string;
  weekday: string;
  exercises: ExerciseTarget[];
  /** The workout already logged from the plan on this date, if any. */
  workout?: Workout;
};

export type StatisticsData = {
  date: string;
  estimated_1rm: number;
  total_volume: number;
};

export type StatisticsResponse = {
  exercises: string[];
  data: StatisticsData[];
};

export type BodyweightEntry = {
  date: string;
  weight: number;
};

export type BodyweightTrend = BodyweightEntry & {
  change?: number;
  change_since?: string;
};

export type VolumeStatus = 'untrained' | 'low' | 'optimal' | 'high';

export type MuscleVolume = {
  muscle: Muscle;
  weekly_sets: number;
  days_per_week: number;
  last_trained?: string;
  status: VolumeStatus;
};

export type StrengthLevel = {
  exercise: string;
  best_1rm: number;
  ratio: number;
  /** Empty below beginner. */
  level: string;
  /** Empty at elite. */
  next_level: string;
  next_level_kg: number;
};

/** Mirrors store.Adherence. Since is unset until something is logged from the plan. */
export type Adherence = {
  plan: string;
  since?: string;
  scheduled: number;
  completed: number;
  extra: number;
  streak: number;
  /** Newest first. */
  missed: string[];
};

/** A plan lift missing its scheme in a row now, or deloaded within the timespan. */
export type PlanStall = {
  exercise: string;
  status: 'missing' | 'deloaded';
  weight: number;
  misses: number;
  date: string;
  deload_next?: boolean;
};

export type LiftProgress = {
  exercise: string;
  sessions: number;
  first_1rm: number;
  first_date: string;
  best_1rm: number;
  best_date: string;
  latest_1rm: number;
  /** kg of est. 1RM gained a month, first session to latest; unset over less than two weeks. */
  per_month?: number;
  /** Best est. 1RM of all time, up to the end of the timespan. */
  record_1rm: number;
  record_date: string;
  prs: number;
  last_pr?: string;
};

export type Tonnage = {
  total: number;
  /** One entry per week, keyed by its Monday. */
  weekly: { week: string; tonnage: number }[];
  /** Heaviest first. */
  by_exercise: { exercise: string; tonnage: number }[];
};

export type Insights = {
  date: string;
  from?: string;
  bodyweight: BodyweightTrend | null;
  sessions_per_week: number;
  muscles: MuscleVolume[];
  /** Null without a plan. */
  adherence: Adherence | null;
  stalls: PlanStall[];
  progression: LiftProgress[];
  tonnage: Tonnage;
  strength: StrengthLevel[];
  untagged: string[];
};
