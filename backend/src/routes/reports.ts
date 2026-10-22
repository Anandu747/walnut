import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

const r = Router();
const DAY = 86_400_000;
const mins = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const LIVE = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const;
const range = z.object({ from: z.coerce.date(), to: z.coerce.date() });
const MGMT = ['MANAGER', 'ACCOUNTANT'] as const;

const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Sales (net of VAT, credit notes deducted), collections (payments − refunds) and delivered value in [from, to). */
async function money(tenantId: string, from: Date, to: Date) {
  const [inv, pays, delivered] = await Promise.all([
    prisma.invoice.aggregate({ where: { tenantId, issuedAt: { gte: from, lt: to }, status: { not: 'VOID' } }, _sum: { taxable: true, vatAmount: true, total: true } }),
    prisma.payment.groupBy({ by: ['kind'], where: { tenantId, paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.sessionRecord.aggregate({ where: { tenantId, actualStart: { gte: from, lt: to } }, _sum: { value: true }, _count: true }),
  ]);
  const paid = Number(pays.find((p) => p.kind === 'PAYMENT')?._sum.amount ?? 0);
  const refunds = Number(pays.find((p) => p.kind === 'REFUND')?._sum.amount ?? 0);
  return {
    sales: r2(Number(inv._sum.taxable ?? 0)), vat: r2(Number(inv._sum.vatAmount ?? 0)), gross: r2(Number(inv._sum.total ?? 0)),
    collections: r2(paid - refunds), refunds: r2(refunds), delivered: r2(Number(delivered._sum.value ?? 0)), sessions: delivered._count,
  };
}

/** Unfulfilled session value on active packages = cash received in advance for treatments not yet delivered. */
async function packageLiability(tenantId: string) {
  const pkgs = await prisma.clientPackage.findMany({ where: { tenantId, status: 'ACTIVE' }, include: { items: true, client: { select: { id: true, name: true, clientNo: true } } } });
  return pkgs.map((p) => {
    const total = p.items.reduce((s, i) => s + i.totalSessions, 0);
    const used = p.items.reduce((s, i) => s + i.usedSessions, 0);
    return { id: p.id, client: p.client, name: p.name, price: Number(p.price), totalSessions: total, usedSessions: used, remaining: total - used, expiresAt: p.expiresAt, value: total ? r2(Number(p.price) * (total - used) / total) : 0 };
  });
}

r.get('/reports/dashboard', async (req, res) => {
  const q = z.object({ period: z.enum(['week', 'month', 'year']).default('month') }).parse(req.query);
  const t = req.auth.tenantId;
  const now = new Date();
  const today = sod(now);
  let from: Date, prevFrom: Date;
  if (q.period === 'week') { from = new Date(today.getTime() - 6 * DAY); prevFrom = new Date(from.getTime() - 7 * DAY); }
  else if (q.period === 'month') { from = new Date(today.getFullYear(), today.getMonth(), 1); prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1); }
  else { from = new Date(today.getFullYear(), 0, 1); prevFrom = new Date(today.getFullYear() - 1, 0, 1); }
  const to = new Date(today.getTime() + DAY);
  // Compare like-for-like: the same number of elapsed days in the previous period.
  const prevTo = new Date(prevFrom.getTime() + (to.getTime() - from.getTime()));

  const [cur, prev, newClients, prevNewClients, todays, sessions, machines, blocks, therapists, liability, followDue, outstanding] = await Promise.all([
    money(t, from, to), money(t, prevFrom, prevTo),
    prisma.client.count({ where: { tenantId: t, createdAt: { gte: from, lt: to } } }),
    prisma.client.count({ where: { tenantId: t, createdAt: { gte: prevFrom, lt: prevTo } } }),
    prisma.appointment.findMany({ where: { tenantId: t, startAt: { gte: today, lt: new Date(today.getTime() + DAY) } }, select: { status: true } }),
    prisma.sessionRecord.findMany({ where: { tenantId: t, actualStart: { gte: from, lt: to } }, select: { therapistId: true, machineId: true, actualStart: true, actualEnd: true, value: true, appointment: { select: { treatment: { select: { name: true } } } } } }),
    prisma.machine.findMany({ where: { tenantId: t }, select: { id: true, code: true, type: { select: { name: true } } } }),
    prisma.resourceBlock.findMany({ where: { tenantId: t, kind: 'MACHINE', startAt: { lt: to }, endAt: { gt: from } } }),
    prisma.user.findMany({ where: { tenantId: t, role: 'THERAPIST', active: true }, select: { id: true, name: true, color: true } }),
    packageLiability(t),
    prisma.followUp.count({ where: { tenantId: t, type: 'REVIEW', status: 'OPEN', dueDate: { lt: new Date(today.getTime() + DAY) } } }),
    prisma.invoice.findMany({ where: { tenantId: t, kind: 'INVOICE', status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, select: { total: true, paid: true } }),
  ]);

  // Trend buckets: days for week/month, months for year.
  const [invs, pays] = await Promise.all([
    prisma.invoice.findMany({ where: { tenantId: t, issuedAt: { gte: from, lt: to }, status: { not: 'VOID' } }, select: { issuedAt: true, taxable: true } }),
    prisma.payment.findMany({ where: { tenantId: t, paidAt: { gte: from, lt: to } }, select: { paidAt: true, amount: true, kind: true } }),
  ]);
  const key = (d: Date) => q.period === 'year' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const buckets: { key: string; sales: number; collections: number; delivered: number }[] = [];
  if (q.period === 'year') for (let m = 0; m <= today.getMonth(); m++) buckets.push({ key: key(new Date(today.getFullYear(), m, 1)), sales: 0, collections: 0, delivered: 0 });
  else for (let d = new Date(from); d < to; d = new Date(d.getTime() + DAY)) buckets.push({ key: key(d), sales: 0, collections: 0, delivered: 0 });
  const bk = new Map(buckets.map((b) => [b.key, b]));
  for (const i of invs) { const b = bk.get(key(i.issuedAt)); if (b) b.sales += Number(i.taxable); }
  for (const p of pays) { const b = bk.get(key(p.paidAt)); if (b) b.collections += (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount); }
  for (const s of sessions) { const b = bk.get(key(s.actualStart)); if (b) b.delivered += Number(s.value); }
  buckets.forEach((b) => { b.sales = r2(b.sales); b.collections = r2(b.collections); b.delivered = r2(b.delivered); });

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: t } });
  const opMin = tenant.closeMin - tenant.openMin;
  const byType = new Map<string, { actual: number; available: number }>();
  for (const m of machines) {
    const down = blocks.filter((b) => b.resourceId === m.id).reduce((s, b) => s + Math.min(mins(b.startAt < from ? from : b.startAt, b.endAt > to ? to : b.endAt), opMin * days), 0);
    const actual = sessions.filter((s) => s.machineId === m.id).reduce((s, x) => s + mins(x.actualStart, x.actualEnd), 0);
    const v = byType.get(m.type.name) ?? { actual: 0, available: 0 };
    v.actual += actual; v.available += Math.max(0, days * opMin - down);
    byType.set(m.type.name, v);
  }
  const treatments = new Map<string, { sessions: number; value: number }>();
  for (const s of sessions) {
    const n = s.appointment.treatment.name;
    const v = treatments.get(n) ?? { sessions: 0, value: 0 };
    v.sessions++; v.value += Number(s.value);
    treatments.set(n, v);
  }

  // Front-desk and clinical roles get the operational picture only — no revenue figures.
  const finance = ['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(req.auth.role);
  const kpis = {
      ...cur, newClients, avgTicket: cur.sessions ? r2(cur.delivered / cur.sessions) : 0,
      prev: { ...prev, newClients: prevNewClients },
      outstanding: r2(outstanding.reduce((s, i) => s + Number(i.total) - Number(i.paid), 0)),
      liability: r2(liability.reduce((s, p) => s + p.value, 0)), activePackages: liability.length, pendingSessions: liability.reduce((s, p) => s + p.remaining, 0),
      followUpsDue: followDue,
  };
  res.json({
    period: q.period, from, to, prevFrom, prevTo,
    kpis: finance ? kpis : { sessions: cur.sessions, newClients, followUpsDue: followDue, prev: { sessions: prev.sessions, newClients: prevNewClients } },
    today: {
      total: todays.length,
      byStatus: todays.reduce<Record<string, number>>((m, a) => { m[a.status] = (m[a.status] ?? 0) + 1; return m; }, {}),
    },
    trend: finance ? buckets : [],
    therapists: therapists.map((th) => {
      const mine = sessions.filter((s) => s.therapistId === th.id);
      return { id: th.id, name: th.name, color: th.color, sessions: mine.length, minutes: mine.reduce((s, x) => s + mins(x.actualStart, x.actualEnd), 0), value: finance ? r2(mine.reduce((s, x) => s + Number(x.value), 0)) : 0 };
    }).sort((a, b) => b.sessions - a.sessions),
    machineTypes: [...byType.entries()].map(([name, v]) => ({ name, utilisationPct: pct(v.actual, v.available), actualMinutes: v.actual, availableMinutes: v.available })).sort((a, b) => b.utilisationPct - a.utilisationPct),
    topTreatments: !finance ? [] : [...treatments.entries()].map(([name, v]) => ({ name, ...v, value: r2(v.value) })).sort((a, b) => b.value - a.value).slice(0, 8),
  });
});

// Machine utilisation % = actual treatment minutes / available operating minutes x 100.
// Available minutes deduct maintenance / downtime blocks. Booked utilisation is shown separately from actual.
r.get('/reports/machine-utilisation', requireRole(...MGMT), async (req, res) => {
  const q = range.parse(req.query);
  const t = req.auth.tenantId;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: t } });
  const days = Math.max(1, Math.ceil((q.to.getTime() - q.from.getTime()) / DAY));
  const opMin = tenant.closeMin - tenant.openMin;
  const [machines, blocks] = await Promise.all([
    prisma.machine.findMany({
      where: { tenantId: t },
      include: { type: true, room: true, appointments: { where: { startAt: { gte: q.from, lt: q.to }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }, include: { session: true, treatment: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.resourceBlock.findMany({ where: { tenantId: t, kind: 'MACHINE', startAt: { lt: q.to }, endAt: { gt: q.from } } }),
  ]);
  res.json(machines.map((m) => {
    const down = Math.round(blocks.filter((b) => b.resourceId === m.id).reduce((s, b) => s + mins(b.startAt < q.from ? q.from : b.startAt, b.endAt > q.to ? q.to : b.endAt), 0));
    const available = Math.max(0, days * opMin - down);
    const booked = m.appointments.reduce((s, a) => s + a.treatment.durationMin, 0);
    const actual = m.appointments.reduce((s, a) => s + (a.session ? mins(a.session.actualStart, a.session.actualEnd) : 0), 0);
    return {
      code: m.code, type: m.type.name, room: m.room?.name ?? '—', status: m.status, availableMinutes: available, downtimeMinutes: down, bookedMinutes: booked, actualMinutes: actual,
      idleHours: r2((available - actual) / 60), sessions: m.appointments.filter((a) => a.session).length,
      bookedUtilisationPct: pct(booked, available), actualUtilisationPct: pct(actual, available),
    };
  }));
});

r.get('/reports/therapist-sessions', requireRole(...MGMT), async (req, res) => {
  const q = range.parse(req.query);
  const [sessions, staff, appts] = await Promise.all([
    prisma.sessionRecord.findMany({ where: { tenantId: req.auth.tenantId, actualStart: { gte: q.from, lt: q.to } } }),
    prisma.user.findMany({ where: { tenantId: req.auth.tenantId, role: 'THERAPIST' }, select: { id: true, name: true, designation: true, commissionPct: true } }),
    prisma.appointment.groupBy({ by: ['therapistId', 'status'], where: { tenantId: req.auth.tenantId, startAt: { gte: q.from, lt: q.to } }, _count: true }),
  ]);
  res.json(staff.map((s) => {
    const mine = sessions.filter((x) => x.therapistId === s.id);
    const value = mine.reduce((t, x) => t + Number(x.value), 0);
    const count = (st: string) => appts.find((a) => a.therapistId === s.id && a.status === st)?._count ?? 0;
    return {
      therapist: s.name, designation: s.designation, completedSessions: mine.length, treatmentMinutes: Math.round(mine.reduce((t, x) => t + mins(x.actualStart, x.actualEnd), 0)),
      avgMinutes: mine.length ? Math.round(mine.reduce((t, x) => t + mins(x.actualStart, x.actualEnd), 0) / mine.length) : 0,
      deliveredValue: r2(value), noShows: count('NO_SHOW'), cancelled: count('CANCELLED'),
      commission: r2(value * Number(s.commissionPct ?? 0) / 100),
    };
  }));
});

r.get('/reports/daily-appointments', async (req, res) => {
  const q = z.object({ date: z.coerce.date() }).parse(req.query);
  const from = sod(q.date);
  res.json(await prisma.appointment.findMany({
    where: { tenantId: req.auth.tenantId, startAt: { gte: from, lt: new Date(from.getTime() + DAY) } },
    include: { client: { select: { name: true, clientNo: true, mobile: true } }, treatment: { select: { name: true } }, therapist: { select: { name: true } }, machine: { select: { code: true } }, room: { select: { name: true } }, session: true },
    orderBy: { startAt: 'asc' },
  }));
});

r.get('/reports/package-liability', requireRole(...MGMT), async (req, res) => {
  const rows = await packageLiability(req.auth.tenantId);
  res.json({ rows: rows.sort((a, b) => b.value - a.value), total: r2(rows.reduce((s, p) => s + p.value, 0)), sessions: rows.reduce((s, p) => s + p.remaining, 0) });
});

r.get('/reports/package-expiry', async (req, res) => {
  const q = z.object({ days: z.coerce.number().int().min(0).max(365).default(30) }).parse(req.query);
  const rows = (await packageLiability(req.auth.tenantId)).filter((p) => p.remaining > 0 && p.expiresAt.getTime() <= Date.now() + q.days * DAY);
  res.json(rows.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime()));
});

r.get('/reports/sales-by-treatment', requireRole(...MGMT), async (req, res) => {
  const q = range.parse(req.query);
  const items = await prisma.invoiceItem.findMany({ where: { invoice: { tenantId: req.auth.tenantId, issuedAt: { gte: q.from, lt: q.to }, status: { not: 'VOID' } } } });
  const map = new Map<string, { item: string; kind: string; qty: number; gross: number; discount: number; net: number; vat: number; total: number }>();
  for (const i of items) {
    const k = `${i.kind}|${i.description}`;
    const v = map.get(k) ?? { item: i.description, kind: i.kind, qty: 0, gross: 0, discount: 0, net: 0, vat: 0, total: 0 };
    v.qty += i.qty; v.gross += Number(i.unitPrice) * i.qty; v.discount += Number(i.discount);
    v.net += Number(i.unitPrice) * i.qty - Number(i.discount); v.vat += Number(i.vatAmount); v.total += Number(i.lineTotal);
    map.set(k, v);
  }
  res.json([...map.values()].map((v) => ({ ...v, gross: r2(v.gross), discount: r2(v.discount), net: r2(v.net), vat: r2(v.vat), total: r2(v.total) })).sort((a, b) => b.net - a.net));
});

r.get('/reports/collections', requireRole(...MGMT), async (req, res) => {
  const q = range.parse(req.query);
  const pays = await prisma.payment.findMany({ where: { tenantId: req.auth.tenantId, paidAt: { gte: q.from, lt: q.to } }, include: { invoice: { select: { number: true, client: { select: { name: true } } } } }, orderBy: { paidAt: 'asc' } });
  const byMethod: Record<string, { method: string; payments: number; refunds: number; net: number; count: number }> = {};
  for (const p of pays) {
    const m = (byMethod[p.method] ??= { method: p.method, payments: 0, refunds: 0, net: 0, count: 0 });
    if (p.kind === 'REFUND') m.refunds += Number(p.amount); else m.payments += Number(p.amount);
    m.net = r2(m.payments - m.refunds); m.count++;
  }
  const outstanding = await prisma.invoice.findMany({ where: { tenantId: req.auth.tenantId, kind: 'INVOICE', status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, include: { client: { select: { name: true, clientNo: true } } }, orderBy: { issuedAt: 'asc' } });
  res.json({
    byMethod: Object.values(byMethod), payments: pays,
    outstanding: outstanding.map((i) => ({ id: i.id, number: i.number, client: i.client, issuedAt: i.issuedAt, total: Number(i.total), paid: Number(i.paid), balance: r2(Number(i.total) - Number(i.paid)), ageDays: Math.floor((Date.now() - i.issuedAt.getTime()) / DAY) })),
  });
});

/** VAT return helper: standard-rated, zero-rated and exempt supplies with output VAT, credit notes netted. */
r.get('/reports/vat', requireRole(...MGMT), async (req, res) => {
  const q = range.parse(req.query);
  const items = await prisma.invoiceItem.findMany({ where: { invoice: { tenantId: req.auth.tenantId, issuedAt: { gte: q.from, lt: q.to }, status: { not: 'VOID' } } }, include: { invoice: { select: { kind: true } } } });
  const rows = (['STANDARD', 'ZERO', 'EXEMPT'] as const).map((cat) => {
    const mine = items.filter((i) => i.taxCategory === cat);
    const net = mine.reduce((s, i) => s + Number(i.unitPrice) * i.qty - Number(i.discount), 0);
    const vat = mine.reduce((s, i) => s + Number(i.vatAmount), 0);
    return { category: cat === 'STANDARD' ? 'Standard rated (5%)' : cat === 'ZERO' ? 'Zero rated' : 'Exempt', net: r2(net), vat: r2(vat), gross: r2(net + vat), lines: mine.length };
  });
  const invoices = await prisma.invoice.findMany({ where: { tenantId: req.auth.tenantId, issuedAt: { gte: q.from, lt: q.to }, status: { not: 'VOID' } }, include: { client: { select: { name: true } } }, orderBy: { number: 'asc' } });
  res.json({ rows, totals: { net: r2(rows.reduce((s, x) => s + x.net, 0)), vat: r2(rows.reduce((s, x) => s + x.vat, 0)) }, invoices });
});

r.get('/reports/new-vs-returning', requireRole(...MGMT), async (req, res) => {
  const q = z.object({ months: z.coerce.number().int().min(1).max(24).default(12) }).parse(req.query);
  const start = new Date(new Date().getFullYear(), new Date().getMonth() - q.months + 1, 1);
  const [clients, appts] = await Promise.all([
    prisma.client.findMany({ where: { tenantId: req.auth.tenantId }, select: { id: true, createdAt: true } }),
    prisma.appointment.findMany({ where: { tenantId: req.auth.tenantId, status: 'COMPLETED', startAt: { gte: start } }, select: { clientId: true, startAt: true } }),
  ]);
  const created = new Map(clients.map((c) => [c.id, c.createdAt]));
  const out = [];
  for (let i = 0; i < q.months; i++) {
    const a = new Date(start.getFullYear(), start.getMonth() + i, 1), b = new Date(start.getFullYear(), start.getMonth() + i + 1, 1);
    const visitors = new Set(appts.filter((x) => x.startAt >= a && x.startAt < b).map((x) => x.clientId));
    const isNew = [...visitors].filter((id) => { const c = created.get(id)!; return c >= a && c < b; }).length;
    out.push({ month: `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`, newClients: clients.filter((c) => c.createdAt >= a && c.createdAt < b).length, newVisiting: isNew, returning: visitors.size - isNew, totalVisiting: visitors.size });
  }
  res.json(out);
});

/** Month-by-month this year vs the same month last year (sales, collections, delivered). */
r.get('/reports/yoy', requireRole(...MGMT), async (req, res) => {
  const q = z.object({ year: z.coerce.number().int().default(new Date().getFullYear()) }).parse(req.query);
  const out = [];
  for (let m = 0; m < 12; m++) {
    const [cur, prev] = await Promise.all([
      money(req.auth.tenantId, new Date(q.year, m, 1), new Date(q.year, m + 1, 1)),
      money(req.auth.tenantId, new Date(q.year - 1, m, 1), new Date(q.year - 1, m + 1, 1)),
    ]);
    out.push({ month: new Date(q.year, m, 1).toLocaleString('en', { month: 'short' }), sales: cur.sales, prevSales: prev.sales, collections: cur.collections, prevCollections: prev.collections, delivered: cur.delivered, prevDelivered: prev.delivered, growthPct: prev.sales ? r2((cur.sales - prev.sales) / prev.sales * 100) : null });
  }
  res.json(out);
});

r.get('/reports/followups', async (req, res) => {
  const rows = await prisma.followUp.findMany({
    where: { tenantId: req.auth.tenantId, status: 'OPEN', dueDate: { lt: new Date(sod(new Date()).getTime() + DAY) } },
    include: { client: { select: { name: true, clientNo: true, mobile: true } } }, orderBy: { dueDate: 'asc' },
  });
  res.json(rows.map((f) => ({ ...f, overdueDays: Math.max(0, Math.floor((sod(new Date()).getTime() - sod(f.dueDate).getTime()) / DAY)) })));
});

r.get('/reports/summary', requireRole(...MGMT), async (req, res) => {
  const q = range.parse(req.query);
  res.json(await money(req.auth.tenantId, q.from, q.to));
});

export { LIVE };
export default r;
