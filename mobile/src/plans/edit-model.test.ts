import type { TrainingPlan } from '@/api/types';
import {
  fromEditPlan,
  newEditExercise,
  scheduleOf,
  sortDays,
  toEditPlan,
  weekdayLabel,
  type EditPlan,
} from '@/plans/edit-model';

const plan: TrainingPlan = {
  id: 7,
  name: 'Strength',
  days: [
    { weekday: 'friday', exercises: [{ name: 'Deadlift', sets: 1, reps: 5 }] },
    { weekday: 'monday', exercises: [{ name: 'Squat', sets: 3, reps: 5 }] },
  ],
};

test('weekdayLabel capitalises and optionally shortens', () => {
  expect(weekdayLabel('wednesday')).toBe('Wednesday');
  expect(weekdayLabel('wednesday', true)).toBe('Wed');
});

test('days sort Monday first', () => {
  expect(sortDays(plan.days).map((d) => d.weekday)).toEqual(['monday', 'friday']);
  expect(scheduleOf(plan)).toBe('Mon · Fri');
});

test('a plan survives a round trip through the edit form', () => {
  const edit = toEditPlan(plan);
  expect(edit.days.map((d) => d.weekday)).toEqual(['monday', 'friday']);
  expect(edit.days[0].exercises[0]).toMatchObject({ name: 'Squat', sets: '3', reps: '5' });
  expect(fromEditPlan(edit)).toEqual({ plan: { ...plan, days: sortDays(plan.days) } });
});

test('a new plan starts empty and needs a name', () => {
  const edit = toEditPlan();
  expect(edit).toEqual({ name: '', days: [] });
  expect(fromEditPlan(edit)).toEqual({ error: 'Give the plan a name.' });
  expect(fromEditPlan({ ...edit, name: '  Push  ' })).toEqual({ plan: { id: 0, name: 'Push', days: [] } });
});

test('invalid sets or reps are reported with the exercise and day', () => {
  const edit: EditPlan = {
    name: 'Plan',
    days: [{ weekday: 'tuesday', exercises: [{ key: 'a', name: 'Bench', sets: '3', reps: '' }] }],
  };
  expect(fromEditPlan(edit)).toEqual({ error: 'Bench on Tuesday: enter at least 1 set and 1 rep.' });
  for (const bad of ['0', '2.5', '-1', 'x']) {
    edit.days[0].exercises[0].reps = bad;
    expect(fromEditPlan(edit)).toHaveProperty('error');
  }
});

test('a new exercise follows the last logged sets × reps, or 3 × 5', () => {
  expect(newEditExercise('Row', [])).toMatchObject({ sets: '3', reps: '5' });
  expect(
    newEditExercise('Row', [
      { weight: 60, reps: 8 },
      { weight: 60, reps: 10 },
    ])
  ).toMatchObject({ sets: '2', reps: '10' });
});

test('every edit exercise gets a distinct key', () => {
  const keys = toEditPlan(plan).days.flatMap((d) => d.exercises.map((e) => e.key));
  expect(new Set(keys).size).toBe(keys.length);
});
