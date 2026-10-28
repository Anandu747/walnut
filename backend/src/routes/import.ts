import { Router } from 'express';
import { z } from 'zod';
import { LeadStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { nextSeq } from '../services/billing';

const r = Router();
const IMPORTERS = ['MANAGER', 'RECEPTION'] as const;
const MAX_ROWS = 1000;

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

/**
 * Reads a Google Sheet as CSV. Only the sheet id/gid are taken from the user's link and the request always goes to
 * docs.google.com, so this cannot be pointed at arbitrary hosts. The sheet must be shared "Anyone with the link".
 */
r.post('/import/google-sheet', requireRole(...IMPORTERS), async (req, res) => {
  const { url } = z.object({ url: z.string().url() }).parse(req.body);
  const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (!m) throw new HttpError(400, 'Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…)');
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  let resp: Response;
  try {
    resp = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new HttpError(502, 'Could not reach Google Sheets — try again or upload the file instead');
  }
  const type = resp.headers.get('content-type') ?? '';
  if (!resp.ok || !type.includes('text/csv')) throw new HttpError(400, 'Cannot read this sheet. In Google Sheets choose Share → General access → "Anyone with the link" (Viewer), then try again.');
  res.json({ rows: parseCsv(await resp.text()).slice(0, MAX_ROWS + 1) });
});

// ---- Cell normalisers: spreadsheets arrive with "Yes"/"Y"/"TRUE", "F"/"Female", "15/03/1990" etc. ----
const text = z.preprocess((v) => (v == null || String(v).trim() === '' ? undefined : String(v).trim()), z.string().optional());
const required = (label: string) => z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string().min(1, `${label} is required`));
const bool = z.preprocess((v) => {
  if (v == null || v === '') return undefined;
  const s = String(v).trim().toLowerCase();
  return ['yes', 'y', 'true', '1'].includes(s) ? true : ['no', 'n', 'false', '0'].includes(s) ? false : v;
}, z.boolean({ message: 'Use Yes or No' }).optional());
const gender = z.preprocess((v) => {
  const s = v == null ? '' : String(v).trim().toLowerCase();
  return !s ? undefined : s.startsWith('f') ? 'Female' : s.startsWith('m') ? 'Male' : v;
}, z.enum(['Female', 'Male'], { message: 'Gender must be Female or Male' }).optional());
const mobile = z.preprocess((v) => (v == null ? '' : String(v).replace(/[^\d+]/g, '')), z.string().regex(/^\+?\d{7,15}$/, 'Mobile must be 7–15 digits'));
const date = z.preprocess((v) => {
  if (v == null || String(v).trim() === '') return undefined;
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // UAE style day-first
  return dmy ? new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])) : new Date(s);
}, z.date({ message: 'Date must be DD-MM-YYYY' }).refine((d) => !isNaN(d.getTime()), 'Date must be DD-MM-YYYY').optional());
const email = z.preprocess((v) => (v == null || String(v).trim() === '' ? undefined : String(v).trim()), z.string().email('Not a valid email').optional());

const clientRow = z.object({
  title: text, firstName: required('First name'), middleName: text, lastName: required('Last name'), mobile, altPhone: text, email, gender, dob: date,
  nationality: text, emiratesId: text, address: text, occupation: text, source: text, referredBy: text, offer: text, goal: text,
  conditions: text, allergies: text, medications: text, medicalNotes: text, whatsappOptIn: bool, marketingOptIn: bool, vip: bool,
});
const STAGE: Record<string, LeadStatus> = { new: 'NEW', contacted: 'CONTACTED', 'consultation booked': 'CONSULT_BOOKED', consult_booked: 'CONSULT_BOOKED', converted: 'CONVERTED', lost: 'LOST' };
const leadRow = z.object({
  name: required('Name'), mobile, email, gender, source: text, interest: text, offer: text, notes: text, nextActionAt: date,
  status: z.preprocess((v) => (v == null || String(v).trim() === '' ? undefined : STAGE[String(v).trim().toLowerCase()] ?? v), z.nativeEnum(LeadStatus, { message: 'Stage must be New, Contacted, Consultation booked, Converted or Lost' }).optional()),
});

type Result = { row: number; status: 'ok' | 'duplicate' | 'error'; message?: string; name?: string };
const fullName = (p: { firstName: string; middleName?: string; lastName: string }) => [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
const issue = (e: z.ZodError) => e.issues.map((i) => i.message).join('; ');

/**
 * Validates every row and (unless dryRun) creates the records. Rows whose mobile already exists — in the centre or
 * earlier in the same file — are reported as duplicates and skipped, so re-running an import is safe.
 */
r.post('/import/:kind', requireRole(...IMPORTERS), async (req, res) => {
  const kind = z.enum(['clients', 'leads']).parse(req.params.kind);
  const b = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ROWS), dryRun: z.boolean().default(false) }).parse(req.body);
  const t = req.auth.tenantId;
  const existing = new Set(
    kind === 'clients'
      ? (await prisma.client.findMany({ where: { tenantId: t }, select: { mobile: true } })).map((c) => c.mobile.replace(/\D/g, ''))
      : (await prisma.lead.findMany({ where: { tenantId: t }, select: { mobile: true } })).map((l) => l.mobile.replace(/\D/g, '')),
  );
  const results: Result[] = [];
  for (const [i, raw] of b.rows.entries()) {
    const row = i + 2; // spreadsheet row number (row 1 = headers)
    const parsed = (kind === 'clients' ? clientRow : leadRow).safeParse(raw);
    if (!parsed.success) { results.push({ row, status: 'error', message: issue(parsed.error) }); continue; }
    const v = parsed.data as z.infer<typeof clientRow> & z.infer<typeof leadRow>;
    const name = kind === 'clients' ? fullName(v) : v.name;
    const key = v.mobile.replace(/\D/g, '');
    if (existing.has(key)) { results.push({ row, name, status: 'duplicate', message: `Mobile ${v.mobile} already exists — skipped` }); continue; }
    existing.add(key);
    if (!b.dryRun) {
      if (kind === 'clients') {
        const c = v as z.infer<typeof clientRow>;
        await prisma.$transaction(async (tx) => {
          const { n } = await nextSeq(tx, t, 'clientSeq');
          await tx.client.create({ data: { ...c, name, tenantId: t, clientNo: `WLN-${String(n).padStart(5, '0')}` } });
        });
      } else {
        await prisma.lead.create({ data: { ...(v as z.infer<typeof leadRow>), source: v.source ?? 'Import', tenantId: t, ownerId: req.auth.userId } });
      }
    }
    results.push({ row, name, status: 'ok' });
  }
  const count = (s: Result['status']) => results.filter((x) => x.status === s).length;
  const summary = { imported: b.dryRun ? 0 : count('ok'), valid: count('ok'), duplicates: count('duplicate'), errors: count('error') };
  if (!b.dryRun) await audit(req, `${kind}.import`, kind === 'clients' ? 'Client' : 'Lead', undefined, summary);
  res.json({ ...summary, results });
});

export default r;
