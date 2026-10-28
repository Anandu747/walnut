import dayjs from 'dayjs';

/** RFC 4180 CSV (quoted fields, embedded commas/newlines, "" escapes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((x) => x.some((c) => c.trim()));
}

/** Reads the first sheet of an .xlsx or a .csv file into rows of strings (Excel dates become DD-MM-YYYY). */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Upload an Excel (.xlsx) or CSV file. For old .xls files use File → Save As → .xlsx first.');
  const { readSheet } = await import('read-excel-file/browser'); // loaded only when needed
  const data = await readSheet(file);
  return data
    .map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? dayjs(c).format('DD-MM-YYYY') : String(c).trim())))
    .filter((r) => r.some(Boolean));
}

export type Field = { key: string; label: string; required?: boolean; example?: string; aliases?: string[] };
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

/** Matches sheet headers to fields by label, key or alias, ignoring case, spacing and "(hints)". */
export function mapHeaders(headers: string[], fields: Field[]) {
  const index: Record<string, number> = {};
  const unknown: string[] = [];
  headers.forEach((h, i) => {
    const n = norm(h);
    const f = n && fields.find((x) => [x.label, x.key, ...(x.aliases ?? [])].some((a) => norm(a) === n));
    if (f && index[f.key] === undefined) index[f.key] = i; else if (h.trim()) unknown.push(h);
  });
  return { index, unknown };
}
