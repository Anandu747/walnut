'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Progress, Segmented, Space, Table, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useApi } from '@/lib/useApi';
import { fmtDate, humanize, money, PACKAGE_STATUS } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { ClientCell, PageHeader, StatTile } from '@/components/ui';

export default function SoldPackages() {
  const router = useRouter();
  const [view, setView] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const path = view === 'EXPIRING' ? '/client-packages?expiringDays=14' : `/client-packages?status=${view}`;
  const { data = [], loading } = useApi<any[]>(path, []);
  const rows = data.filter((p) => !q || `${p.client.name} ${p.client.clientNo} ${p.client.mobile} ${p.name}`.toLowerCase().includes(q.toLowerCase()));
  const liability = rows.reduce((s, p) => s + p.unfulfilledValue, 0);
  const left = rows.reduce((s, p) => s + p.totalSessions - p.usedSessions, 0);

  return (
    <>
      <PageHeader crumb="Packages" title="Client Packages & Balances"
        extra={<Button icon={<DownloadOutlined />} onClick={() => exportCsv('client-packages', [
          { title: 'Client ID', value: (r: any) => r.client.clientNo }, { title: 'Client', value: (r: any) => r.client.name }, { title: 'Package', value: (r: any) => r.name },
          { title: 'Purchased', value: (r: any) => r.purchasedAt.slice(0, 10) }, { title: 'Expires', value: (r: any) => r.expiresAt.slice(0, 10) }, { title: 'Price', value: (r: any) => r.price },
          { title: 'Sessions total', value: (r: any) => r.totalSessions }, { title: 'Sessions used', value: (r: any) => r.usedSessions }, { title: 'Unfulfilled value', value: (r: any) => r.unfulfilledValue }, { title: 'Status', value: (r: any) => r.status },
        ], rows)}>Export</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Packages" value={rows.length} />
        <StatTile label="Sessions remaining" value={left.toLocaleString()} />
        <StatTile label="Unfulfilled session value" value={money(liability, false)} sub="paid in advance, not yet delivered" />
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%' }}>
          <Segmented value={view} onChange={(v) => setView(String(v))} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'EXPIRING', label: 'Expiring ≤ 14 days' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'EXPIRED', label: 'Expired' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          <Input.Search placeholder="Client or package" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={rows} size="middle" pagination={{ pageSize: 20 }}
          onRow={(r) => ({ onClick: () => router.push(`/clients/${r.client.id}?tab=packages`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Client', render: (_, r) => <ClientCell client={r.client} sub={`${r.client.clientNo} · ${r.client.mobile}`} /> },
            { title: 'Package', render: (_, r) => <div><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.items.map((i: any) => `${i.treatment.name.split(' (')[0].split(' –')[0]} ${i.usedSessions}/${i.totalSessions}`).join(' · ')}</div></div> },
            { title: 'Usage', width: 170, render: (_, r) => <Progress percent={Math.round((r.usedSessions / r.totalSessions) * 100)} size="small" format={() => `${r.usedSessions}/${r.totalSessions}`} /> },
            { title: 'Purchased', render: (_, r) => fmtDate(r.purchasedAt) },
            { title: 'Expires', sorter: (a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt), render: (_, r) => { const d = dayjs(r.expiresAt).diff(dayjs(), 'day'); return <span>{fmtDate(r.expiresAt)}{r.status === 'ACTIVE' && d <= 14 && <Tag color={d < 0 ? 'red' : 'orange'} style={{ marginLeft: 6 }}>{d < 0 ? 'overdue' : `${d}d`}</Tag>}</span>; } },
            { title: 'Unfulfilled value', align: 'right', sorter: (a, b) => a.unfulfilledValue - b.unfulfilledValue, render: (_, r) => money(r.unfulfilledValue) },
            { title: 'Status', render: (_, r) => <Tag color={PACKAGE_STATUS[r.status]}>{humanize(r.status)}</Tag> },
          ]} />
      </Card>
    </>
  );
}
