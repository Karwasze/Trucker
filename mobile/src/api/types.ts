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

export type StalledLift = {
  exercise: string;
  recent_1rm: number;
  previous_1rm: number;
};

export type Recommendation = {
  kind: 'warning' | 'info' | 'good';
  text: string;
};

export type Insights = {
  date: string;
  bodyweight: BodyweightTrend | null;
  sessions_per_week: number;
  muscles: MuscleVolume[];
  strength: StrengthLevel[];
  stalled: StalledLift[];
  untagged: string[];
  recommendations: Recommendation[];
};
