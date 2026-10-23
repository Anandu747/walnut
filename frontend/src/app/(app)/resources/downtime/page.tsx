'use client';
import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Popconfirm, Segmented, Table, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import DowntimeModal from '@/components/DowntimeModal';

export default function DowntimePage() {
  const { message } = App.useApp();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [add, setAdd] = useState<any>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  // Freeze "now" per tab switch — a fresh timestamp every render changes the path and refetches forever.
  const q = useMemo(() => { const now = encodeURIComponent(dayjs().toISOString()); return when === 'upcoming' ? `from=${now}` : `to=${now}`; }, [when]);
  const { data = [], loading, reload } = useApi<any[]>(`/blocks?${q}`, []);
  useEffect(() => {
    Promise.all([api<any[]>('/machines'), api<any[]>('/staff'), api<any[]>('/rooms')]).then(([m, s, r]) =>
      setNames(Object.fromEntries([...m.map((x) => [x.id, x.code]), ...s.map((x) => [x.id, x.name]), ...r.map((x) => [x.id, x.name])])));
  }, []);
  const del = async (id: string) => { try { await api(`/blocks/${id}`, { method: 'DELETE' }); message.success('Removed — slot is bookable again'); reload(); } catch (e) { message.error((e as Error).message); } };

  return (
    <>
      <PageHeader crumb="Scheduler" title="Resource Availability" sub="Maintenance, cleaning, staff leave and room closures — blocked times cannot be booked"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setAdd({ kind: 'MACHINE' })}>Block time</Button>} />
      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 12, borderBottom: '1px solid #ECEAE4' }}><Segmented value={when} onChange={(v) => setWhen(v as 'upcoming' | 'past')} options={[{ value: 'upcoming', label: 'Current & upcoming' }, { value: 'past', label: 'Past' }]} /></div>
        <Table rowKey="id" loading={loading} dataSource={data} size="middle" pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Resource', render: (_, r) => <span><Tag color={r.kind === 'MACHINE' ? 'blue' : r.kind === 'ROOM' ? 'gold' : 'purple'}>{r.kind === 'THERAPIST' ? 'Staff' : r.kind.charAt(0) + r.kind.slice(1).toLowerCase()}</Tag><b>{names[r.resourceId] ?? '…'}</b></span> },
            { title: 'From', render: (_, r) => fmtDateTime(r.startAt) },
            { title: 'To', render: (_, r) => fmtDateTime(r.endAt) },
            { title: 'Duration', render: (_, r) => { const h = dayjs(r.endAt).diff(dayjs(r.startAt), 'minute') / 60; return h >= 24 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`; } },
            { title: 'Reason', dataIndex: 'reason' },
            { title: '', width: 60, render: (_, r) => <Popconfirm title="Remove this block?" onConfirm={() => del(r.id)}><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove" /></Popconfirm> },
          ]} />
      </Card>
      <DowntimeModal init={add} onClose={() => setAdd(null)} onSaved={reload} />
    </>
  );
}
