'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, Segmented, Select, Space, Table, Tag } from 'antd';
import { DownloadOutlined, GiftOutlined, UploadOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { age, fmtDate, money, qs, SOURCES } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { ClientCell, PageHeader } from '@/components/ui';
import { loadOffers } from '@/components/OfferSelect';

const FILTERS = [
  { value: 'all', label: 'All clients' }, { value: 'active-package', label: 'Active package' }, { value: 'review-due', label: 'Review due' },
  { value: 'new-30', label: 'New (30 days)' }, { value: 'no-consent', label: 'Consent pending' }, { value: 'vip', label: 'VIP' },
];

function ClientsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { hasRole } = useAuth();
  const [filter, setFilter] = useState(params.get('filter') ?? 'all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<string>();
  const [source, setSource] = useState<string>();
  const [offer, setOffer] = useState<string>();
  const [offers, setOffers] = useState<{ offer: string; clients: number }[]>([]);
  const [page, setPage] = useState(1);
  const finance = hasRole('RECEPTION', 'MANAGER', 'ACCOUNTANT');

  useEffect(() => { loadOffers().then((o) => setOffers(o.filter((x) => x.clients))); }, []);
  useEffect(() => { const h = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(h); }, [q]);
  const { data, loading } = useApi<any>(`/clients?${qs({ q: search, filter, gender, source, offer, page, pageSize: 20 })}`);

  const exportAll = async () => {
    const all = await api<any>(`/clients?${qs({ q: search, filter, gender, source, offer, page: 1, pageSize: 200 })}`);
    exportCsv('clients', [
      { title: 'Client ID', value: (r: any) => r.clientNo }, { title: 'Name', value: (r: any) => r.name }, { title: 'Mobile', value: (r: any) => r.mobile },
      { title: 'Email', value: (r: any) => r.email }, { title: 'Gender', value: (r: any) => r.gender }, { title: 'Source', value: (r: any) => r.source }, { title: 'Offer selected', value: (r: any) => r.offer },
      { title: 'Active packages', value: (r: any) => r.activePackages }, { title: 'Sessions left', value: (r: any) => r.sessionsLeft },
      { title: 'Balance due', value: (r: any) => r.balanceDue }, { title: 'Next review', value: (r: any) => r.nextReviewDate?.slice(0, 10) }, { title: 'Registered', value: (r: any) => r.createdAt.slice(0, 10) },
    ], all.rows);
  };

  return (
    <>
      <PageHeader crumb="Clients" title="Client Register" sub={data ? `${data.total.toLocaleString()} client(s)` : undefined}
        extra={<>
          <Button icon={<DownloadOutlined />} onClick={exportAll}>Export</Button>
          {hasRole('RECEPTION', 'MANAGER') && <Button icon={<UploadOutlined />} onClick={() => router.push('/settings/import?type=clients')}>Import</Button>}
          {hasRole('RECEPTION', 'MANAGER', 'DOCTOR') && <Button type="primary" icon={<UserAddOutlined />} onClick={() => router.push('/clients/new')}>Register client</Button>}
        </>} />
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%', justifyContent: 'space-between' }}>
          <Segmented value={filter} onChange={(v) => { setFilter(String(v)); setPage(1); }} options={FILTERS} />
          <Space wrap>
            <Select allowClear placeholder="Gender" style={{ width: 110 }} value={gender} onChange={(v) => { setGender(v); setPage(1); }} options={[{ value: 'Female' }, { value: 'Male' }]} />
            <Select allowClear placeholder="Source" style={{ width: 130 }} value={source} onChange={(v) => { setSource(v); setPage(1); }} options={SOURCES.map((value) => ({ value }))} />
            <Select allowClear placeholder="Marketing offer" style={{ width: 220 }} popupMatchSelectWidth={false} value={offer} onChange={(v) => { setOffer(v); setPage(1); }} options={offers.map((o) => ({ value: o.offer, label: `${o.offer} (${o.clients})` }))} />
            <Input.Search placeholder="Name, mobile, email, Emirates ID, client ID" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320 }} />
          </Space>
        </Space>
        <Table
          rowKey="id" loading={loading} dataSource={data?.rows} size="middle" scroll={{ x: 1200 }}
          onRow={(r) => ({ onClick: () => router.push(`/clients/${r.id}`), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t.toLocaleString()} clients` }}
          columns={[
            { title: 'Client', render: (_, r) => <ClientCell client={r} sub={`${r.clientNo} · ${r.mobile}`} /> },
            { title: 'Gender / age', render: (_, r) => `${r.gender ?? '—'}${age(r.dob) ? ` · ${age(r.dob)}` : ''}` },
            { title: 'Source', dataIndex: 'source', render: (v) => v ?? '—' },
            { title: 'Offer selected', dataIndex: 'offer', render: (v) => v ? <Tag color="magenta" icon={<GiftOutlined />} style={{ whiteSpace: 'normal' }}>{v}</Tag> : <span className="muted">—</span> },
            { title: 'Packages', render: (_, r) => r.activePackages ? <Tag color="green">{r.activePackages} active · {r.sessionsLeft} sessions left</Tag> : <span className="muted">—</span> },
            ...(finance ? [{ title: 'Balance due', align: 'right' as const, render: (_: unknown, r: any) => r.balanceDue > 0 ? <b style={{ color: '#C8372D' }} className="tabular">{money(r.balanceDue)}</b> : <span className="muted">—</span> }] : []),
            { title: 'Last visit', render: (_, r) => r.lastVisit ? dayjs(r.lastVisit).format('DD MMM YYYY') : <span className="muted">—</span> },
            {
              title: 'Next review', render: (_, r) => {
                if (!r.nextReviewDate) return <span className="muted">—</span>;
                const d = dayjs(r.nextReviewDate);
                return <Tag color={d.isBefore(dayjs(), 'day') ? 'red' : d.diff(dayjs(), 'day') <= 3 ? 'gold' : 'default'}>{fmtDate(r.nextReviewDate)}</Tag>;
              },
            },
            { title: 'Consent', render: (_, r) => r.consentSigned ? <Tag color="green">Signed</Tag> : <Tag color="orange">Pending</Tag> },
          ]}
        />
      </Card>
    </>
  );
}

export default function ClientsPage() {
  return <Suspense><ClientsInner /></Suspense>;
}
