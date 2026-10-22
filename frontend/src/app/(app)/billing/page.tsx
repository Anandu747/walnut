'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, DatePicker, Input, Segmented, Space, Table, Tag } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useApi } from '@/lib/useApi';
import { fmtDate, humanize, INVOICE_STATUS, money, qs } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { ClientCell, PageHeader, StatTile } from '@/components/ui';

function BillsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState(params.get('outstanding') ? 'outstanding' : 'all');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(params.get('outstanding') ? null : [dayjs().startOf('month'), dayjs()]);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const h = setTimeout(() => setSearch(q), 300); return () => clearTimeout(h); }, [q]);
  const { data = [], loading } = useApi<any[]>(`/invoices?${qs({
    q: search, outstanding: view === 'outstanding' ? 'true' : undefined, kind: view === 'credit' ? 'CREDIT_NOTE' : undefined,
    from: range?.[0].startOf('day'), to: range?.[1].endOf('day'),
  })}`, []);
  const live = data.filter((i) => i.status !== 'VOID');
  const total = live.reduce((s, i) => s + Number(i.total), 0);
  const vat = live.reduce((s, i) => s + Number(i.vatAmount), 0);
  const due = live.filter((i) => i.kind === 'INVOICE').reduce((s, i) => s + Number(i.total) - Number(i.paid), 0);

  return (
    <>
      <PageHeader crumb="Billing" title="Search Bills" extra={<>
        <Button icon={<DownloadOutlined />} onClick={() => exportCsv('invoices', [
          { title: 'Number', value: (r: any) => r.number }, { title: 'Type', value: (r: any) => r.kind }, { title: 'Date', value: (r: any) => r.issuedAt.slice(0, 10) },
          { title: 'Client ID', value: (r: any) => r.client.clientNo }, { title: 'Client', value: (r: any) => r.client.name }, { title: 'Taxable', value: (r: any) => r.taxable },
          { title: 'VAT', value: (r: any) => r.vatAmount }, { title: 'Total', value: (r: any) => r.total }, { title: 'Paid', value: (r: any) => r.paid }, { title: 'Status', value: (r: any) => r.status },
        ], data)}>Export</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/billing/new')}>New invoice</Button>
      </>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Documents" value={data.length} />
        <StatTile label="Billed (incl. VAT)" value={money(total)} />
        <StatTile label="Output VAT" value={money(vat)} />
        <StatTile label="Balance outstanding" value={money(due)} />
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%' }}>
          <Segmented value={view} onChange={(v) => { setView(String(v)); if (v === 'outstanding') setRange(null); }}
            options={[{ value: 'all', label: 'All documents' }, { value: 'outstanding', label: 'Unpaid / partially paid' }, { value: 'credit', label: 'Credit notes' }]} />
          <DatePicker.RangePicker value={range} onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)} format="DD MMM YYYY" presets={[
            { label: 'Today', value: [dayjs(), dayjs()] }, { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
            { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            { label: 'This year', value: [dayjs().startOf('year'), dayjs()] },
          ]} />
          <Input.Search placeholder="Invoice no., client name or mobile" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={data} size="middle" pagination={{ pageSize: 25, showSizeChanger: false }}
          onRow={(r) => ({ onClick: () => router.push(`/billing/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Number', dataIndex: 'number', render: (v, r) => <span><b>{v}</b>{r.kind === 'CREDIT_NOTE' && <Tag color="purple" style={{ marginLeft: 6 }}>CN</Tag>}</span> },
            { title: 'Date', render: (_, r) => fmtDate(r.issuedAt) },
            { title: 'Client', render: (_, r) => <ClientCell client={r.client} sub={`${r.client.clientNo} · ${r.client.mobile}`} /> },
            { title: 'Taxable', align: 'right', render: (_, r) => money(r.taxable) },
            { title: 'VAT', align: 'right', render: (_, r) => money(r.vatAmount) },
            { title: 'Total', align: 'right', render: (_, r) => <b>{money(r.total)}</b> },
            { title: 'Balance', align: 'right', render: (_, r) => r.kind === 'INVOICE' && r.status !== 'VOID' && Number(r.total) > Number(r.paid) ? <b style={{ color: '#C8372D' }}>{money(Number(r.total) - Number(r.paid))}</b> : '—' },
            { title: 'Status', render: (_, r) => <Tag color={INVOICE_STATUS[r.status]}>{humanize(r.status)}</Tag> },
          ]} />
      </Card>
    </>
  );
}

export default function BillsPage() {
  return <Suspense><BillsInner /></Suspense>;
}
