import dayjs, { Dayjs } from 'dayjs';

/** Date-range presets shared by the dashboard, reports and range pickers (inclusive day ranges). */
export const rangePresets = (): { label: string; value: [Dayjs, Dayjs] }[] => {
  const t = dayjs();
  return [
    { label: 'Today', value: [t, t] },
    { label: 'Yesterday', value: [t.subtract(1, 'day'), t.subtract(1, 'day')] },
    { label: 'Last 7 days', value: [t.subtract(6, 'day'), t] },
    { label: 'Month to date', value: [t.startOf('month'), t] },
    { label: 'Last month', value: [t.subtract(1, 'month').startOf('month'), t.subtract(1, 'month').endOf('month')] },
    { label: 'Last quarter', value: [t.subtract(3, 'month').startOf('month'), t.subtract(1, 'month').endOf('month')] },
    { label: 'Year to date', value: [t.startOf('year'), t] },
  ];
};

/** Inclusive day range → API query `from=…&to=…` with `to` exclusive, in local-midnight ISO. */
export const rangeQuery = ([a, b]: [Dayjs, Dayjs]) => `from=${a.startOf('day').toISOString()}&to=${b.add(1, 'day').startOf('day').toISOString()}`;
