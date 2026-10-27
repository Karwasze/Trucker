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
  'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core';

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
  /** Cardio per activity over the timespan; cardio days count as sessions. */
  cardio: CardioSummary[];
  /** This week of the active goal; null without one. */
  goal: GoalSummary | null;
  /** Triathlons over the timespan; null without any. */
  triathlon: TriathlonSummary | null;
};

export type GoalSummary = {
  goal: Goal;
  weeks_to_race: number;
  phase: GoalPhase;
  met: number;
  partial: number;
  missed: number;
  pending: number;
  planned_m: Partial<Record<CardioActivity, number>>;
  done_m: Partial<Record<CardioActivity, number>>;
  /** Threshold speed (m/s) the targets come from. */
  threshold: Partial<Record<CardioActivity, number>>;
};

export type CardioSummary = {
  activity: CardioActivity;
  sessions: number;
  distance_m: number;
  duration_seconds: number;
  weekly_distance_m: number;
};

export type CardioActivity = 'running' | 'cycling' | 'swimming' | 'walking' | 'hiking';

/** Where a workout stood `t` seconds in: `d` metres so far, and the heart rate. */
export type CardioSample = { t: number; d: number; hr?: number };

/** A lap or segment marked during a workout. */
export type CardioLap = { t: number; duration: number; d: number };

/** An endurance workout imported from Apple Health. */
export type CardioWorkout = {
  id: number;
  /** Local date of the start, YYYY-MM-DD. */
  date: string;
  /** RFC3339 start. */
  started_at: string;
  activity: CardioActivity;
  duration_seconds: number;
  distance_m?: number;
  /** Set when distance_m was entered by hand, as Apple Health had none. */
  manual_distance?: boolean;
  energy_kcal?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  swim_strokes?: number;
  lap_length_m?: number;
  /** Only loaded for a single workout, not in lists. */
  samples?: CardioSample[];
  laps?: CardioLap[];
  source?: string;
  /** The Apple Health workout it was imported from. */
  source_uuid?: string;
  /** When importing: the planned session it fills. */
  planned_session_id?: number;
};

export type NewCardioWorkout = Omit<CardioWorkout, 'id'>;

/** An endurance race to train for; distances in metres. */
export type Goal = {
  id: number;
  name: string;
  race_date: string;
  start_date: string;
  swim_m?: number;
  bike_m?: number;
  run_m?: number;
  weekdays: Weekday[];
  long_day: Weekday;
  active: boolean;
};

export type NewGoal = Omit<Goal, 'id' | 'start_date' | 'active'> & { id?: number };

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type GoalPhase = 'base' | 'build' | 'peak' | 'taper' | 'race';

export type SessionKind = 'easy' | 'long' | 'tempo' | 'intervals' | 'recovery' | 'technique' | 'brick' | 'race';

export type VerdictStatus = 'met' | 'partial' | 'missed' | 'pending';

export type Verdict = {
  status: VerdictStatus;
  /** warning is set on a check passed by doing more than planned. */
  checks: { name: string; actual: string; target: string; ok: boolean; warning?: string }[];
};

/** A heart rate zone, 1 to 5 as the watch numbers them, in whole bpm. Zone 1 has no min, zone 5 no max. */
export type HeartRateZone = { zone: number; min?: number; max?: number };

/** The zones worked out from the max and resting heart rate in effect from `date`. */
export type HeartRateZones = { date: string; max_hr: number; resting_hr: number; zones: HeartRateZone[] };

/** A session of a goal's plan; speeds are m/s. */
export type PlannedSession = {
  id: number;
  goal_id: number;
  date: string;
  activity: CardioActivity;
  kind: SessionKind;
  phase: GoalPhase;
  target_distance_m?: number;
  target_duration_s?: number;
  intensity: string;
  description: string;
  speed_min?: number;
  speed_max?: number;
  hr_min?: number;
  hr_max?: number;
  reps?: number;
  rep_distance_m?: number;
  rep_duration_s?: number;
  recovery_s?: number;
  cardio_workout_id?: number;
  /** The workout that filled it, without samples. */
  workout?: CardioWorkout;
  verdict?: Verdict;
};

export type GoalToday = { goal: Goal | null; sessions: PlannedSession[] };

export type SavedGoal = { goal: Goal; warnings: string[] };

/** Mirrors the store's triathlon classes, by distance. */
export type TriathlonClass = 'sprint' | 'quarter' | 'half' | 'full' | 'custom';

export type TriathlonLegKey = 'swim' | 'bike' | 'run';

/** A discipline of a triathlon: the day's workouts of that activity added up. */
export type TriathlonLeg = {
  workout_ids: number[];
  distance_m: number;
  duration_seconds: number;
};

/**
 * A day with at least one swim, ride and run, in any order. The total adds
 * up the legs, without transitions. `pr` is set when it was the fastest of
 * its class so far; custom distances never are.
 */
export type Triathlon = {
  date: string;
  class: TriathlonClass;
  swim: TriathlonLeg;
  bike: TriathlonLeg;
  run: TriathlonLeg;
  total_seconds: number;
  pr: boolean;
};

/** Mirrors store.TriathlonSummary. */
export type TriathlonSummary = {
  count: number;
  latest: Triathlon;
  /** The earliest in the timespan, when there were several. */
  first?: Triathlon;
  /** The fastest of each standard class of all time, shortest class first. */
  records: Triathlon[];
  /** The share of the latest's time each leg took. */
  share: Record<TriathlonLegKey, number>;
  /** Typical shares for the latest's class; unset for custom distances. */
  typical_share?: Record<TriathlonLegKey, number>;
  /** The leg taking clearly more of the time than typical. */
  weakest?: TriathlonLegKey;
};

export type AchievementCategory = 'pace' | 'distance' | 'triathlon' | 'strength';

/**
 * One level of an achievement: a time (s) to beat for pace, metres to cover
 * for distance and triathlons (all legs together), a 1RM to bodyweight ratio
 * for strength.
 */
export type AchievementTier = {
  /** Set for tiers with a name, such as race distances and strength levels. */
  name?: string;
  target: number;
  earned_on?: string;
  /** The cardio workout (pace, distance) or lifting workout (strength) that earned it. */
  workout_id?: number;
};

/** A badge earned in tiers, hardest last. */
export type Achievement = {
  id: string;
  category: AchievementCategory;
  title: string;
  /** The cardio activity, or the lift for strength. */
  activity?: string;
  /** The timed distance of a pace achievement. */
  distance_m?: number;
  /** The best result so far in the tiers' unit; unset before any, and for triathlons. */
  best?: number;
  tiers: AchievementTier[];
};
