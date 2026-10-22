export type ExportCol<T> = { title: string; value: (row: T) => unknown };

const cell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a UTF-8 BOM so Excel opens Arabic names and AED amounts correctly. */
export function exportCsv<T>(filename: string, cols: ExportCol<T>[], rows: T[]) {
  const lines = [cols.map((c) => cell(c.title)).join(','), ...rows.map((r) => cols.map((c) => cell(c.value(r))).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
