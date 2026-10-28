import { Router } from 'express';
import { z } from 'zod';
import { FollowUpType, LeadStatus, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';

const r = Router();
const DAY = 86_400_000;
const STAFF = ['RECEPTION', 'MANAGER', 'DOCTOR'] as const;

/**
 * Generates the follow-up tasks that are derived from data: package expiries within 14 days and unpaid invoices.
 * Idempotent — safe to call on every page load (a cron would call it nightly in production). A per-tenant advisory lock
 * serialises concurrent calls (the follow-ups page loads two lists at once), which otherwise each created the same task.
 */
async function syncDerivedTasks(tenantId: string) {
  const soon = new Date(Date.now() + 14 * DAY);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`followups:${tenantId}`}))`;
    const [expiring, unpaid, existing] = await Promise.all([
      tx.clientPackage.findMany({ where: { tenantId, status: 'ACTIVE', expiresAt: { lte: soon } }, include: { items: true } }),
      tx.invoice.findMany({ where: { tenantId, kind: 'INVOICE', status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } }),
      tx.followUp.findMany({ where: { tenantId, type: { in: ['PACKAGE_EXPIRY', 'PAYMENT_DUE'] } }, select: { id: true, title: true, clientId: true, status: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const have = new Set<string>();
    const dupes: string[] = []; // clean up open duplicates created before the lock existed
    for (const o of existing) {
      const k = `${o.clientId}|${o.title}`;
      if (have.has(k) && o.status === 'OPEN') dupes.push(o.id); else have.add(k);
    }
    if (dupes.length) await tx.followUp.deleteMany({ where: { id: { in: dupes } } });
    const data: { tenantId: string; clientId: string; type: FollowUpType; dueDate: Date; title: string; notes?: string }[] = [];
    const add = (t: (typeof data)[number]) => { const k = `${t.clientId}|${t.title}`; if (!have.has(k)) { have.add(k); data.push(t); } };
    for (const p of expiring) {
      const left = p.items.reduce((s, i) => s + i.totalSessions - i.usedSessions, 0);
      if (left > 0) add({ tenantId, clientId: p.clientId, type: 'PACKAGE_EXPIRY', dueDate: new Date(p.expiresAt.getTime() - 7 * DAY), title: `Package expiring: ${p.name}`, notes: `${left} session(s) unused` });
    }
    for (const i of unpaid)
      add({ tenantId, clientId: i.clientId, type: 'PAYMENT_DUE', dueDate: i.dueDate ?? new Date(i.issuedAt.getTime() + 7 * DAY), title: `Balance due on ${i.number}`, notes: `AED ${(Number(i.total) - Number(i.paid)).toFixed(2)} outstanding` });
    if (data.length) await tx.followUp.createMany({ data });
  }, { timeout: 20_000 });
}

r.get('/followups', async (req, res) => {
  const q = z.object({
    status: z.nativeEnum(TaskStatus).default('OPEN'), type: z.nativeEnum(FollowUpType).optional(), bucket: z.enum(['overdue', 'today', 'week', 'all']).default('all'), q: z.string().trim().optional(),
  }).parse(req.query);
  await syncDerivedTasks(req.auth.tenantId);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const due = q.bucket === 'overdue' ? { lt: start } : q.bucket === 'today' ? { gte: start, lt: new Date(start.getTime() + DAY) } : q.bucket === 'week' ? { lt: new Date(start.getTime() + 7 * DAY) } : undefined;
  // Phone search ignores spaces/dashes and accepts +971 for a local 05… number.
  const digits = q.q?.replace(/\D/g, '').replace(/^971/, '0');
  const rows = await prisma.followUp.findMany({
    where: {
      tenantId: req.auth.tenantId, status: q.status, ...(q.type && { type: q.type }), ...(due && { dueDate: due }),
      ...(q.q && {
        client: {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } }, { clientNo: { contains: q.q, mode: 'insensitive' } },
            ...(digits ? [{ mobile: { contains: digits } }, { altPhone: { contains: digits } }] : []),
          ],
        },
      }),
    },
    include: { client: { select: { id: true, name: true, clientNo: true, mobile: true, whatsappOptIn: true, nextReviewDate: true } } },
    orderBy: { dueDate: 'asc' }, take: 500,
  });
  const users = await prisma.user.findMany({ where: { tenantId: req.auth.tenantId }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  res.json(rows.map((f) => ({ ...f, assignedTo: f.assignedToId ? name.get(f.assignedToId) : null, overdue: f.status === 'OPEN' && f.dueDate < start })));
});

// Backwards-compatible: clients whose review is overdue or due within `withinDays`.
r.get('/followups/due', async (req, res) => {
  const withinDays = Number(req.query.withinDays ?? 3);
  const clients = await prisma.client.findMany({
    where: { tenantId: req.auth.tenantId, active: true, nextReviewDate: { lte: new Date(Date.now() + withinDays * DAY) } },
    orderBy: { nextReviewDate: 'asc' },
  });
  res.json(clients.map((c) => ({ ...c, overdue: !!c.nextReviewDate && c.nextReviewDate.getTime() < Date.now() })));
});

r.post('/followups', requireRole(...STAFF), async (req, res) => {
  const b = z.object({ clientId: z.string(), type: z.nativeEnum(FollowUpType).default('CALLBACK'), dueDate: z.coerce.date(), title: z.string().min(1), notes: z.string().optional(), assignedToId: z.string().optional() }).parse(req.body);
  if (!(await prisma.client.count({ where: { id: b.clientId, tenantId: req.auth.tenantId } }))) throw new HttpError(404, 'Client not found');
  const f = await prisma.followUp.create({ data: { ...b, tenantId: req.auth.tenantId } });
  await audit(req, 'followup.create', 'FollowUp', f.id, { clientId: b.clientId });
  res.status(201).json(f);
});

r.patch('/followups/:id', requireRole(...STAFF), async (req, res) => {
  const b = z.object({ status: z.nativeEnum(TaskStatus).optional(), outcome: z.string().optional(), dueDate: z.coerce.date().optional(), assignedToId: z.string().optional() }).parse(req.body);
  const f = await prisma.followUp.findFirst({ where: { id: String(req.params.id), tenantId: req.auth.tenantId } });
  if (!f) throw new HttpError(404, 'Task not found');
  await prisma.followUp.update({ where: { id: f.id }, data: { ...b, ...(b.status && b.status !== 'OPEN' && { completedAt: new Date() }) } });
  await audit(req, 'followup.update', 'FollowUp', f.id, { ...b, clientId: f.clientId });
  res.json({ ok: true });
});

// ---- Leads / enquiries pipeline ----
r.get('/leads', requireRole(...STAFF), async (req, res) => {
  res.json(await prisma.lead.findMany({ where: { tenantId: req.auth.tenantId }, orderBy: { createdAt: 'desc' }, take: 500 }));
});
const leadBody = z.object({
  name: z.string().min(1), mobile: z.string().min(5), email: z.string().optional().nullable(), gender: z.string().optional().nullable(), source: z.string().default('Walk-in'),
  interest: z.string().optional().nullable(), offer: z.string().trim().optional().nullable(), notes: z.string().optional().nullable(), nextActionAt: z.coerce.date().optional().nullable(), status: z.nativeEnum(LeadStatus).optional(),
});
r.post('/leads', requireRole(...STAFF), async (req, res) => {
  const b = leadBody.parse(req.body);
  const l = await prisma.lead.create({ data: { ...b, tenantId: req.auth.tenantId, ownerId: req.auth.userId } });
  await audit(req, 'lead.create', 'Lead', l.id);
  res.status(201).json(l);
});
r.patch('/leads/:id', requireRole(...STAFF), async (req, res) => {
  const b = leadBody.partial().parse(req.body);
  const out = await prisma.lead.updateMany({ where: { id: String(req.params.id), tenantId: req.auth.tenantId }, data: b });
  if (!out.count) throw new HttpError(404, 'Lead not found');
  await audit(req, 'lead.update', 'Lead', String(req.params.id), b);
  res.json({ ok: true });
});

/** Marketing offers in use (free text on leads and clients), with how many of each picked it — feeds the offer pickers and filters. */
r.get('/offers', async (req, res) => {
  const [leads, clients] = await Promise.all([
    prisma.lead.groupBy({ by: ['offer'], where: { tenantId: req.auth.tenantId, offer: { not: null } }, _count: true }),
    prisma.client.groupBy({ by: ['offer'], where: { tenantId: req.auth.tenantId, offer: { not: null } }, _count: true }),
  ]);
  const map = new Map<string, { offer: string; leads: number; clients: number }>();
  for (const l of leads) map.set(l.offer!, { offer: l.offer!, leads: l._count, clients: 0 });
  for (const c of clients) map.set(c.offer!, { ...(map.get(c.offer!) ?? { offer: c.offer!, leads: 0 }), clients: c._count });
  res.json([...map.values()].sort((a, b) => b.leads + b.clients - a.leads - a.clients));
});

// ---- Messaging (approved templates, consent-aware) ----
r.get('/message-templates', async (req, res) => res.json(await prisma.messageTemplate.findMany({ where: { tenantId: req.auth.tenantId }, orderBy: { name: 'asc' } })));
r.post('/message-templates', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ name: z.string().min(1), channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']), purpose: z.string(), body: z.string().min(5) }).parse(req.body);
  const t = await prisma.messageTemplate.create({ data: { ...b, tenantId: req.auth.tenantId } });
  await audit(req, 'template.create', 'MessageTemplate', t.id);
  res.status(201).json(t);
});
r.patch('/message-templates/:id', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ name: z.string().min(1).optional(), body: z.string().min(5).optional(), active: z.boolean().optional() }).parse(req.body);
  const out = await prisma.messageTemplate.updateMany({ where: { id: String(req.params.id), tenantId: req.auth.tenantId }, data: b });
  if (!out.count) throw new HttpError(404, 'Template not found');
  res.json({ ok: true });
});

/**
 * Sends (logs) a message. Without a WhatsApp Business provider connected, the UI opens wa.me with the rendered text;
 * once a provider is configured this is the single place to call its API.
 */
r.post('/messages', requireRole(...STAFF, 'ACCOUNTANT'), async (req, res) => {
  const b = z.object({ clientId: z.string(), templateId: z.string().optional(), body: z.string().min(1), channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']).default('WHATSAPP') }).parse(req.body);
  const c = await prisma.client.findFirst({ where: { id: b.clientId, tenantId: req.auth.tenantId } });
  if (!c) throw new HttpError(404, 'Client not found');
  if (b.channel === 'WHATSAPP' && !c.whatsappOptIn) throw new HttpError(409, `${c.name} has not opted in to WhatsApp messages`);
  const m = await prisma.messageLog.create({ data: { tenantId: req.auth.tenantId, clientId: c.id, channel: b.channel, to: c.mobile, templateId: b.templateId, body: b.body, sentById: req.auth.userId } });
  res.status(201).json({ ...m, waLink: `https://wa.me/${c.mobile.replace(/\D/g, '').replace(/^0/, '971')}?text=${encodeURIComponent(b.body)}` });
});
r.get('/messages', requireRole(...STAFF), async (req, res) => {
  res.json(await prisma.messageLog.findMany({ where: { tenantId: req.auth.tenantId }, include: { client: { select: { id: true, name: true, clientNo: true } } }, orderBy: { sentAt: 'desc' }, take: 300 }));
});

export default r;
