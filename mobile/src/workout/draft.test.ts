import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  completedSetCount,
  describeSets,
  draftFromPlan,
  invalidSetCount,
  isValidReps,
  isValidWeight,
  planFingerprint,
  toExercises,
  toWorkout,
  useDraft,
  type Draft,
  type DraftExercise,
} from '@/workout/draft';

const squat = {
  name: 'Squat',
  sets: [
    { weight: 100, reps: 5 },
    { weight: 100, reps: 5 },
  ],
};

beforeEach(() => AsyncStorage.clear());

test('describeSets summarises uniform sets and lists mixed ones', () => {
  expect(describeSets([])).toBe('');
  expect(describeSets(squat.sets)).toBe('2 × 5 @ 100 kg');
  expect(describeSets([{ weight: 0, reps: 10 }])).toBe('1 × 10');
  expect(
    describeSets([
      { weight: 100, reps: 5 },
      { weight: 90, reps: 8 },
    ])
  ).toBe('5@100, 8@90');
});

test('draftFromPlan builds untouched sets with the plan target', () => {
  const draft = draftFromPlan('2026-10-18', 3, [{ ...squat, reason: 'Weight up' }]);
  expect(draft).toMatchObject({ date: '2026-10-18', planId: 3, basedOn: 3, source: planFingerprint([squat]) });
  expect(draft.exercises[0]).toMatchObject({
    name: 'Squat',
    target: '2 × 5 @ 100 kg',
    reason: 'Weight up',
    sets: [
      { weight: '100', reps: '5', done: false },
      { weight: '100', reps: '5', done: false },
    ],
  });
});

test('planFingerprint changes when the plan’s targets do', () => {
  expect(planFingerprint([squat])).not.toBe(planFingerprint([{ ...squat, sets: [{ weight: 105, reps: 5 }] }]));
});

const edited: DraftExercise[] = [
  {
    key: 'a',
    name: 'Squat',
    sets: [
      { weight: '100', reps: '5', done: true },
      { weight: '2.', reps: '5', done: false },
      { weight: '100', reps: '', done: true },
    ],
  },
  { key: 'b', name: 'Bench', sets: [{ weight: '60', reps: '8', done: false }] },
];

test('toExercises parses inputs and drops sets without reps and empty exercises', () => {
  expect(toExercises(edited, false)).toEqual([
    {
      name: 'Squat',
      sets: [
        { weight: 100, reps: 5 },
        { weight: 2, reps: 5 },
      ],
    },
    { name: 'Bench', sets: [{ weight: 60, reps: 8 }] },
  ]);
  expect(toExercises(edited, true)).toEqual([{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }]);
});

test('a weight or reps that isn’t a number is invalid, empty included', () => {
  expect(['0', '100', '102.5', '2.'].every(isValidWeight)).toBe(true);
  expect(['.', '', ' ', '1.2.3'].some(isValidWeight)).toBe(false);
  expect(isValidReps('5')).toBe(true);
  expect(['', '5.5'].some(isValidReps)).toBe(false);

  const exercises: DraftExercise[] = [
    {
      key: 'a',
      name: 'Squat',
      sets: [
        { weight: '.', reps: '5', done: true },
        { weight: '100', reps: '', done: false },
        { weight: '100', reps: '5', done: true },
      ],
    },
  ];
  expect(invalidSetCount(exercises, true)).toBe(1);
  expect(invalidSetCount(exercises, false)).toBe(2);
});

test('toWorkout logs only completed sets and the plan when there is one', () => {
  const draft: Draft = { date: '2026-10-18', planId: null, basedOn: null, exercises: edited };
  expect(toWorkout(draft)).toEqual({
    date: '2026-10-18',
    exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }],
  });
  expect(toWorkout({ ...draft, planId: 4 })).toHaveProperty('plan_id', 4);
  expect(completedSetCount(draft)).toBe(1);
});

test('useDraft is null once storage is read with nothing stored', async () => {
  const { result } = await renderHook(() => useDraft());
  await waitFor(() => expect(result.current.draft).toBeNull());
});

test('useDraft persists changes and restores them on the next launch', async () => {
  const first = await renderHook(() => useDraft());
  await waitFor(() => expect(first.result.current.draft).toBeNull());
  const draft = draftFromPlan('2026-10-18', null, [squat]);
  await act(() => first.result.current.setDraft(draft));
  await act(() => first.result.current.setDraft((d) => ({ ...d, date: '2026-10-19' })));
  expect(first.result.current.draft?.date).toBe('2026-10-19');

  const second = await renderHook(() => useDraft());
  await waitFor(() => expect(second.result.current.draft?.date).toBe('2026-10-19'));
  expect(second.result.current.draft?.exercises[0].name).toBe('Squat');

  await act(() => second.result.current.setDraft(null));
  expect(await AsyncStorage.getItem('trucker.draft')).toBeNull();
});

test('an updater function does nothing before a draft exists', async () => {
  const { result } = await renderHook(() => useDraft());
  await waitFor(() => expect(result.current.draft).toBeNull());
  await act(() => result.current.setDraft((d) => ({ ...d, date: 'x' })));
  expect(result.current.draft).toBeNull();
});
