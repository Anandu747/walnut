'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, App, Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select, Skeleton, Space, Table, Tag, Tooltip } from 'antd';
import { DollarOutlined, PrinterOutlined, RollbackOutlined, StopOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { fmtDate, fmtDateTime, humanize, INVOICE_STATUS, money, PAY_METHODS } from '@/lib/format';
import { PageHeader } from '@/components/ui';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + words(n % 100) : ''}`;
  if (n < 1e6) return `${words(Math.floor(n / 1000))} Thousand${n % 1000 ? ' ' + words(n % 1000) : ''}`;
  return `${words(Math.floor(n / 1e6))} Million${n % 1e6 ? ' ' + words(n % 1e6) : ''}`;
}
/** Plain-text invoice summary for WhatsApp (*bold* is WhatsApp markup). */
function invoiceText(inv: any) {
  const isCN = inv.kind === 'CREDIT_NOTE';
  const amt = (v: number | string) => money(v).replace(/ /g, ' ');
  return [
    `Hello ${inv.client.name.split(' ')[0]},`,
    '',
    `Thank you for choosing ${inv.tenant.name}. Here are your ${isCN ? 'credit note' : 'invoice'} details:`,
    '',
    `*${isCN ? 'Credit note' : 'Tax invoice'} ${inv.number}*`,
    `Date: ${fmtDate(inv.issuedAt)}`,
    ...inv.items.map((i: any) => `• ${i.description}${i.qty > 1 ? ` × ${i.qty}` : ''} — ${amt(i.lineTotal)}`),
    '',
    ...(Number(inv.discount) ? [`Discount: ${amt(inv.discount)}`] : []),
    `VAT: ${amt(inv.vatAmount)}`,
    `*Total: ${amt(inv.total)}*`,
    ...(!isCN ? [`Paid: ${amt(inv.paid)}`, inv.balance > 0 ? `*Balance due: ${amt(inv.balance)}*` : 'Status: Fully paid ✅'] : []),
    '',
    `TRN: ${inv.tenant.trn ?? '—'}`,
    `${inv.tenant.phone ?? ''}`,
  ].join('\n').trim();
}

const amountInWords = (v: number) => {
  const a = Math.abs(v), d = Math.floor(a), f = Math.round((a - d) * 100);
  return `UAE Dirhams ${words(d) || 'Zero'}${f ? ` and ${words(f)} Fils` : ''} Only`;
};

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { data: inv, reload } = useApi<any>(`/invoices/${id}`);
  const [modal, setModal] = useState<'pay' | 'credit' | 'void' | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);

  if (!inv) return <Skeleton active paragraph={{ rows: 12 }} />;
  const isCN = inv.kind === 'CREDIT_NOTE';
  const live = !isCN && inv.status !== 'VOID';
  const credited = inv.credits.reduce((s: number, c: any) => s + Number(c.total), 0);

  // Open the tab synchronously (before the API call) so the browser doesn't treat it as a pop-up.
  const whatsapp = async () => {
    const w = window.open('about:blank', '_blank');
    setSending(true);
    try {
      const r = await api<any>('/messages', { method: 'POST', body: { clientId: inv.client.id, body: invoiceText(inv), channel: 'WHATSAPP' } });
      if (w) w.location.href = r.waLink; else window.open(r.waLink, '_blank');
      message.success('Invoice sent to WhatsApp — logged in the client’s messages');
    } catch (e) { w?.close(); message.error((e as Error).message); } finally { setSending(false); }
  };

  const open = (m: typeof modal) => {
    form.resetFields();
    if (m === 'pay') form.setFieldsValue({ amount: inv.balance, method: 'CARD' });
    if (m === 'credit') form.setFieldsValue({ amount: Number(inv.total) + credited, refund: Number(inv.paid) > 0, refundMethod: 'CARD', cancelPackages: true });
    setModal(m);
  };
  const submit = async (v: any) => {
    setSaving(true);
    try {
      if (modal === 'pay') await api(`/invoices/${id}/payments`, { method: 'POST', body: { amount: v.amount, method: v.method, reference: v.reference } });
      if (modal === 'credit') await api(`/invoices/${id}/credit-note`, { method: 'POST', body: { amount: v.amount, reason: v.reason, refundMethod: v.refund ? v.refundMethod : undefined, cancelPackages: v.cancelPackages } });
      if (modal === 'void') await api(`/invoices/${id}/void`, { method: 'POST', body: { reason: v.reason } });
      message.success(modal === 'pay' ? 'Payment recorded — receipt issued' : modal === 'credit' ? 'Credit note issued' : 'Invoice voided');
      setModal(null); reload();
    } catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader crumb="Billing" title={<>{inv.number} <Tag color={isCN ? 'purple' : INVOICE_STATUS[inv.status]} style={{ verticalAlign: 'middle' }}>{isCN ? 'Credit note' : humanize(inv.status)}</Tag></>}
        sub={<>For <Link href={`/clients/${inv.client.id}`}>{inv.client.name}</Link> · issued {fmtDateTime(inv.issuedAt)}{inv.createdBy ? ` by ${inv.createdBy}` : ''}</>}
        extra={<>
          <Tooltip title={inv.client.whatsappOptIn ? `Send to ${inv.client.mobile}` : 'Client has not opted in to WhatsApp messages'}>
            <Button icon={<WhatsAppOutlined style={{ color: inv.client.whatsappOptIn ? '#25D366' : undefined }} />} loading={sending} disabled={!inv.client.whatsappOptIn || inv.status === 'VOID'} onClick={whatsapp}>WhatsApp</Button>
          </Tooltip>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print / PDF</Button>
          {live && inv.balance > 0 && hasRole('RECEPTION', 'MANAGER', 'ACCOUNTANT') && <Button type="primary" icon={<DollarOutlined />} onClick={() => open('pay')}>Record payment</Button>}
          {live && hasRole('MANAGER', 'ACCOUNTANT') && Number(inv.total) + credited > 0 && <Button icon={<RollbackOutlined />} onClick={() => open('credit')}>Credit note / refund</Button>}
          {live && Number(inv.paid) === 0 && hasRole('MANAGER', 'ACCOUNTANT') && <Button danger icon={<StopOutlined />} onClick={() => open('void')}>Void</Button>}
        </>} />
      {inv.status === 'VOID' && <Alert type="error" showIcon style={{ marginBottom: 16 }} title="This invoice is void" description={inv.notes} />}
      <Row gutter={16}>
        <Col xs={24} xl={16}>
          <Card styles={{ body: { padding: 36 } }} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Walnut" style={{ width: 76 }} />
                <div style={{ lineHeight: 1.5 }}>
                  <b style={{ fontSize: 16 }}>{inv.tenant.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{inv.tenant.address}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{inv.tenant.phone} · {inv.tenant.email}</div>
                  <div style={{ fontSize: 12 }}>TRN: <b>{inv.tenant.trn ?? '—'}</b></div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '.04em', color: '#7A5608' }}>{isCN ? 'TAX CREDIT NOTE' : 'TAX INVOICE'}</div>
                <div className="tabular">No. <b>{inv.number}</b></div>
                <div>Date: {fmtDate(inv.issuedAt)}</div>
                {inv.ref && <div>Against: <Link href={`/billing/${inv.ref.id}`}>{inv.ref.number}</Link></div>}
                {inv.dueDate && !isCN && <div>Due: {fmtDate(inv.dueDate)}</div>}
              </div>
            </div>
            <div style={{ margin: '24px 0', padding: 14, background: '#FAF9F6', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div><span className="muted">Bill to:</span> <b>{inv.client.title ? inv.client.title + ' ' : ''}{inv.client.name}</b></div>
              <div><span className="muted">Client ID:</span> {inv.client.clientNo}</div>
              <div><span className="muted">Mobile:</span> {inv.client.mobile}</div>
              <div><span className="muted">Email:</span> {inv.client.email ?? '—'}</div>
            </div>
            <Table size="small" rowKey="id" pagination={false} dataSource={inv.items}
              columns={[
                { title: '#', width: 36, render: (_, __, i) => i + 1 },
                { title: 'Description', dataIndex: 'description', render: (v, r: any) => <span>{v}{r.kind === 'PACKAGE' && <Tag color="gold" style={{ marginLeft: 6 }}>Package</Tag>}</span> },
                { title: 'Qty', dataIndex: 'qty', align: 'right' },
                { title: 'Unit price', align: 'right', render: (_, r: any) => money(r.unitPrice) },
                { title: 'Discount', align: 'right', render: (_, r: any) => Number(r.discount) ? money(r.discount) : '—' },
                { title: 'Taxable', align: 'right', render: (_, r: any) => money(Number(r.unitPrice) * r.qty - Number(r.discount)) },
                { title: 'VAT', align: 'right', render: (_, r: any) => <span>{money(r.vatAmount)} <span className="muted" style={{ fontSize: 11 }}>{r.taxCategory === 'STANDARD' ? `${Number(r.vatRate)}%` : humanize(r.taxCategory)}</span></span> },
                { title: 'Amount', align: 'right', render: (_, r: any) => <b>{money(r.lineTotal)}</b> },
              ]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', maxWidth: 420, fontSize: 12 }} className="muted">
                <div><b style={{ color: '#1F1D1A' }}>Amount in words:</b> {amountInWords(Number(inv.total))}</div>
                {inv.notes && <div style={{ marginTop: 8 }}>Notes: {inv.notes}</div>}
                <div style={{ marginTop: 8 }}>Packages are non-transferable and must be used within their validity period.</div>
              </div>
              <div style={{ minWidth: 280, marginLeft: 'auto' }}>
                {[['Subtotal', inv.subtotal], ...(Number(inv.discount) ? [['Discount', -Number(inv.discount)]] : []), ['Total taxable amount', inv.taxable], ['Total VAT', inv.vatAmount]].map(([l, v]) => (
                  <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span className="muted">{l}</span><span className="tabular">{money(Number(v))}</span></div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1F1D1A', marginTop: 6, paddingTop: 6, fontSize: 16 }}><b>Total (AED)</b><b className="tabular">{money(inv.total)}</b></div>
                {!isCN && <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span className="muted">Paid</span><span className="tabular">{money(inv.paid)}</span></div>
                  {credited !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span className="muted">Credited</span><span className="tabular">{money(credited)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: inv.balance > 0 ? '#C8372D' : undefined }}><b>Balance due</b><b className="tabular">{money(inv.balance)}</b></div>
                </>}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={8} className="no-print">
          <Card size="small" title="Receipts" style={{ marginBottom: 16 }}>
            {!inv.payments.length ? <span className="muted">No payments yet</span> : inv.payments.map((p: any) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1EFEA' }}>
                <span><b>{p.receiptNo}</b><br /><span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(p.paidAt)} · {humanize(p.method)}{p.reference ? ` · ${p.reference}` : ''}</span></span>
                <b className="tabular" style={{ color: p.kind === 'REFUND' ? '#C8372D' : undefined }}>{p.kind === 'REFUND' ? '−' : ''}{money(p.amount)}</b>
              </div>
            ))}
          </Card>
          {inv.credits.length > 0 && (
            <Card size="small" title="Credit notes">
              {inv.credits.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <Link href={`/billing/${c.id}`}><b>{c.number}</b></Link><span className="tabular">{money(c.total)}</span>
                </div>
              ))}
            </Card>
          )}
        </Col>
      </Row>

      <Modal open={!!modal} onCancel={() => setModal(null)} onOk={() => form.submit()} confirmLoading={saving} destroyOnHidden
        title={modal === 'pay' ? 'Record payment' : modal === 'credit' ? 'Issue credit note' : 'Void invoice'} okText={modal === 'void' ? 'Void invoice' : 'Save'} okButtonProps={{ danger: modal === 'void' }}>
        <Form form={form} layout="vertical" onFinish={submit}>
          {modal === 'pay' && <>
            <Form.Item name="amount" label={`Amount (balance ${money(inv.balance)})`} rules={[{ required: true }]}><InputNumber prefix="AED" min={0.01} max={inv.balance} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="method" label="Method"><Select options={PAY_METHODS} /></Form.Item>
            <Form.Item name="reference" label="Reference"><Input placeholder="Card last 4 / transfer ref" /></Form.Item>
          </>}
          {modal === 'credit' && <>
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Credit notes are permanent and appear in the VAT report." />
            <Form.Item name="amount" label="Credit amount incl. VAT" rules={[{ required: true }]}><InputNumber prefix="AED" min={0.01} max={Number(inv.total) + credited} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3 }]}><Input placeholder="e.g. Client relocated — unused sessions refunded" /></Form.Item>
            <Form.Item name="refund" valuePropName="checked"><Checkbox>Refund money to the client</Checkbox></Form.Item>
            <Form.Item noStyle shouldUpdate>{() => form.getFieldValue('refund') && <Form.Item name="refundMethod" label="Refund method"><Select options={PAY_METHODS} /></Form.Item>}</Form.Item>
            <Form.Item name="cancelPackages" valuePropName="checked"><Checkbox>Cancel the package(s) sold on this invoice</Checkbox></Form.Item>
          </>}
          {modal === 'void' && <>
            <Alert type="error" showIcon style={{ marginBottom: 12 }} title="Voiding cancels the invoice and any packages it created." />
            <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
          </>}
        </Form>
      </Modal>
    </>
  );
}
