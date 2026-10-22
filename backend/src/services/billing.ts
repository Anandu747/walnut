import { Prisma, TaxCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http';

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Gap-free per-tenant sequence (row lock on the tenant). */
export async function nextSeq(tx: Tx, tenantId: string, field: 'clientSeq' | 'invoiceSeq' | 'creditSeq' | 'receiptSeq') {
  const t = await tx.tenant.update({ where: { id: tenantId }, data: { [field]: { increment: 1 } } });
  return { n: t[field], tenant: t };
}

export type LineInput = {
  kind: 'PACKAGE' | 'SERVICE' | 'PRODUCT' | 'OTHER';
  packageTemplateId?: string; treatmentId?: string; description?: string;
  qty: number; unitPrice?: number; discount?: number; taxCategory?: TaxCategory;
};

export type InvoiceInput = {
  clientId: string; items: LineInput[]; notes?: string; dueDate?: Date;
  payment?: { amount: number; method: string; reference?: string };
};

/**
 * Issues a UAE tax invoice. Package lines automatically create the client's package (with per-treatment balances),
 * so selling and assigning a package is a single step at the front desk.
 */
export async function createInvoice(tenantId: string, userId: string, input: InvoiceInput) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, tenantId } });
    if (!client) throw new HttpError(404, 'Client not found');
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const vat = Number(tenant.vatRate);

    const lines: (Prisma.InvoiceItemCreateWithoutInvoiceInput & { _template?: Awaited<ReturnType<typeof loadTemplate>> })[] = [];
    for (const l of input.items) {
      let description = l.description ?? '', unitPrice = l.unitPrice, taxCategory = l.taxCategory, template;
      if (l.kind === 'PACKAGE') {
        template = await loadTemplate(tx, tenantId, l.packageTemplateId);
        description ||= template.name;
        unitPrice ??= Number(template.price);
      } else if (l.treatmentId) {
        const t = await tx.treatment.findFirst({ where: { id: l.treatmentId, tenantId } });
        if (!t) throw new HttpError(404, 'Treatment not found');
        description ||= t.name;
        unitPrice ??= Number(t.price);
        taxCategory ??= t.taxCategory;
      }
      if (!description || unitPrice == null) throw new HttpError(400, 'Each line needs a description and price');
      const gross = r2(unitPrice * l.qty);
      const discount = r2(Math.min(l.discount ?? 0, gross));
      const rate = (taxCategory ?? 'STANDARD') === 'STANDARD' ? vat : 0;
      const taxable = gross - discount;
      const vatAmount = r2((taxable * rate) / 100);
      lines.push({
        kind: l.kind, description, treatmentId: l.treatmentId, packageTemplateId: l.packageTemplateId, qty: l.qty, unitPrice,
        discount, taxCategory: taxCategory ?? 'STANDARD', vatRate: rate, vatAmount, lineTotal: r2(taxable + vatAmount), _template: template,
      });
    }
    if (!lines.length) throw new HttpError(400, 'Invoice has no lines');

    const subtotal = r2(lines.reduce((s, l) => s + Number(l.unitPrice) * l.qty!, 0));
    const discount = r2(lines.reduce((s, l) => s + Number(l.discount), 0));
    const vatAmount = r2(lines.reduce((s, l) => s + Number(l.vatAmount), 0));
    const total = r2(subtotal - discount + vatAmount);
    const paid = r2(Math.min(input.payment?.amount ?? 0, total));

    const { n } = await nextSeq(tx, tenantId, 'invoiceSeq');
    const invoice = await tx.invoice.create({
      data: {
        tenantId, clientId: client.id, number: `${tenant.invoicePrefix}-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`,
        subtotal, discount, taxable: r2(subtotal - discount), vatAmount, total, paid, notes: input.notes, dueDate: input.dueDate,
        createdById: userId, status: paid >= total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        items: { create: lines.map(({ _template, ...l }) => l) },
      },
    });

    for (const l of lines) {
      if (!l._template) continue;
      const net = r2((Number(l.unitPrice) * l.qty! - Number(l.discount)) / l.qty!);
      for (let i = 0; i < l.qty!; i++)
        await tx.clientPackage.create({
          data: {
            tenantId, clientId: client.id, templateId: l._template.id, invoiceId: invoice.id, name: l._template.name, price: net,
            expiresAt: new Date(Date.now() + l._template.validityDays * DAY),
            items: { create: l._template.items.map((it) => ({ treatmentId: it.treatmentId, totalSessions: it.sessions })) },
          },
        });
    }
    if (paid > 0) await recordPayment(tx, tenantId, userId, invoice.id, { amount: paid, method: input.payment!.method, reference: input.payment!.reference }, false);
    return invoice;
  });
}

async function loadTemplate(tx: Tx, tenantId: string, id?: string) {
  const t = id && (await tx.packageTemplate.findFirst({ where: { id, tenantId }, include: { items: true } }));
  if (!t) throw new HttpError(404, 'Package not found');
  return t;
}

/** Records a payment against an invoice and issues a receipt number. `updateInvoice=false` when the caller already set paid/status. */
export async function recordPayment(
  tx: Tx, tenantId: string, userId: string, invoiceId: string,
  p: { amount: number; method: string; reference?: string; paidAt?: Date }, updateInvoice = true,
) {
  const inv = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (inv.kind !== 'INVOICE' || inv.status === 'VOID') throw new HttpError(409, 'Payments can only be taken on live invoices');
  const balance = r2(Number(inv.total) - (updateInvoice ? Number(inv.paid) : 0));
  if (p.amount <= 0 || p.amount > balance + 0.001) throw new HttpError(400, `Amount must be between 0 and the balance (${balance.toFixed(2)})`);
  const { n } = await nextSeq(tx, tenantId, 'receiptSeq');
  const pay = await tx.payment.create({
    data: { tenantId, invoiceId, amount: p.amount, method: p.method, reference: p.reference, receivedBy: userId, receiptNo: `RCT-${String(n).padStart(5, '0')}`, ...(p.paidAt && { paidAt: p.paidAt }) },
  });
  if (updateInvoice) {
    const paid = r2(Number(inv.paid) + p.amount);
    await tx.invoice.update({ where: { id: inv.id }, data: { paid, status: paid >= Number(inv.total) ? 'PAID' : 'PARTIALLY_PAID' } });
  }
  return pay;
}

/**
 * Credit note against an invoice (full or partial), optionally refunding money and cancelling the packages it sold.
 * The credit note carries negative amounts so period sales/VAT totals net off automatically.
 */
export async function createCreditNote(
  tenantId: string, userId: string, invoiceId: string,
  b: { amount: number; reason: string; refundMethod?: string; cancelPackages?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId, kind: 'INVOICE' } });
    if (!inv) throw new HttpError(404, 'Invoice not found');
    const credited = await tx.invoice.aggregate({ where: { refInvoiceId: inv.id, tenantId }, _sum: { total: true } });
    const remaining = r2(Number(inv.total) + Number(credited._sum.total ?? 0));
    if (b.amount <= 0 || b.amount > remaining + 0.001) throw new HttpError(400, `Credit amount must be between 0 and ${remaining.toFixed(2)}`);
    if (b.refundMethod) {
      const refunded = await tx.payment.aggregate({ where: { tenantId, kind: 'REFUND', invoice: { refInvoiceId: inv.id } }, _sum: { amount: true } });
      if (b.amount > Number(inv.paid) - Number(refunded._sum.amount ?? 0) + 0.001) throw new HttpError(400, 'Cannot refund more than was paid');
    }

    const ratio = Number(inv.total) ? b.amount / Number(inv.total) : 0;
    const vatAmount = r2(Number(inv.vatAmount) * ratio);
    const taxable = r2(b.amount - vatAmount);
    const { n } = await nextSeq(tx, tenantId, 'creditSeq');
    const cn = await tx.invoice.create({
      data: {
        tenantId, clientId: inv.clientId, kind: 'CREDIT_NOTE', refInvoiceId: inv.id, number: `CN-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`,
        subtotal: -taxable, taxable: -taxable, vatAmount: -vatAmount, total: -b.amount, status: 'ISSUED', notes: b.reason, createdById: userId,
        items: { create: [{ kind: 'OTHER', description: `Credit against ${inv.number}: ${b.reason}`, qty: 1, unitPrice: -taxable, vatRate: Number(inv.vatAmount) ? 5 : 0, vatAmount: -vatAmount, lineTotal: -b.amount }] },
      },
    });
    if (b.refundMethod) {
      const { n: rn } = await nextSeq(tx, tenantId, 'receiptSeq');
      // Refund lives on the credit note; the original keeps its gross `paid` (balance = total + credits − paid + refunds).
      await tx.payment.create({ data: { tenantId, invoiceId: cn.id, kind: 'REFUND', amount: b.amount, method: b.refundMethod, receivedBy: userId, receiptNo: `RFD-${String(rn).padStart(5, '0')}` } });
    }
    if (b.cancelPackages) await tx.clientPackage.updateMany({ where: { invoiceId: inv.id, tenantId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    return cn;
  });
}
