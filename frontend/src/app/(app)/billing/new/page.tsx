'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Button, Card, Col, Divider, Empty, Input, InputNumber, Row, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, GiftOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { money, PAY_METHODS } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import ClientSelect from '@/components/ClientSelect';

type Line = { key: number; kind: 'PACKAGE' | 'SERVICE' | 'OTHER'; packageTemplateId?: string; treatmentId?: string; description: string; detail?: string; qty: number; unitPrice: number; discount: number; taxCategory: 'STANDARD' | 'ZERO' | 'EXEMPT' };
const r2 = (n: number) => Math.round(n * 100) / 100;
let seq = 1;

function NewInvoiceInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { message } = App.useApp();
  const [clientId, setClientId] = useState<string | undefined>(params.get('clientId') ?? undefined);
  const [client, setClient] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [vatRate, setVatRate] = useState(5);
  const [lines, setLines] = useState<Line[]>([]);
  const [payMode, setPayMode] = useState<'full' | 'partial' | 'later'>('full');
  const [pay, setPay] = useState<{ amount?: number; method: string; reference?: string }>({ method: 'CARD' });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api<any[]>('/package-templates'), api<any[]>('/treatments'), api<any>('/settings')]).then(([p, t, s]) => {
      setTemplates(p.filter((x) => x.active)); setTreatments(t.filter((x) => x.active)); setVatRate(Number(s.vatRate));
    });
  }, []);
  useEffect(() => { setClient(null); if (clientId) api(`/clients/${clientId}`).then(setClient).catch(() => {}); }, [clientId]);

  const addPackage = (t: any) => setLines((l) => [...l, { key: seq++, kind: 'PACKAGE', packageTemplateId: t.id, description: t.name, detail: t.items.map((i: any) => `${i.sessions} × ${i.treatment.name}`).join(' + ') + ` · valid ${t.validityDays} days`, qty: 1, unitPrice: Number(t.price), discount: 0, taxCategory: 'STANDARD' }]);
  const addService = (id: string) => { const t = treatments.find((x) => x.id === id); if (t) setLines((l) => [...l, { key: seq++, kind: 'SERVICE', treatmentId: t.id, description: t.name, detail: `${t.durationMin} min`, qty: 1, unitPrice: Number(t.price), discount: 0, taxCategory: t.taxCategory }]); };
  const update = (key: number, patch: Partial<Line>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const calc = useMemo(() => {
    const rows = lines.map((l) => {
      const gross = r2(l.unitPrice * l.qty), disc = r2(Math.min(l.discount, gross)), taxable = r2(gross - disc);
      const vat = r2(l.taxCategory === 'STANDARD' ? (taxable * vatRate) / 100 : 0);
      return { ...l, gross, disc, taxable, vat, total: r2(taxable + vat) };
    });
    const sum = (k: 'gross' | 'disc' | 'taxable' | 'vat' | 'total') => r2(rows.reduce((s, r) => s + r[k], 0));
    return { rows, gross: sum('gross'), disc: sum('disc'), taxable: sum('taxable'), vat: sum('vat'), total: sum('total') };
  }, [lines, vatRate]);

  const payAmount = payMode === 'full' ? calc.total : payMode === 'partial' ? Math.min(pay.amount ?? 0, calc.total) : 0;

  const submit = async () => {
    if (!clientId) return message.warning('Select a client first');
    if (!lines.length) return message.warning('Add at least one package or service');
    if (payMode === 'partial' && !(payAmount > 0)) return message.warning('Enter the amount being paid now');
    setSaving(true);
    try {
      const inv = await api<any>('/invoices', {
        method: 'POST', body: {
          clientId, notes: notes || undefined,
          items: lines.map((l) => ({ kind: l.kind, packageTemplateId: l.packageTemplateId, treatmentId: l.treatmentId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, taxCategory: l.taxCategory })),
          payment: payAmount > 0 ? { amount: payAmount, method: pay.method, reference: pay.reference || undefined } : undefined,
        },
      });
      message.success(`Invoice ${inv.number} issued${lines.some((l) => l.kind === 'PACKAGE') ? ' — package added to client' : ''}`);
      router.push(`/billing/${inv.id}`);
    } catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };

  const activePkgs = client?.packages?.filter((p: any) => p.status === 'ACTIVE') ?? [];

  return (
    <>
      <PageHeader crumb="Billing" title="New Invoice" sub="UAE tax invoice · package lines create the client's session balances automatically" />
      <Row gutter={16}>
        <Col xs={24} xl={16}>
          <Card size="small" title="Client" style={{ marginBottom: 16 }}>
            <ClientSelect value={clientId} onChange={(v) => setClientId(v)} style={{ width: '100%' }} />
            {client && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tag>{client.clientNo}</Tag><Tag>{client.mobile}</Tag>
                {activePkgs.map((p: any) => <Tag color="green" key={p.id}>{p.name}</Tag>)}
                {client.summary?.balanceDue > 0 && <Tag color="red">Existing balance {money(client.summary.balanceDue)}</Tag>}
              </div>
            )}
          </Card>

          <Card size="small" title={<span><GiftOutlined /> Package catalogue</span>} style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {templates.map((t) => (
                <div key={t.id} onClick={() => addPackage(t)} className="clickable" style={{ border: '1px solid #ECEAE4', borderRadius: 10, padding: 12, background: '#FFFDF8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ fontSize: 13 }}>{t.name}</b><PlusOutlined className="muted" /></div>
                  <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>{t.items.map((i: any) => `${i.sessions}× ${i.treatment.name.split(' (')[0].split(' –')[0]}`).join(' + ')}</div>
                  <b className="tabular" style={{ color: '#7A5608' }}>{money(t.price, false)}</b> <span className="muted" style={{ fontSize: 12 }}>· {t.validityDays} days</span>
                </div>
              ))}
            </div>
            <Divider style={{ margin: '14px 0' }} />
            <Space wrap>
              <Select showSearch={{ optionFilterProp: 'label' }} placeholder="+ Add single service / session" style={{ width: 320 }} value={null as any} onChange={addService}
                options={treatments.map((t) => ({ value: t.id, label: `${t.name} · ${money(t.price, false)}` }))} />
              <Button icon={<PlusOutlined />} onClick={() => setLines((l) => [...l, { key: seq++, kind: 'OTHER', description: '', qty: 1, unitPrice: 0, discount: 0, taxCategory: 'STANDARD' }])}>Custom line</Button>
            </Space>
          </Card>

          <Card size="small" title="Invoice lines">
            {!lines.length ? <Empty description="Click a package above or add a service" /> : (
              <Table size="small" rowKey="key" pagination={false} dataSource={calc.rows} scroll={{ x: 760 }}
                columns={[
                  {
                    title: 'Item', render: (_, r) => r.kind === 'OTHER'
                      ? <Input placeholder="Description" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} />
                      : <div><b>{r.description}</b> {r.kind === 'PACKAGE' && <Tag color="gold">Package</Tag>}<div className="muted" style={{ fontSize: 12 }}>{r.detail}</div></div>,
                  },
                  { title: 'Qty', width: 70, render: (_, r) => <InputNumber size="small" min={1} max={20} value={r.qty} onChange={(v) => update(r.key, { qty: v ?? 1 })} style={{ width: 56 }} /> },
                  { title: 'Unit price', width: 110, render: (_, r) => <InputNumber size="small" min={0} value={r.unitPrice} onChange={(v) => update(r.key, { unitPrice: v ?? 0 })} style={{ width: 100 }} /> },
                  {
                    title: 'Discount', width: 170, render: (_, r) => (
                      <Space.Compact size="small">
                        <InputNumber size="small" min={0} value={r.discount} onChange={(v) => update(r.key, { discount: v ?? 0 })} style={{ width: 84 }} />
                        <Select size="small" value={null as any} placeholder="%" style={{ width: 70 }} onChange={(p: number) => update(r.key, { discount: r2((r.unitPrice * r.qty * p) / 100) })} options={[5, 10, 15, 20].map((p) => ({ value: p, label: `${p}%` }))} />
                      </Space.Compact>
                    ),
                  },
                  { title: 'VAT', width: 110, render: (_, r) => <Select size="small" value={r.taxCategory} onChange={(v) => update(r.key, { taxCategory: v })} style={{ width: 100 }} options={[{ value: 'STANDARD', label: `${vatRate}%` }, { value: 'ZERO', label: 'Zero' }, { value: 'EXEMPT', label: 'Exempt' }]} /> },
                  { title: 'Total', align: 'right', width: 120, render: (_, r) => <b className="tabular">{money(r.total)}</b> },
                  { title: '', width: 40, render: (_, r) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setLines((l) => l.filter((x) => x.key !== r.key))} aria-label="Remove line" /> },
                ]} />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card size="small" title="Summary" style={{ position: 'sticky', top: 76 }}>
            {[['Subtotal', calc.gross], ...(calc.disc ? [['Discount', -calc.disc]] : []), ['Taxable amount', calc.taxable], [`VAT ${vatRate}%`, calc.vat]].map(([l, v]) => (
              <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span className="muted">{l}</span><span className="tabular">{money(Number(v))}</span></div>
            ))}
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b>Total (AED)</b><span style={{ fontSize: 26, fontWeight: 700 }}>{money(calc.total)}</span></div>
            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text strong>Payment</Typography.Text>
            <Segmented block value={payMode} onChange={(v) => setPayMode(v as typeof payMode)} style={{ margin: '8px 0' }} options={[{ value: 'full', label: 'Pay in full' }, { value: 'partial', label: 'Part payment' }, { value: 'later', label: 'Pay later' }]} />
            {payMode !== 'later' && (
              <div style={{ display: 'grid', gap: 8 }}>
                {payMode === 'partial' && <InputNumber prefix="AED" min={0} max={calc.total} value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v ?? undefined })} style={{ width: '100%' }} placeholder="Amount paid now" />}
                <Select value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={PAY_METHODS} />
                <Input placeholder="Reference (card last 4 / Tabby ID / transfer ref)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              </div>
            )}
            {payMode !== 'full' && calc.total > 0 && <Alert type="info" showIcon style={{ marginTop: 8 }} title={`Balance due after this: ${money(calc.total - payAmount)}`} description="A payment follow-up task is created automatically." />}
            <Input.TextArea rows={2} placeholder="Invoice notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 12 }} />
            <Button type="primary" block size="large" style={{ marginTop: 12 }} loading={saving} onClick={submit}>Issue invoice{payAmount > 0 ? ` & collect ${money(payAmount, false)}` : ''}</Button>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default function NewInvoicePage() {
  return <Suspense><NewInvoiceInner /></Suspense>;
}
