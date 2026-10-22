'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, DatePicker, Select, Space, Table, Tag } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useApi } from '@/lib/useApi';
import { fmtDateTime, humanize, money, PAY_METHODS, qs } from '@/lib/format';
import { PageHeader, StatTile } from '@/components/ui';

export default function ReceiptsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [method, setMethod] = useState<string>();
  const { data = [], loading } = useApi<any[]>(`/payments?${qs({ from: range[0].startOf('day'), to: range[1].endOf('day'), method })}`, []);
  const paid = data.filter((p) => p.kind === 'PAYMENT').reduce((s, p) => s + Number(p.amount), 0);
  const refunds = data.filter((p) => p.kind === 'REFUND').reduce((s, p) => s + Number(p.amount), 0);
  return (
    <>
      <PageHeader crumb="Billing" title="Receipts & Refunds" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Receipts" value={money(paid)} sub={`${data.filter((p) => p.kind === 'PAYMENT').length} payments`} />
        <StatTile label="Refunds" value={money(refunds)} />
        <StatTile label="Net collected" value={money(paid - refunds)} />
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%' }}>
          <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} allowClear={false} format="DD MMM YYYY" />
          <Select allowClear placeholder="Method" style={{ width: 170 }} value={method} onChange={setMethod} options={PAY_METHODS} />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={data} size="middle" pagination={{ pageSize: 25 }}
          columns={[
            { title: 'Receipt no.', dataIndex: 'receiptNo', render: (v, r) => <span><b>{v}</b>{r.kind === 'REFUND' && <Tag color="red" style={{ marginLeft: 6 }}>Refund</Tag>}</span> },
            { title: 'Date', render: (_, r) => fmtDateTime(r.paidAt) },
            { title: 'Client', render: (_, r) => <Link href={`/clients/${r.invoice.client.id}`}>{r.invoice.client.name}</Link> },
            { title: 'Against', render: (_, r) => <Link href={`/billing/${r.invoice.id}`}>{r.invoice.number}</Link> },
            { title: 'Method', render: (_, r) => humanize(r.method) },
            { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
            { title: 'Amount', align: 'right', render: (_, r) => <b style={{ color: r.kind === 'REFUND' ? '#C8372D' : undefined }}>{r.kind === 'REFUND' ? '−' : ''}{money(r.amount)}</b> },
          ]} />
      </Card>
    </>
  );
}
