import { Router } from 'express';
import { z } from 'zod';
import { AppointmentStatus, ResourceKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { completeAppointment, createAppointment, nextAvailableSlots, rescheduleAppointment, suggestResources } from '../services/scheduling';

const r = Router();
const include = {
  client: { select: { id: true, name: true, clientNo: true, mobile: true, vip: true } },
  treatment: { select: { id: true, name: true, color: true, durationMin: true } },
  machine: { select: { id: true, code: true } }, room: { select: { id: true, name: true } },
  therapist: { select: { id: true, name: true, color: true } },
  packageItem: { select: { id: true, totalSessions: true, usedSessions: true, clientPackage: { select: { name: true } } } },
};

r.post('/appointments', requireRole('RECEPTION', 'MANAGER', 'DOCTOR'), async (req, res) => {
  const b = z.object({
    clientId: z.string(), treatmentId: z.string(), therapistId: z.string().optional(), machineId: z.string().optional(), roomId: z.string().optional(),
    startAt: z.coerce.date(), clientPackageItemId: z.string().optional(), notes: z.string().optional(), status: z.enum(['SCHEDULED', 'CONFIRMED']).optional(),
  }).parse(req.body);
  const a = await createAppointment(req.auth.tenantId, b);
  await audit(req, 'appointment.create', 'Appointment', a.id, { startAt: a.startAt });
  res.status(201).json(a);
});

// Powers list/day/week/month calendar views; filter by therapist, room, machine, treatment, status, client.
r.get('/appointments', async (req, res) => {
  const q = z.object({
    from: z.coerce.date().optional(), to: z.coerce.date().optional(), therapistId: z.string().optional(),
    machineId: z.string().optional(), roomId: z.string().optional(), treatmentId: z.string().optional(), clientId: z.string().optional(),
    status: z.nativeEnum(AppointmentStatus).optional(), q: z.string().optional(),
  }).parse(req.query);
  const { from, to, q: search, ...filters } = q;
  res.json(await prisma.appointment.findMany({
    where: {
      tenantId: req.auth.tenantId, ...filters,
      ...((from || to) && { startAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
      ...(search && { client: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { mobile: { contains: search } }, { clientNo: { contains: search, mode: 'insensitive' } }] } }),
      ...(req.auth.role === 'THERAPIST' && { therapistId: req.auth.userId }),
    },
    include, orderBy: { startAt: 'asc' }, take: 1000,
  }));
});

r.get('/appointments/suggest', async (req, res) => {
  const q = z.object({ treatmentId: z.string(), startAt: z.coerce.date(), excludeId: z.string().optional() }).parse(req.query);
  const s = await suggestResources(prisma, req.auth.tenantId, q.treatmentId, q.startAt, q.excludeId);
  res.json({ ...s, treatment: { id: s.treatment.id, name: s.treatment.name, durationMin: s.treatment.durationMin, bufferMin: s.treatment.bufferMin } });
});

r.get('/appointments/next-slots', async (req, res) => {
  const q = z.object({ treatmentId: z.string(), from: z.coerce.date().optional(), therapistId: z.string().optional(), count: z.coerce.number().int().min(1).max(20).default(8) }).parse(req.query);
  res.json(await nextAvailableSlots(req.auth.tenantId, q.treatmentId, q.from ?? new Date(), q.count, q.therapistId));
});

/** Everything the resource calendar needs for a date range in one call. */
r.get('/scheduler', async (req, res) => {
  const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
  const t = req.auth.tenantId;
  const [tenant, therapists, machines, rooms, appointments, blocks] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: t }, select: { openMin: true, closeMin: true, slotMin: true } }),
    // Practitioners = anyone qualified for at least one treatment (therapists + the consulting doctor).
    prisma.user.findMany({ where: { tenantId: t, active: true, skills: { some: {} } }, select: { id: true, name: true, designation: true, color: true, gender: true, role: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    prisma.machine.findMany({ where: { tenantId: t }, select: { id: true, code: true, status: true, type: { select: { name: true } }, room: { select: { name: true } } }, orderBy: { code: 'asc' } }),
    prisma.room.findMany({ where: { tenantId: t, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.appointment.findMany({
      where: { tenantId: t, startAt: { lt: q.to }, endAt: { gt: q.from }, ...(req.auth.role === 'THERAPIST' && { therapistId: req.auth.userId }) },
      include, orderBy: { startAt: 'asc' },
    }),
    prisma.resourceBlock.findMany({ where: { tenantId: t, startAt: { lt: q.to }, endAt: { gt: q.from } } }),
  ]);
  res.json({ hours: tenant, therapists, machines, rooms, appointments, blocks });
});

r.get('/appointments/:id', async (req, res) => {
  const a = await prisma.appointment.findFirst({ where: { id: String(req.params.id), tenantId: req.auth.tenantId }, include: {
    ...include, session: true,
    invoices: { where: { kind: 'INVOICE', status: { not: 'VOID' } }, select: { id: true, number: true, status: true, total: true } },
  } });
  if (!a) throw new HttpError(404, 'Appointment not found');
  res.json(a);
});

r.patch('/appointments/:id', requireRole('RECEPTION', 'MANAGER'), async (req, res) => {
  const b = z.object({ startAt: z.coerce.date().optional(), therapistId: z.string().optional(), machineId: z.string().optional(), roomId: z.string().optional(), notes: z.string().optional() }).parse(req.body);
  const { notes, ...patch } = b;
  const a = Object.keys(patch).length ? await rescheduleAppointment(req.auth.tenantId, String(req.params.id), patch) : null;
  if (notes !== undefined) await prisma.appointment.updateMany({ where: { id: String(req.params.id), tenantId: req.auth.tenantId }, data: { notes } });
  await audit(req, 'appointment.reschedule', 'Appointment', String(req.params.id), b);
  res.json(a ?? { ok: true });
});

r.patch('/appointments/:id/status', requireRole('RECEPTION', 'MANAGER', 'THERAPIST'), async (req, res) => {
  const b = z.object({ status: z.nativeEnum(AppointmentStatus).refine((s) => s !== 'COMPLETED', 'Use /complete to complete a session'), reason: z.string().optional() }).parse(req.body);
  const out = await prisma.appointment.updateMany({
    where: { id: String(req.params.id), tenantId: req.auth.tenantId, status: { not: 'COMPLETED' }, ...(req.auth.role === 'THERAPIST' && { therapistId: req.auth.userId }) },
    data: { status: b.status },
  });
  if (!out.count) throw new HttpError(404, 'Appointment not found or already completed');
  await audit(req, 'appointment.status', 'Appointment', String(req.params.id), b);
  res.json({ ok: true });
});

// Delivery confirmation: actual time, therapist, machine, notes. Deducts one session from that treatment's balance.
r.post('/appointments/:id/complete', requireRole('THERAPIST', 'MANAGER', 'RECEPTION'), async (req, res) => {
  const b = z.object({
    confirm: z.literal(true), actualStart: z.coerce.date().optional(), actualEnd: z.coerce.date().optional(),
    machineId: z.string().optional(), therapistId: z.string().optional(), notes: z.string().optional(),
  }).parse(req.body);
  const out = await completeAppointment(req.auth, String(req.params.id), b);
  await audit(req, 'session.complete', 'Appointment', String(req.params.id), { remaining: out.remaining, notes: b.notes });
  res.json(out);
});

// ---- Resource downtime (maintenance, cleaning, leave, closures) ----
r.get('/blocks', async (req, res) => {
  const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), resourceId: z.string().optional() }).parse(req.query);
  res.json(await prisma.resourceBlock.findMany({
    where: { tenantId: req.auth.tenantId, ...(q.resourceId && { resourceId: q.resourceId }), ...(q.from && { endAt: { gt: q.from } }), ...(q.to && { startAt: { lt: q.to } }) },
    orderBy: { startAt: 'desc' }, take: 200,
  }));
});

r.post('/blocks', requireRole('MANAGER', 'RECEPTION'), async (req, res) => {
  const b = z.object({ kind: z.nativeEnum(ResourceKind), resourceId: z.string(), startAt: z.coerce.date(), endAt: z.coerce.date(), reason: z.string().min(1) })
    .refine((v) => v.endAt > v.startAt, 'End must be after start').parse(req.body);
  const t = req.auth.tenantId;
  const exists = b.kind === 'MACHINE' ? await prisma.machine.count({ where: { id: b.resourceId, tenantId: t } })
    : b.kind === 'ROOM' ? await prisma.room.count({ where: { id: b.resourceId, tenantId: t } })
    : await prisma.user.count({ where: { id: b.resourceId, tenantId: t } });
  if (!exists) throw new HttpError(404, 'Resource not found');
  const field = b.kind === 'MACHINE' ? 'machineId' : b.kind === 'ROOM' ? 'roomId' : 'therapistId';
  const clashes = await prisma.appointment.count({ where: { tenantId: t, [field]: b.resourceId, status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] }, startAt: { lt: b.endAt }, endAt: { gt: b.startAt } } });
  if (clashes) throw new HttpError(409, `${clashes} live appointment(s) already use this resource in that period — reschedule them first`);
  const blk = await prisma.resourceBlock.create({ data: { ...b, tenantId: t } });
  await audit(req, 'block.create', 'ResourceBlock', blk.id, b);
  res.status(201).json(blk);
});

r.delete('/blocks/:id', requireRole('MANAGER', 'RECEPTION'), async (req, res) => {
  const out = await prisma.resourceBlock.deleteMany({ where: { id: String(req.params.id), tenantId: req.auth.tenantId } });
  if (!out.count) throw new HttpError(404, 'Block not found');
  await audit(req, 'block.delete', 'ResourceBlock', String(req.params.id));
  res.json({ ok: true });
});

export default r;
