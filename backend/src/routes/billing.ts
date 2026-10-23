import { Router } from 'express';
import { z } from 'zod';
import { InvoiceKind, InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { createCreditNote, createInvoice, recordPayment } from '../services/billing';

const r = Router();
const BILLERS = ['RECEPTION', 'MANAGER', 'ACCOUNTANT'] as const;
const METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'TABBY', 'TAMARA', 'CHEQUE'] as const;

r.post('/invoices', requireRole(...BILLERS), async (req, res) => {
  const b = z.object({
    clientId: z.string(), appointmentId: z.string().optional(), notes: z.string().optional(), dueDate: z.coerce.date().optional(),
    items: z.array(z.object({
      kind: z.enum(['PACKAGE', 'SERVICE', 'PRODUCT', 'OTHER']), packageTemplateId: z.string().optional(), treatmentId: z.string().optional(),
      description: z.string().optional(), qty: z.number().int().min(1).default(1), unitPrice: z.number().min(0).optional(),
      discount: z.number().min(0).optional(), taxCategory: z.enum(['STANDARD', 'ZERO', 'EXEMPT']).optional(),
    })).min(1),
    payment: z.object({ amount: z.number().positive(), method: z.enum(METHODS), reference: z.string().optional() }).optional(),
  }).parse(req.body);
  const inv = await createInvoice(req.auth.tenantId, req.auth.userId, b);
  await audit(req, 'invoice.create', 'Invoice', inv.id, { clientId: b.clientId, appointmentId: b.appointmentId, number: inv.number, total: Number(inv.total) });
  res.status(201).json(inv);
});

r.get('/invoices', requireRole(...BILLERS), async (req, res) => {
  const q = z.object({
    from: z.coerce.date().optional(), to: z.coerce.date().optional(), status: z.nativeEnum(InvoiceStatus).optional(), kind: z.nativeEnum(InvoiceKind).optional(),
    q: z.string().optional(), outstanding: z.coerce.boolean().optional(), clientId: z.string().optional(),
  }).parse(req.query);
  const where: Prisma.InvoiceWhereInput = {
    tenantId: req.auth.tenantId, ...(q.status && { status: q.status }), ...(q.kind && { kind: q.kind }), ...(q.clientId && { clientId: q.clientId }),
    ...((q.from || q.to) && { issuedAt: { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) } }),
    ...(q.outstanding && { kind: 'INVOICE', status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }),
    ...(q.q && { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { client: { name: { contains: q.q, mode: 'insensitive' } } }, { client: { mobile: { contains: q.q } } }] }),
  };
  res.json(await prisma.invoice.findMany({ where, include: { client: { select: { id: true, name: true, clientNo: true, mobile: true } } }, orderBy: { issuedAt: 'desc' }, take: 500 }));
});

r.get('/invoices/:id', requireRole(...BILLERS, 'DOCTOR'), async (req, res) => {
  const inv = await prisma.invoice.findFirst({
    where: { id: String(req.params.id), tenantId: req.auth.tenantId },
    include: { client: true, items: true, payments: { orderBy: { paidAt: 'asc' } } },
  });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const [tenant, credits, ref, createdBy] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: req.auth.tenantId }, select: { name: true, trn: true, address: true, phone: true, email: true, currency: true } }),
    prisma.invoice.findMany({ where: { refInvoiceId: inv.id, tenantId: req.auth.tenantId }, include: { payments: true } }),
    inv.refInvoiceId ? prisma.invoice.findFirst({ where: { id: inv.refInvoiceId }, select: { id: true, number: true } }) : null,
    inv.createdById ? prisma.user.findFirst({ where: { id: inv.createdById }, select: { name: true } }) : null,
  ]);
  const credited = credits.reduce((s, c) => s + Number(c.total), 0);
  const refunded = credits.flatMap((c) => c.payments).reduce((s, p) => s + Number(p.amount), 0);
  res.json({ ...inv, tenant, credits, ref, createdBy: createdBy?.name, balance: Math.round((Number(inv.total) + credited - Number(inv.paid) + refunded) * 100) / 100 });
});

r.post('/invoices/:id/payments', requireRole(...BILLERS), async (req, res) => {
  const b = z.object({ amount: z.number().positive(), method: z.enum(METHODS), reference: z.string().optional() }).parse(req.body);
  const p = await prisma.$transaction((tx) => recordPayment(tx, req.auth.tenantId, req.auth.userId, String(req.params.id), b));
  await audit(req, 'payment.create', 'Invoice', String(req.params.id), { ...b, receiptNo: p.receiptNo });
  res.status(201).json(p);
});

r.post('/invoices/:id/credit-note', requireRole('MANAGER', 'ACCOUNTANT'), async (req, res) => {
  const b = z.object({ amount: z.number().positive(), reason: z.string().min(3), refundMethod: z.enum(METHODS).optional(), cancelPackages: z.boolean().optional() }).parse(req.body);
  const cn = await createCreditNote(req.auth.tenantId, req.auth.userId, String(req.params.id), b);
  await audit(req, 'invoice.credit-note', 'Invoice', String(req.params.id), { ...b, number: cn.number });
  res.status(201).json(cn);
});

// Void is only allowed before any money moves; afterwards a credit note is the auditable route.
r.post('/invoices/:id/void', requireRole('MANAGER', 'ACCOUNTANT'), async (req, res) => {
  const b = z.object({ reason: z.string().min(3) }).parse(req.body);
  const inv = await prisma.invoice.findFirst({ where: { id: String(req.params.id), tenantId: req.auth.tenantId } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (Number(inv.paid) > 0) throw new HttpError(409, 'Invoice has payments — issue a credit note instead');
  const used = await prisma.clientPackageItem.count({ where: { clientPackage: { invoiceId: inv.id }, usedSessions: { gt: 0 } } });
  if (used) throw new HttpError(409, 'Sessions from this invoice have already been delivered — issue a credit note instead');
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: inv.id }, data: { status: 'VOID', notes: `${inv.notes ? inv.notes + ' | ' : ''}VOID: ${b.reason}` } }),
    prisma.clientPackage.updateMany({ where: { invoiceId: inv.id }, data: { status: 'CANCELLED' } }),
  ]);
  await audit(req, 'invoice.void', 'Invoice', inv.id, { ...b, clientId: inv.clientId });
  res.json({ ok: true });
});

r.get('/payments', requireRole(...BILLERS), async (req, res) => {
  const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), method: z.string().optional() }).parse(req.query);
  res.json(await prisma.payment.findMany({
    where: { tenantId: req.auth.tenantId, ...(q.method && { method: q.method }), ...((q.from || q.to) && { paidAt: { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) } }) },
    include: { invoice: { select: { id: true, number: true, kind: true, client: { select: { id: true, name: true, clientNo: true } } } } },
    orderBy: { paidAt: 'desc' }, take: 500,
  }));
});

/** End-of-day cash-up: collections by method for a day. */
r.get('/day-book', requireRole(...BILLERS), async (req, res) => {
  const q = z.object({ date: z.coerce.date() }).parse(req.query);
  const from = new Date(q.date); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 86_400_000);
  const [payments, invoices] = await Promise.all([
    prisma.payment.findMany({ where: { tenantId: req.auth.tenantId, paidAt: { gte: from, lt: to } }, include: { invoice: { select: { number: true, client: { select: { name: true } } } } }, orderBy: { paidAt: 'asc' } }),
    prisma.invoice.findMany({ where: { tenantId: req.auth.tenantId, issuedAt: { gte: from, lt: to }, status: { not: 'VOID' } } }),
  ]);
  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount);
  res.json({
    payments, byMethod,
    invoiced: invoices.reduce((s, i) => s + Number(i.total), 0), vat: invoices.reduce((s, i) => s + Number(i.vatAmount), 0),
    collected: Object.values(byMethod).reduce((s, v) => s + v, 0),
  });
});

export default r;
