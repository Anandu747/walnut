import { Router } from 'express';
import { z } from 'zod';
import { DocKind, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { nextSeq } from '../services/billing';

const r = Router();
const DAY = 86_400_000;
const opt = z.string().trim().optional().nullable();

async function ownClient(tenantId: string, id: string) {
  const c = await prisma.client.findFirst({ where: { id, tenantId } });
  if (!c) throw new HttpError(404, 'Client not found');
  return c;
}

const clientBody = z.object({
  title: opt, firstName: z.string().trim().min(1), middleName: opt, lastName: z.string().trim().min(1), mobile: z.string().trim().min(5), altPhone: opt, email: z.string().email().optional().nullable().or(z.literal('')),
  dob: z.coerce.date().optional().nullable(), gender: opt, nationality: opt, emiratesId: opt, address: opt, occupation: opt, source: opt, referredBy: opt,
  emergencyName: opt, emergencyRelation: opt, emergencyPhone: opt,
  medicalNotes: opt, conditions: opt, allergies: opt, medications: opt, contraindications: opt, goal: opt, targetWeightKg: z.number().positive().optional().nullable(),
  consentSigned: z.boolean().optional(), photoConsent: z.boolean().optional(), whatsappOptIn: z.boolean().optional(), marketingOptIn: z.boolean().optional(),
  vip: z.boolean().optional(), reviewIntervalDays: z.number().int().min(1).max(365).optional(),
});

// Full display name is always derived from the parts so search, invoices and the calendar stay consistent.
const fullName = (p: { firstName: string; middleName?: string | null; lastName: string }) => [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');

r.post('/clients', requireRole('RECEPTION', 'MANAGER', 'DOCTOR'), async (req, res) => {
  const b = clientBody.parse(req.body);
  const dup = await prisma.client.findFirst({ where: { tenantId: req.auth.tenantId, mobile: b.mobile } });
  if (dup && !req.query.allowDuplicate) throw new HttpError(409, `A client with this mobile already exists: ${dup.name} (${dup.clientNo})`, { clientId: dup.id });
  const c = await prisma.$transaction(async (tx) => {
    const { n } = await nextSeq(tx, req.auth.tenantId, 'clientSeq');
    return tx.client.create({
      data: { ...b, name: fullName(b), email: b.email || null, tenantId: req.auth.tenantId, clientNo: `WLN-${String(n).padStart(5, '0')}`, consentSignedAt: b.consentSigned ? new Date() : null },
    });
  });
  if (req.body.leadId) await prisma.lead.updateMany({ where: { id: String(req.body.leadId), tenantId: req.auth.tenantId }, data: { status: 'CONVERTED', clientId: c.id } });
  await audit(req, 'client.create', 'Client', c.id);
  res.status(201).json(c);
});

r.patch('/clients/:id', requireRole('RECEPTION', 'MANAGER', 'DOCTOR'), async (req, res) => {
  const before = await ownClient(req.auth.tenantId, String(req.params.id));
  const b = clientBody.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const c = await prisma.client.update({
    where: { id: before.id },
    data: {
      ...b, ...(b.email !== undefined && { email: b.email || null }),
      ...((b.firstName !== undefined || b.middleName !== undefined || b.lastName !== undefined) && {
        name: fullName({ firstName: b.firstName ?? before.firstName, middleName: b.middleName !== undefined ? b.middleName : before.middleName, lastName: b.lastName ?? before.lastName }),
      }),
      ...(b.consentSigned && !before.consentSigned && { consentSignedAt: new Date() }) },
  });
  await audit(req, 'client.update', 'Client', c.id, { fields: Object.keys(b) });
  res.json(c);
});

/** Client register with server-side search, filters and paging, plus per-row balances. */
r.get('/clients', async (req, res) => {
  const q = z.object({
    q: z.string().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20),
    filter: z.enum(['all', 'active-package', 'review-due', 'no-consent', 'vip', 'new-30']).default('all'), gender: z.string().optional(), source: z.string().optional(),
  }).parse(req.query);
  const now = new Date();
  const where: Prisma.ClientWhereInput = {
    tenantId: req.auth.tenantId,
    ...(q.q && { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { mobile: { contains: q.q } }, { clientNo: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { emiratesId: { contains: q.q } }] }),
    ...(q.gender && { gender: q.gender }), ...(q.source && { source: q.source }),
    ...(q.filter === 'active-package' && { packages: { some: { status: 'ACTIVE', expiresAt: { gt: now } } } }),
    ...(q.filter === 'review-due' && { nextReviewDate: { lte: new Date(now.getTime() + 3 * DAY) } }),
    ...(q.filter === 'no-consent' && { consentSigned: false }),
    ...(q.filter === 'vip' && { vip: true }),
    ...(q.filter === 'new-30' && { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }),
  };
  const [total, rows] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      include: {
        packages: { where: { status: 'ACTIVE' }, select: { items: { select: { totalSessions: true, usedSessions: true } } } },
        invoices: { where: { kind: 'INVOICE', status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, select: { total: true, paid: true } },
        appointments: { where: { status: 'COMPLETED' }, orderBy: { startAt: 'desc' }, take: 1, select: { startAt: true } },
      },
    }),
  ]);
  res.json({
    total, page: q.page, pageSize: q.pageSize,
    rows: rows.map(({ packages, invoices, appointments, ...c }) => ({
      ...c,
      activePackages: packages.length,
      sessionsLeft: packages.reduce((s, p) => s + p.items.reduce((t, i) => t + i.totalSessions - i.usedSessions, 0), 0),
      balanceDue: invoices.reduce((s, i) => s + Number(i.total) - Number(i.paid), 0),
      lastVisit: appointments[0]?.startAt ?? null,
    })),
  });
});

/** 360° client profile — everything the client workspace tabs need. */
r.get('/clients/:id', async (req, res) => {
  const c = await prisma.client.findFirst({
    where: { id: String(req.params.id), tenantId: req.auth.tenantId },
    include: {
      measurements: { orderBy: { recordedAt: 'asc' } },
      consultations: { orderBy: { date: 'desc' }, include: { doctor: { select: { name: true } } } },
      packages: { orderBy: { purchasedAt: 'desc' }, include: { items: { include: { treatment: { select: { id: true, name: true, color: true } } } } } },
      followUps: { orderBy: { dueDate: 'desc' }, take: 20 },
      documents: { select: { id: true, kind: true, title: true, fileName: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!c) throw new HttpError(404, 'Client not found');
  const [invoices, appointments, messages] = await Promise.all([
    prisma.invoice.findMany({ where: { clientId: c.id, tenantId: req.auth.tenantId }, orderBy: { issuedAt: 'desc' }, include: { payments: true } }),
    prisma.appointment.findMany({
      where: { clientId: c.id, tenantId: req.auth.tenantId }, orderBy: { startAt: 'desc' },
      include: { treatment: { select: { name: true, color: true } }, therapist: { select: { name: true } }, machine: { select: { code: true } }, room: { select: { name: true } }, session: true },
    }),
    prisma.messageLog.findMany({ where: { clientId: c.id, tenantId: req.auth.tenantId }, orderBy: { sentAt: 'desc' }, take: 30 }),
  ]);
  // Therapists only see what they need to deliver a session (limited client information).
  if (req.auth.role === 'THERAPIST') {
    res.json({ ...c, invoices: [], messages: [], emiratesId: null, address: null, consultations: c.consultations.map((x) => ({ ...x, notes: null })) });
    return;
  }
  const live = invoices.filter((i) => i.kind === 'INVOICE' && i.status !== 'VOID');
  const billed = live.reduce((s, i) => s + Number(i.total), 0);
  const credits = invoices.filter((i) => i.kind === 'CREDIT_NOTE').reduce((s, i) => s + Number(i.total), 0);
  const paid = live.reduce((s, i) => s + Number(i.paid), 0);
  res.json({
    ...c, invoices, appointments, messages,
    summary: {
      lifetimeValue: billed + credits, paid, balanceDue: Math.max(0, live.reduce((s, i) => s + Number(i.total) - Number(i.paid), 0)),
      completedSessions: appointments.filter((a) => a.status === 'COMPLETED').length,
      upcoming: appointments.filter((a) => a.startAt > new Date() && ['SCHEDULED', 'CONFIRMED'].includes(a.status)).length,
      noShows: appointments.filter((a) => a.status === 'NO_SHOW').length,
    },
  });
});

const num = z.number().positive().optional().nullable();
r.post('/clients/:id/measurements', requireRole('DOCTOR', 'MANAGER', 'RECEPTION', 'THERAPIST'), async (req, res) => {
  await ownClient(req.auth.tenantId, String(req.params.id));
  const b = z.object({
    weightKg: num, heightCm: num, bodyFatPct: num, muscleMassKg: num, visceralFat: num, bodyWaterPct: num, bmrKcal: num, metabolicAge: num,
    waistCm: num, hipCm: num, chestCm: num, armCm: num, thighCm: num, abdomenCm: num, notes: opt, source: z.enum(['MANUAL', 'ANALYZER']).optional(),
    recordedAt: z.coerce.date().optional(),
  }).parse(req.body);
  const m = await prisma.measurement.create({ data: { ...b, tenantId: req.auth.tenantId, clientId: String(req.params.id) } });
  await audit(req, 'measurement.create', 'Measurement', m.id, { clientId: m.clientId });
  res.status(201).json(m);
});

/**
 * Body composition analyzer import (e.g. InBody / Tanita CSV export rows already mapped to our fields).
 * Each row is matched to a client by clientNo or mobile.
 */
r.post('/measurements/import', requireRole('DOCTOR', 'MANAGER', 'RECEPTION'), async (req, res) => {
  const rows = z.array(z.object({
    clientNo: z.string().optional(), mobile: z.string().optional(), recordedAt: z.coerce.date().optional(),
    weightKg: num, heightCm: num, bodyFatPct: num, muscleMassKg: num, visceralFat: num, bodyWaterPct: num, bmrKcal: num, metabolicAge: num,
  })).max(1000).parse(req.body.rows);
  let imported = 0;
  const skipped: string[] = [];
  for (const { clientNo, mobile, ...m } of rows) {
    const c = await prisma.client.findFirst({ where: { tenantId: req.auth.tenantId, OR: [...(clientNo ? [{ clientNo }] : []), ...(mobile ? [{ mobile }] : [])] } });
    if (!c) { skipped.push(clientNo ?? mobile ?? '?'); continue; }
    await prisma.measurement.create({ data: { ...m, source: 'ANALYZER', tenantId: req.auth.tenantId, clientId: c.id } });
    imported++;
  }
  await audit(req, 'measurement.import', 'Measurement', undefined, { imported, skipped: skipped.length });
  res.json({ imported, skipped });
});

// Consultation sets the next 15-day (or per-client) review date and creates the follow-up task.
r.post('/clients/:id/consultations', requireRole('DOCTOR', 'MANAGER'), async (req, res) => {
  const client = await ownClient(req.auth.tenantId, String(req.params.id));
  const b = z.object({
    kind: z.enum(['INITIAL', 'REVIEW']).default('REVIEW'), complaint: opt, notes: opt, suitability: opt, plan: opt,
    reviewIntervalDays: z.number().int().min(1).max(365).optional(),
  }).parse(req.body);
  const days = b.reviewIntervalDays ?? client.reviewIntervalDays;
  const next = new Date(Date.now() + days * DAY);
  const { reviewIntervalDays: _, ...data } = b;
  const consultation = await prisma.$transaction(async (tx) => {
    const c = await tx.consultation.create({ data: { ...data, tenantId: req.auth.tenantId, clientId: client.id, doctorId: req.auth.userId, nextReviewDate: next } });
    await tx.client.update({ where: { id: client.id }, data: { reviewIntervalDays: days, nextReviewDate: next } });
    await tx.followUp.updateMany({ where: { clientId: client.id, tenantId: req.auth.tenantId, type: 'REVIEW', status: 'OPEN' }, data: { status: 'DONE', completedAt: new Date(), outcome: 'Review consultation completed' } });
    await tx.followUp.create({ data: { tenantId: req.auth.tenantId, clientId: client.id, type: 'REVIEW', dueDate: next, title: `${days}-day progress review`, assignedToId: req.auth.userId } });
    return c;
  });
  await audit(req, 'consultation.create', 'Consultation', consultation.id);
  res.status(201).json(consultation);
});

r.get('/clients/:id/packages', async (req, res) => {
  await ownClient(req.auth.tenantId, String(req.params.id));
  const [pkgs, reserved] = await Promise.all([
    prisma.clientPackage.findMany({
      where: { clientId: String(req.params.id), tenantId: req.auth.tenantId }, include: { items: { include: { treatment: true } } }, orderBy: { purchasedAt: 'desc' },
    }),
    prisma.appointment.groupBy({ by: ['clientPackageItemId'], where: { clientId: String(req.params.id), tenantId: req.auth.tenantId, status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] }, clientPackageItemId: { not: null } }, _count: true }),
  ]);
  const booked = new Map(reserved.map((x) => [x.clientPackageItemId, x._count]));
  res.json(pkgs.map((p) => ({
    ...p, items: p.items.map((i) => ({ ...i, booked: booked.get(i.id) ?? 0, remaining: i.totalSessions - i.usedSessions, bookable: i.totalSessions - i.usedSessions - (booked.get(i.id) ?? 0) })),
  })));
});

/** Manager-only: extend validity or freeze/cancel a package (auditable). */
r.patch('/packages/:id', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ expiresAt: z.coerce.date().optional(), status: z.enum(['ACTIVE', 'CANCELLED', 'EXPIRED']).optional(), reason: z.string().min(3) }).parse(req.body);
  const out = await prisma.clientPackage.updateMany({ where: { id: String(req.params.id), tenantId: req.auth.tenantId }, data: { expiresAt: b.expiresAt, status: b.status } });
  if (!out.count) throw new HttpError(404, 'Package not found');
  await audit(req, 'package.update', 'ClientPackage', String(req.params.id), b);
  res.json({ ok: true });
});

/** All sold packages with balances, for the Packages register and liability view. */
r.get('/client-packages', async (req, res) => {
  const q = z.object({ status: z.enum(['ACTIVE', 'EXPIRED', 'COMPLETED', 'CANCELLED']).optional(), expiringDays: z.coerce.number().int().optional() }).parse(req.query);
  const pkgs = await prisma.clientPackage.findMany({
    where: {
      tenantId: req.auth.tenantId, ...(q.status && { status: q.status }),
      ...(q.expiringDays !== undefined && { status: 'ACTIVE', expiresAt: { lte: new Date(Date.now() + q.expiringDays * DAY) } }),
    },
    include: { client: { select: { id: true, name: true, clientNo: true, mobile: true } }, items: { include: { treatment: { select: { name: true } } } } },
    orderBy: { purchasedAt: 'desc' }, take: 500,
  });
  res.json(pkgs.map((p) => {
    const total = p.items.reduce((s, i) => s + i.totalSessions, 0);
    const used = p.items.reduce((s, i) => s + i.usedSessions, 0);
    return { ...p, totalSessions: total, usedSessions: used, unfulfilledValue: total ? Math.round(Number(p.price) * (total - used) / total * 100) / 100 : 0 };
  }));
});

// ---- Documents: consent forms, before/after photos (stored in DB for the demo; move to encrypted object storage in prod) ----
r.post('/clients/:id/documents', requireRole('DOCTOR', 'MANAGER', 'RECEPTION'), async (req, res) => {
  const client = await ownClient(req.auth.tenantId, String(req.params.id));
  const b = z.object({ kind: z.nativeEnum(DocKind), title: z.string().min(1), fileName: z.string(), mime: z.string(), base64: z.string() }).parse(req.body);
  if ((b.kind === 'PHOTO_BEFORE' || b.kind === 'PHOTO_AFTER') && !client.photoConsent) throw new HttpError(409, 'Client has not given photo consent');
  const data = Buffer.from(b.base64, 'base64');
  if (data.length > 8 * 1024 * 1024) throw new HttpError(413, 'File too large (max 8 MB)');
  const d = await prisma.document.create({ data: { tenantId: req.auth.tenantId, clientId: client.id, kind: b.kind, title: b.title, fileName: b.fileName, mime: b.mime, size: data.length, data, uploadedBy: req.auth.userId } });
  if (b.kind === 'CONSENT' && !client.consentSigned) await prisma.client.update({ where: { id: client.id }, data: { consentSigned: true, consentSignedAt: new Date() } });
  await audit(req, 'document.upload', 'Document', d.id, { clientId: client.id, kind: b.kind });
  res.status(201).json({ id: d.id });
});

r.get('/documents/:id', async (req, res) => {
  const d = await prisma.document.findFirst({ where: { id: String(req.params.id), tenantId: req.auth.tenantId } });
  if (!d) throw new HttpError(404, 'Document not found');
  await audit(req, 'document.view', 'Document', d.id);
  res.setHeader('Content-Type', d.mime);
  res.setHeader('Content-Disposition', `inline; filename="${d.fileName.replace(/"/g, '')}"`);
  res.send(Buffer.from(d.data));
});

r.delete('/documents/:id', requireRole('MANAGER'), async (req, res) => {
  const out = await prisma.document.deleteMany({ where: { id: String(req.params.id), tenantId: req.auth.tenantId } });
  if (!out.count) throw new HttpError(404, 'Document not found');
  await audit(req, 'document.delete', 'Document', String(req.params.id));
  res.json({ ok: true });
});

/** Chronological activity for the client (audit trail filtered to this client). */
r.get('/clients/:id/timeline', async (req, res) => {
  const c = await ownClient(req.auth.tenantId, String(req.params.id));
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: req.auth.tenantId, OR: [{ entityId: c.id }, { details: { path: ['clientId'], equals: c.id } }] },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  const users = await prisma.user.findMany({ where: { tenantId: req.auth.tenantId }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  res.json(logs.map((l) => ({ ...l, user: l.userId ? name.get(l.userId) : null })));
});

export default r;
