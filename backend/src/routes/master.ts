import { Router } from 'express';
import { z } from 'zod';
import { MachineStatus, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';

const r = Router();
const tenant = (req: { auth: { tenantId: string } }) => ({ tenantId: req.auth.tenantId });
const opt = z.string().trim().optional().nullable();

// ---- Centre settings ----
r.get('/settings', async (req, res) => {
  const { clientSeq, invoiceSeq, creditSeq, receiptSeq, ...t } = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth.tenantId } });
  res.json(t);
});

r.patch('/settings', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({
    name: z.string().min(2).optional(), trn: opt, address: opt, phone: opt, email: opt, vatRate: z.number().min(0).max(100).optional(),
    openMin: z.number().int().min(0).max(1440).optional(), closeMin: z.number().int().min(0).max(1440).optional(),
    slotMin: z.number().int().refine((v) => [5, 10, 15, 20, 30].includes(v)).optional(), invoicePrefix: z.string().min(1).max(8).optional(),
  }).parse(req.body);
  const t = await prisma.tenant.update({ where: { id: req.auth.tenantId }, data: b });
  await audit(req, 'settings.update', 'Tenant', t.id, b);
  res.json({ ok: true });
});

// ---- Treatments / services catalogue ----
r.get('/treatments', async (req, res) =>
  res.json(await prisma.treatment.findMany({ where: tenant(req), include: { machineType: true, skills: { select: { userId: true } } }, orderBy: [{ category: 'asc' }, { name: 'asc' }] })));
r.get('/machine-types', async (req, res) => res.json(await prisma.machineType.findMany({ where: tenant(req), include: { _count: { select: { machines: true } } }, orderBy: { name: 'asc' } })));

const treatmentBody = z.object({
  name: z.string().min(1), code: opt, category: z.string().min(1).default('Body Contouring'), description: opt, color: opt, machineTypeId: z.string().optional().nullable(),
  durationMin: z.number().int().positive(), bufferMin: z.number().int().min(0).default(10), price: z.number().min(0).default(0),
  taxCategory: z.enum(['STANDARD', 'ZERO', 'EXEMPT']).default('STANDARD'), active: z.boolean().optional(),
  skills: z.array(z.string()).optional(), // qualified staff (user ids)
});
async function checkStaff(tenantId: string, ids?: string[]) {
  if (ids?.length && (await prisma.user.count({ where: { tenantId, id: { in: ids } } })) !== new Set(ids).size) throw new HttpError(400, 'Unknown staff member');
}
r.post('/treatments', requireRole('MANAGER'), async (req, res) => {
  const { skills, ...b } = treatmentBody.parse(req.body);
  await checkStaff(req.auth.tenantId, skills);
  if (await prisma.treatment.findFirst({ where: { ...tenant(req), name: b.name } })) throw new HttpError(409, 'A treatment with this name already exists');
  const t = await prisma.treatment.create({ data: { ...b, tenantId: req.auth.tenantId, skills: skills && { create: [...new Set(skills)].map((userId) => ({ userId })) } } });
  await audit(req, 'treatment.create', 'Treatment', t.id);
  res.status(201).json(t);
});
r.patch('/treatments/:id', requireRole('MANAGER'), async (req, res) => {
  const { skills, ...b } = treatmentBody.partial().parse(req.body);
  const t = await prisma.treatment.findFirst({ where: { id: String(req.params.id), ...tenant(req) } });
  if (!t) throw new HttpError(404, 'Treatment not found');
  await checkStaff(req.auth.tenantId, skills);
  await prisma.$transaction(async (tx) => {
    await tx.treatment.update({ where: { id: t.id }, data: b });
    if (skills) {
      await tx.therapistSkill.deleteMany({ where: { treatmentId: t.id } });
      await tx.therapistSkill.createMany({ data: [...new Set(skills)].map((userId) => ({ userId, treatmentId: t.id })) });
    }
  });
  await audit(req, 'treatment.update', 'Treatment', t.id, { ...b, skills });
  res.json({ ok: true });
});

// Only a treatment that was never booked, sold or packaged can be deleted; otherwise deactivate it to keep history intact.
r.delete('/treatments/:id', requireRole('MANAGER'), async (req, res) => {
  const t = await prisma.treatment.findFirst({ where: { id: String(req.params.id), ...tenant(req) }, include: { _count: { select: { appointments: true, packageItems: true, templateItems: true } } } });
  if (!t) throw new HttpError(404, 'Treatment not found');
  if (t._count.appointments || t._count.packageItems || t._count.templateItems) throw new HttpError(409, 'This treatment has bookings or packages — deactivate it instead');
  await prisma.$transaction([prisma.therapistSkill.deleteMany({ where: { treatmentId: t.id } }), prisma.treatment.delete({ where: { id: t.id } })]);
  await audit(req, 'treatment.delete', 'Treatment', t.id, { name: t.name });
  res.json({ ok: true });
});

r.post('/machine-types', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1) }).parse(req.body);
  if (await prisma.machineType.findFirst({ where: { ...tenant(req), name: b.name } })) throw new HttpError(409, 'Machine type already exists');
  const m = await prisma.machineType.create({ data: { ...b, tenantId: req.auth.tenantId } });
  await audit(req, 'machine-type.create', 'MachineType', m.id);
  res.status(201).json(m);
});

// ---- Machines & rooms ----
r.get('/machines', async (req, res) => res.json(await prisma.machine.findMany({ where: tenant(req), include: { type: true, room: true }, orderBy: { code: 'asc' } })));
r.get('/rooms', async (req, res) => res.json(await prisma.room.findMany({ where: tenant(req), include: { machines: { select: { code: true } } }, orderBy: { name: 'asc' } })));

const machineBody = z.object({
  code: z.string().min(1), machineTypeId: z.string(), roomId: z.string().optional().nullable(), serialNo: opt, brand: opt, notes: opt,
  installedAt: z.coerce.date().optional().nullable(), lastServiceAt: z.coerce.date().optional().nullable(), nextServiceAt: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(MachineStatus).optional(),
});
r.post('/machines', requireRole('MANAGER'), async (req, res) => {
  const b = machineBody.parse(req.body);
  const branch = await prisma.branch.findFirstOrThrow({ where: tenant(req) });
  const m = await prisma.machine.create({ data: { ...b, tenantId: req.auth.tenantId, branchId: branch.id } });
  await audit(req, 'machine.create', 'Machine', m.id);
  res.status(201).json(m);
});
r.patch('/machines/:id', requireRole('MANAGER'), async (req, res) => {
  const b = machineBody.partial().parse(req.body);
  const out = await prisma.machine.updateMany({ where: { id: String(req.params.id), ...tenant(req) }, data: b });
  if (!out.count) throw new HttpError(404, 'Machine not found');
  await audit(req, 'machine.update', 'Machine', String(req.params.id), b);
  res.json({ ok: true });
});
r.patch('/machines/:id/status', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ status: z.nativeEnum(MachineStatus) }).parse(req.body);
  const out = await prisma.machine.updateMany({ where: { id: String(req.params.id), ...tenant(req) }, data: { status: b.status } });
  if (!out.count) throw new HttpError(404, 'Machine not found');
  await audit(req, 'machine.status', 'Machine', String(req.params.id), b);
  res.json({ ok: true });
});

r.post('/rooms', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ name: z.string().min(1) }).parse(req.body);
  const branch = await prisma.branch.findFirstOrThrow({ where: tenant(req) });
  const room = await prisma.room.create({ data: { ...b, tenantId: req.auth.tenantId, branchId: branch.id } });
  await audit(req, 'room.create', 'Room', room.id);
  res.status(201).json(room);
});
r.patch('/rooms/:id', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).parse(req.body);
  const out = await prisma.room.updateMany({ where: { id: String(req.params.id), ...tenant(req) }, data: b });
  if (!out.count) throw new HttpError(404, 'Room not found');
  await audit(req, 'room.update', 'Room', String(req.params.id), b);
  res.json({ ok: true });
});

// ---- Staff, roles & therapist qualifications ----
r.get('/staff', async (req, res) =>
  res.json(await prisma.user.findMany({
    where: tenant(req),
    select: { id: true, name: true, email: true, phone: true, designation: true, gender: true, color: true, commissionPct: true, role: true, active: true, lastLoginAt: true, skills: { select: { treatmentId: true } } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })));

const staffBody = z.object({
  name: z.string().min(1), email: z.string().email(), phone: opt, role: z.nativeEnum(Role), designation: opt, gender: opt, color: opt,
  commissionPct: z.number().min(0).max(100).optional().nullable(), skills: z.array(z.string()).optional(),
});
r.post('/staff', requireRole('MANAGER'), async (req, res) => {
  const b = staffBody.extend({ password: z.string().min(8) }).parse(req.body);
  if (b.role === 'SUPER_ADMIN' && req.auth.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Only a super admin can create super admins');
  if (await prisma.user.findUnique({ where: { tenantId_email: { tenantId: req.auth.tenantId, email: b.email } } }))
    throw new HttpError(409, 'Email already in use');
  const { password, skills, ...data } = b;
  const u = await prisma.user.create({
    data: { ...data, tenantId: req.auth.tenantId, passwordHash: await bcrypt.hash(password, 12), skills: skills && { create: skills.map((treatmentId) => ({ treatmentId })) } },
    select: { id: true },
  });
  await audit(req, 'staff.create', 'User', u.id, { role: b.role });
  res.status(201).json(u);
});
r.patch('/staff/:id', requireRole('MANAGER'), async (req, res) => {
  const b = staffBody.partial().extend({ password: z.string().min(8).optional(), active: z.boolean().optional() }).parse(req.body);
  const u = await prisma.user.findFirst({ where: { id: String(req.params.id), ...tenant(req) } });
  if (!u) throw new HttpError(404, 'Staff not found');
  if ((b.role === 'SUPER_ADMIN' || u.role === 'SUPER_ADMIN') && req.auth.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Only a super admin can change super admins');
  const { password, skills, ...data } = b;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { ...data, ...(password && { passwordHash: await bcrypt.hash(password, 12) }) } });
    if (skills) {
      await tx.therapistSkill.deleteMany({ where: { userId: u.id } });
      await tx.therapistSkill.createMany({ data: skills.map((treatmentId) => ({ userId: u.id, treatmentId })) });
    }
  });
  await audit(req, 'staff.update', 'User', u.id, { ...data, passwordChanged: !!password, skills });
  res.json({ ok: true });
});
r.patch('/staff/:id/active', requireRole('MANAGER'), async (req, res) => {
  const b = z.object({ active: z.boolean() }).parse(req.body);
  const out = await prisma.user.updateMany({ where: { id: String(req.params.id), ...tenant(req) }, data: { active: b.active } });
  if (!out.count) throw new HttpError(404, 'Staff not found');
  await audit(req, 'staff.active', 'User', String(req.params.id), b);
  res.json({ ok: true });
});

// ---- Package catalogue ----
r.get('/package-templates', async (req, res) =>
  res.json(await prisma.packageTemplate.findMany({
    where: tenant(req), include: { items: { include: { treatment: true } }, _count: { select: { clientPackages: true } } }, orderBy: { name: 'asc' },
  })));

// Mixed packages: one item per treatment => independent balances (e.g. 4 Cryo + 4 Endospheres + 2 Onda Pro).
const templateBody = z.object({
  name: z.string().min(1), description: opt, price: z.number().min(0), validityDays: z.number().int().positive().default(90), active: z.boolean().optional(),
  items: z.array(z.object({ treatmentId: z.string(), sessions: z.number().int().positive() })).min(1),
});
async function checkItems(tenantId: string, items: { treatmentId: string }[]) {
  const ids = new Set(items.map((i) => i.treatmentId));
  if (ids.size !== items.length) throw new HttpError(400, 'Each treatment can appear only once — increase its sessions instead');
  const owned = await prisma.treatment.count({ where: { tenantId, id: { in: [...ids] } } });
  if (owned !== ids.size) throw new HttpError(400, 'Unknown treatment in items');
}
r.post('/package-templates', requireRole('MANAGER'), async (req, res) => {
  const b = templateBody.parse(req.body);
  await checkItems(req.auth.tenantId, b.items);
  const t = await prisma.packageTemplate.create({ data: { ...b, tenantId: req.auth.tenantId, items: { create: b.items } }, include: { items: true } });
  await audit(req, 'package-template.create', 'PackageTemplate', t.id);
  res.status(201).json(t);
});
// Editing a template never changes packages already sold (they hold their own copy of items/price).
r.patch('/package-templates/:id', requireRole('MANAGER'), async (req, res) => {
  const b = templateBody.partial().parse(req.body);
  const t = await prisma.packageTemplate.findFirst({ where: { id: String(req.params.id), ...tenant(req) } });
  if (!t) throw new HttpError(404, 'Package not found');
  if (b.items) await checkItems(req.auth.tenantId, b.items);
  const { items, ...data } = b;
  await prisma.$transaction(async (tx) => {
    await tx.packageTemplate.update({ where: { id: t.id }, data });
    if (items) {
      await tx.packageTemplateItem.deleteMany({ where: { templateId: t.id } });
      await tx.packageTemplateItem.createMany({ data: items.map((i) => ({ ...i, templateId: t.id })) });
    }
  });
  await audit(req, 'package-template.update', 'PackageTemplate', t.id, b);
  res.json({ ok: true });
});

// ---- Audit log ----
r.get('/audit', requireRole('MANAGER'), async (req, res) => {
  const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), entity: z.string().optional(), userId: z.string().optional(), action: z.string().optional() }).parse(req.query);
  const [logs, users] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...tenant(req), ...(q.entity && { entity: q.entity }), ...(q.userId && { userId: q.userId }), ...(q.action && { action: { contains: q.action } }),
        ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) } }),
      },
      orderBy: { createdAt: 'desc' }, take: 500,
    }),
    prisma.user.findMany({ where: tenant(req), select: { id: true, name: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  res.json(logs.map((l) => ({ ...l, user: l.userId ? name.get(l.userId) ?? '—' : 'System' })));
});

/** Global search box in the top bar. */
r.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) { res.json({ clients: [], invoices: [] }); return; }
  const [clients, invoices] = await Promise.all([
    prisma.client.findMany({
      where: { ...tenant(req), OR: [{ name: { contains: q, mode: 'insensitive' } }, { mobile: { contains: q } }, { clientNo: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, clientNo: true, mobile: true }, take: 8,
    }),
    ['THERAPIST', 'DOCTOR'].includes(req.auth.role) ? [] : prisma.invoice.findMany({
      where: { ...tenant(req), number: { contains: q, mode: 'insensitive' } }, select: { id: true, number: true, total: true, client: { select: { name: true } } }, take: 5,
    }),
  ]);
  res.json({ clients, invoices });
});

export default r;
