import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { DietDay, DietInsights } from '@/api/types';
import DietScreen from '@/app/(tabs)/diet/index';
import { listenForCheckIns, requestReminderPermission, scheduleCheckIns } from '@/diet/reminder-native';
import { mockServer, renderInApp, setNow, type Request } from '@/test-utils';

const noInsights: DietInsights = { current_streak: 0, longest_streak: 0, recent: { days: 30, logged: 0, adhered: 0 } };

/** A fake diet API keeping its days in memory. */
function server(initial: DietDay[] = [], { target = null as number | null, insights = noInsights } = {}) {
  let days = [...initial];
  let protein_target_g = target;
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
    'GET /api/diet/settings': () => ({ protein_target_g }),
    'PUT /api/diet/settings': ({ body }: Request) => {
      protein_target_g = (body as { protein_target_g: number | null }).protein_target_g;
      return { protein_target_g };
    },
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

test("shows this week's days, kept to, missed or not logged, with today selected", async () => {
  server([
    { date: '2026-10-12', adhered: true },
    { date: '2026-10-13', adhered: false },
  ]);
  await renderInApp(<DietScreen />);

  expect(await screen.findByText('12 – 18 Oct')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: 'Monday 12 Oct, kept to' })).toBeOnTheScreen();
  expect(dayButton(/^Tuesday 13 Oct, missed/)).toBeOnTheScreen();
  expect(dayButton(/^Wednesday 14 Oct, not logged/)).toBeSelected();
  expect(dayButton(/^Thursday 15 Oct, to come/)).toBeDisabled();
  expect(screen.getByText('Today')).toBeOnTheScreen();
  expect(screen.getByText('Not logged yet.')).toBeOnTheScreen();
});

test('logs today as kept to, then the protein eaten against the target', async () => {
  const api = server([], { target: 150 });
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await user.press(await screen.findByRole('button', { name: 'Yes' }));
  expect(await screen.findByRole('button', { name: 'Wednesday 14 Oct, kept to' })).toBeOnTheScreen();
  expect(api.days()).toEqual([{ date: '2026-10-14', adhered: true }]);
  expect(screen.getByText('Target 150 g')).toBeOnTheScreen();

  const input = screen.getByLabelText('Protein in grams');
  await user.type(input, '120', { submitEditing: true });
  await waitFor(() => expect(api.days()).toEqual([{ date: '2026-10-14', adhered: true, protein_g: 120 }]));
  expect(await screen.findByText('30 g short of 150 g')).toBeOnTheScreen();
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

test('steps back to an earlier week, selecting its Sunday', async () => {
  const api = server([{ date: '2026-10-04', adhered: true }]);
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await user.press(await screen.findByRole('button', { name: 'Previous week' }));
  expect(await screen.findByText('5 – 11 Oct')).toBeOnTheScreen();
  expect(dayButton(/^Sunday 11 Oct/)).toBeSelected();
  expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();

  await user.press(screen.getByRole('button', { name: 'Previous week' }));
  expect(await screen.findByText('28 Sept – 4 Oct')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: 'Sunday 4 Oct, kept to' })).toBeOnTheScreen();
  expect(api.requests.at(-1)?.query.get('from')).toBe('2026-09-28');
});

test('shows insights', async () => {
  server([], {
    insights: { current_streak: 4, longest_streak: 9, recent: { days: 30, logged: 30, adhered: 27 } },
  });
  await renderInApp(<DietScreen />);

  expect(await screen.findByText('4-day streak')).toBeOnTheScreen();
  expect(screen.getByText('Your best is 9 days.')).toBeOnTheScreen();
  expect(screen.getByText('Kept to 27 of 30 days logged')).toBeOnTheScreen();
  expect(screen.getByText('90% over the last 30 days.')).toBeOnTheScreen();
});

test('asks to log a few days before showing insights', async () => {
  server();
  await renderInApp(<DietScreen />);
  expect(await screen.findByText('Log a few days to see how your diet is going.')).toBeOnTheScreen();
});

test('saves the protein target', async () => {
  const api = server();
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await user.type(await screen.findByLabelText('Daily protein target in grams'), '160', { submitEditing: true });
  await waitFor(() =>
    expect(api.requests.find((r) => r.method === 'PUT' && r.path === '/api/diet/settings')?.body).toEqual({
      protein_target_g: 160,
    })
  );
});

test('turns on the evening check-in, scheduling it from today', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<DietScreen />);

  await fireEvent(await screen.findByRole('switch', { name: 'Evening check-in' }), 'valueChange', true);
  expect(requestReminderPermission).toHaveBeenCalled();
  expect(await screen.findByText('21:00')).toBeOnTheScreen();
  await waitFor(() => expect(scheduleCheckIns).toHaveBeenCalled());
  const checkIns = jest.mocked(scheduleCheckIns).mock.calls.at(-1)![0];
  expect(checkIns[0]).toEqual({ date: '2026-10-14', at: new Date('2026-10-14T21:00:00+02:00') });

  await user.press(screen.getByRole('button', { name: '15 minutes later' }));
  expect(screen.getByText('21:15')).toBeOnTheScreen();
  await waitFor(() =>
    expect(jest.mocked(scheduleCheckIns).mock.calls.at(-1)![0][0].at).toEqual(new Date('2026-10-14T21:15:00+02:00'))
  );
  expect(JSON.parse((await AsyncStorage.getItem('trucker.diet-reminder'))!)).toEqual({ enabled: true, minutes: 1275 });
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
