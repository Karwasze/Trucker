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

export type ExerciseDB = {
  id: number;
  name: string;
  is_default: boolean;
};

export type PlanExercise = {
  name: string;
  sets: Set[];
  weight_increment: number;
  reps_increment: number;
  deload_after: number;
  deload_percent: number;
  consecutive_misses: number;
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
  exercises: PlanExercise[];
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
