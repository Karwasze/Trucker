import type { StatisticsData } from '@/api/types';

export type PersonalRecord = {
  date: string;
  estimated_1rm: number;
  /** kg of est. 1RM over the record before. */
  gain: number;
};

/**
 * Sessions whose est. 1RM beat every earlier session, newest first. The
 * first session ever only sets the baseline, so it isn't one. data is
 * oldest first.
 */
export function personalRecords(data: StatisticsData[]): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  let record: number | null = null;
  for (const d of data) {
    if (record !== null && d.estimated_1rm > record) {
      records.push({ date: d.date, estimated_1rm: d.estimated_1rm, gain: d.estimated_1rm - record });
    }
    if (record === null || d.estimated_1rm > record) record = d.estimated_1rm;
  }
  return records.reverse();
}
