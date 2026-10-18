import { ApiError, createApi, localDate } from '@/api/client';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

/** Makes the next fetch answer with `body` as JSON (or text when `status` isn't OK). */
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, method: init?.method ?? 'GET', body: init?.body && JSON.parse(init.body) };
};

beforeEach(() => fetchMock.mockReset());

test('requests go to the server root without doubled slashes, as JSON', async () => {
  respond([]);
  await createApi('http://host:8081//').listPlans();
  expect(fetchMock).toHaveBeenCalledWith(
    'http://host:8081/api/plans',
    expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
  );
});

test('without a server it fails before fetching', async () => {
  await expect(createApi('').listPlans()).rejects.toThrow('No server set. Add its URL in Settings.');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('network failures name the server', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(createApi('http://host').listPlans()).rejects.toThrow("Can't reach the server at http://host");
});

test('server errors carry the response text and status', async () => {
  respond('plan not found\n', 404);
  const error = await createApi('http://host')
    .getPlan(9)
    .catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.message).toBe('plan not found');
  expect(error.status).toBe(404);

  respond('', 500);
  await expect(createApi('http://host').getPlan(9)).rejects.toThrow('Request failed (500)');
});

test('null lists and missing fields come back empty', async () => {
  const api = createApi('http://host');
  respond(null);
  expect(await api.listWorkouts()).toEqual([]);
  respond([{ id: 1, date: '2026-10-18', exercises: null }]);
  expect(await api.listWorkouts()).toEqual([{ id: 1, date: '2026-10-18', exercises: [] }]);
  respond([{ id: 1, name: 'Squat', muscles: null }]);
  expect(await api.listExercises()).toEqual([{ id: 1, name: 'Squat', muscles: [] }]);
  respond({ exercises: null, data: null });
  expect(await api.statistics()).toEqual({ exercises: [], data: [] });
  respond({ goal: null, sessions: null });
  expect(await api.goalToday('2026-10-18')).toEqual({ goal: null, sessions: [] });
});

test('query parameters are encoded', async () => {
  const api = createApi('http://host');
  respond({ sets: null });
  expect(await api.latestSets('Bench & Press')).toEqual([]);
  expect(lastCall().url).toBe('http://host/api/latest-exercise?name=Bench%20%26%20Press');

  respond({ target: [{ weight: 60, reps: 5 }], reason: 'Up' });
  await api.exerciseTarget('Row', '2026-10-18', { sets: 3, reps: 5 });
  expect(lastCall().url).toBe('http://host/api/latest-exercise?name=Row&date=2026-10-18&sets=3&reps=5');

  respond([]);
  await api.goalSessions(2, '2026-10-18', '2026-10-01');
  expect(lastCall().url).toBe('http://host/api/goals/sessions?id=2&date=2026-10-18&from=2026-10-01');
});

test('writes send the right method and body', async () => {
  const api = createApi('http://host');
  respond({ id: 5 });
  await api.createPlan({ id: 0, name: 'Push', days: [] });
  expect(lastCall()).toEqual({ url: 'http://host/api/plans', method: 'POST', body: { name: 'Push', days: [] } });

  respond({});
  await api.updateWorkout({ id: 3, date: '2026-10-18', plan_id: 2, exercises: [] });
  expect(lastCall()).toEqual({
    url: 'http://host/api/workouts',
    method: 'PUT',
    body: { id: 3, date: '2026-10-18', exercises: [] },
  });

  respond([{ date: '2026-10-18', weight: 82 }]);
  await api.replaceBodyweight([{ date: '2026-10-18', weight: 82 }]);
  expect(lastCall()).toEqual({
    url: 'http://host/api/bodyweight',
    method: 'PUT',
    body: [{ date: '2026-10-18', weight: 82 }],
  });

  respond({ success: true });
  await api.deleteBodyweight('2026-10-18');
  expect(lastCall()).toMatchObject({ url: 'http://host/api/bodyweight?date=2026-10-18', method: 'DELETE' });
});

test('triathlons come back as a list, even when the server has none', async () => {
  respond(null);
  expect(await createApi('http://host').listTriathlons()).toEqual([]);
  expect(lastCall().url).toBe('http://host/api/triathlons');
});

test('insights fills in every missing section', async () => {
  respond({ adherence: { planned: 3, done: 2, missed: null } });
  const insights = await createApi('http://host').insights('2026-10-18', '2026-09-18', 4);
  expect(lastCall().url).toBe('http://host/api/insights?date=2026-10-18&from=2026-09-18&plan_id=4');
  expect(insights).toMatchObject({
    muscles: [],
    stalls: [],
    progression: [],
    tonnage: { total: 0, weekly: [], by_exercise: [] },
    strength: [],
    untagged: [],
    cardio: [],
    goal: null,
    triathlon: null,
    adherence: { planned: 3, done: 2, missed: [] },
  });

  respond({ triathlon: { count: 1, records: null } });
  expect((await createApi('http://host').insights('2026-10-18', null, null)).triathlon).toMatchObject({
    count: 1,
    records: [],
  });
});

test('saved goals always have a warnings list', async () => {
  respond({ goal: { id: 1 } });
  expect(
    await createApi('http://host').createGoal({ name: 'Marathon', race_date: '2027-04-01' } as never, '2026-10-18')
  ).toEqual({
    goal: { id: 1 },
    warnings: [],
  });
});

test('localDate uses the device’s calendar date', () => {
  expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  expect(localDate(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25');
});
