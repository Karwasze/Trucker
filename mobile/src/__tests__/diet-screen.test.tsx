import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { DietDay, DietInsights } from '@/api/types';
import DietScreen from '@/app/(tabs)/diet/index';
import { listenForCheckIns, scheduleCheckIns } from '@/diet/reminder-native';
import { mockServer, renderInApp, setNow, type Request } from '@/test-utils';

const noInsights: DietInsights = { current_streak: 0, longest_streak: 0, recent: { days: 30, logged: 0, adhered: 0 } };

/** A fake diet API keeping its days in memory. */
function server(initial: DietDay[] = [], { insights = noInsights } = {}) {
  let days = [...initial];
  const requests = mockServer({
    'GET /api/diet': ({ query }: Request) => {
      const from = query.get('from') ?? '';
      const to = query.get('to') ?? '9999';
      return days.filter((d) => d.date >= from && d.date <= to);
    },
    'PUT /api/diet': ({ body }: Request) => {
      const day = body as DietDay;
      days = [...days.filter((d) => d.date !== day.date), day];
      return day;
    },
    'DELETE /api/diet': ({ query }: Request) => {
      days = days.filter((d) => d.date !== query.get('date'));
      return { success: true };
    },
    'GET /api/diet/insights': insights,
  });
  return { requests, days: () => days };
}

const dayButton = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  // Wednesday 14 October 2026.
  setNow('2026-10-14T18:00:00+02:00');
});
afterEach(() => jest.useRealTimers());

test("shows this month's days, kept to, missed or not logged, with today selected", async () => {
  server([
    { date: '2026-10-01', adhered: true },
    { date: '2026-10-12', adhered: true },
    { date: '2026-10-13', adhered: false },
  ]);
  await renderInApp(<DietScreen />);

  expect(await screen.findByText('October 2026')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: 'Thursday 1 Oct, kept to' })).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: 'Monday 12 Oct, kept to' })).toBeOnTheScreen();
  expect(dayButton(/^Tuesday 13 Oct, missed/)).toBeOnTheScreen();
  expect(dayButton(/^Wednesday 14 Oct, not logged/)).toBeSelected();
  expect(dayButton(/^Thursday 15 Oct, to come/)).toBeDisabled();
  expect(dayButton(/^Saturday 31 Oct, to come/)).toBeDisabled();
  expect(screen.getByText('Today')).toBeOnTheScreen();
  expect(screen.getByText('Not logged yet.')).toBeOnTheScreen();
});

test('logs today as kept to, then the protein eaten, with no target', async () => {
  const api = server();
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await user.press(await screen.findByRole('button', { name: 'Yes' }));
  expect(await screen.findByRole('button', { name: 'Wednesday 14 Oct, kept to' })).toBeOnTheScreen();
  expect(api.days()).toEqual([{ date: '2026-10-14', adhered: true }]);
  expect(screen.queryByText(/Target/)).not.toBeOnTheScreen();

  const input = screen.getByLabelText('Protein in grams');
  await user.type(input, '120', { submitEditing: true });
  await waitFor(() => expect(api.days()).toEqual([{ date: '2026-10-14', adhered: true, protein_g: 120 }]));
});

test('changes and clears an earlier day', async () => {
  const api = server([{ date: '2026-10-12', adhered: true, protein_g: 160 }]);
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await user.press(await screen.findByRole('button', { name: 'Monday 12 Oct, kept to' }));
  expect(screen.getByText('Monday 12 October')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'No' }));
  // The protein counted stays.
  await waitFor(() => expect(api.days()).toEqual([{ date: '2026-10-12', adhered: false, protein_g: 160 }]));

  await user.press(screen.getByRole('button', { name: 'Clear day' }));
  expect(await screen.findByRole('button', { name: 'Monday 12 Oct, not logged' })).toBeOnTheScreen();
  expect(api.days()).toEqual([]);
});

test('steps back to an earlier month, selecting its last day, and home again', async () => {
  const api = server([{ date: '2026-08-31', adhered: true }], {
    insights: { ...noInsights, first_date: '2026-08-31' },
  });
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await user.press(await screen.findByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('September 2026')).toBeOnTheScreen();
  expect(dayButton(/^Wednesday 30 Sept/)).toBeSelected();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
  expect(api.requests.at(-1)?.query.get('from')).toBe('2026-09-01');
  expect(api.requests.at(-1)?.query.get('to')).toBe('2026-09-30');

  await user.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('August 2026')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: 'Monday 31 Aug, kept to' })).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'This month' }));
  expect(await screen.findByText('October 2026')).toBeOnTheScreen();
  expect(dayButton(/^Wednesday 14 Oct/)).toBeSelected();
});

test('goes back a month before the first day logged, and no further', async () => {
  server([{ date: '2026-10-02', adhered: true }], {
    insights: { ...noInsights, first_date: '2026-10-02' },
  });
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  await user.press(await screen.findByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('September 2026')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
});

test('leaves insights and settings to their tabs', async () => {
  server([], { insights: { current_streak: 4, longest_streak: 9, recent: { days: 30, logged: 30, adhered: 27 } } });
  await renderInApp(<DietScreen />);
  expect(await screen.findByText('Not logged yet.')).toBeOnTheScreen();
  expect(screen.queryByText('4-day streak')).not.toBeOnTheScreen();
  expect(screen.queryByRole('switch', { name: 'Evening check-in' })).not.toBeOnTheScreen();
  expect(screen.queryByLabelText('Daily protein target in grams')).not.toBeOnTheScreen();
});

test("skips today's check-in once today is logged", async () => {
  await AsyncStorage.setItem('trucker.diet-reminder', JSON.stringify({ enabled: true, minutes: 1260 }));
  server();
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await waitFor(() => expect(jest.mocked(scheduleCheckIns).mock.calls.at(-1)?.[0][0].date).toBe('2026-10-14'));
  await user.press(await screen.findByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(jest.mocked(scheduleCheckIns).mock.calls.at(-1)![0][0].date).toBe('2026-10-15'));
});

test('records the answer given from a check-in notification', async () => {
  const api = server([{ date: '2026-10-14', adhered: true, protein_g: 140 }]);
  await renderInApp(<DietScreen />);
  expect(await screen.findByRole('button', { name: 'Wednesday 14 Oct, kept to' })).toBeOnTheScreen();

  const onAnswer = jest.mocked(listenForCheckIns).mock.calls[0][0];
  await act(async () => onAnswer({ date: '2026-10-14', adhered: false }));

  expect(await screen.findByRole('button', { name: 'Wednesday 14 Oct, missed' })).toBeOnTheScreen();
  expect(api.days()).toEqual([{ date: '2026-10-14', adhered: false, protein_g: 140 }]);
});
