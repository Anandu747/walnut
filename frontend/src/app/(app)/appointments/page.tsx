'use client';
import { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Space, Table } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { fmtTime, qs, STATUS } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { ClientCell, PageHeader, StatusTag } from '@/components/ui';
import AppointmentPanel from '@/components/AppointmentPanel';
import BookingDrawer from '@/components/BookingDrawer';

export default function AppointmentsPage() {
  const { hasRole } = useAuth();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs().add(6, 'day').endOf('day')]);
  const [f, setF] = useState<{ status?: string; therapistId?: string; treatmentId?: string; machineId?: string; roomId?: string; q?: string }>({});
  const [q, setQ] = useState('');
  const [lists, setLists] = useState<{ staff: any[]; treatments: any[]; machines: any[]; rooms: any[] }>({ staff: [], treatments: [], machines: [], rooms: [] });
  const [openId, setOpenId] = useState<string>();
  const [book, setBook] = useState(false);

  useEffect(() => {
    Promise.all([api<any[]>('/staff'), api<any[]>('/treatments'), api<any[]>('/machines'), api<any[]>('/rooms')]).then(([s, t, m, r]) =>
      setLists({ staff: s.filter((x) => x.skills.length), treatments: t, machines: m, rooms: r })).catch(() => {});
  }, []);
  useEffect(() => { const h = setTimeout(() => setF((p) => ({ ...p, q })), 300); return () => clearTimeout(h); }, [q]);

  const { data = [], loading, reload } = useApi<any[]>(`/appointments?${qs({ from: range[0].startOf('day'), to: range[1].endOf('day'), ...f })}`, []);

  const columns = [
    { title: 'Date & time', key: 'when', sorter: (a: any, b: any) => +new Date(a.startAt) - +new Date(b.startAt), render: (_: unknown, r: any) => <span className="tabular"><b>{dayjs(r.startAt).format('ddd DD MMM')}</b><br /><span className="muted">{fmtTime(r.startAt)} – {fmtTime(r.endAt)}</span></span> },
    { title: 'Client', key: 'client', render: (_: unknown, r: any) => <ClientCell client={r.client} sub={`${r.client.clientNo} · ${r.client.mobile}`} /> },
    { title: 'Treatment', key: 'treatment', render: (_: unknown, r: any) => <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.treatment.color, marginRight: 6 }} />{r.treatment.name}</span> },
    { title: 'Therapist', key: 'th', render: (_: unknown, r: any) => r.therapist.name },
    { title: 'Machine', key: 'm', render: (_: unknown, r: any) => r.machine?.code ?? '—' },
    { title: 'Room', key: 'room', render: (_: unknown, r: any) => r.room.name },
    { title: 'Package', key: 'pkg', render: (_: unknown, r: any) => r.packageItem ? <span className="muted" style={{ fontSize: 12 }}>{r.packageItem.clientPackage.name}</span> : <span className="muted">Pay per visit</span> },
    { title: 'Status', key: 'status', render: (_: unknown, r: any) => <StatusTag status={r.status} /> },
  ];

  return (
    <>
      <PageHeader crumb="Scheduler" title="Search Appointments" sub={`${data.length} appointment(s) in range`}
        extra={<>
          <Button icon={<DownloadOutlined />} onClick={() => exportCsv(`appointments-${range[0].format('YYYYMMDD')}`, [
            { title: 'Date', value: (r: any) => dayjs(r.startAt).format('YYYY-MM-DD') }, { title: 'Start', value: (r: any) => fmtTime(r.startAt) }, { title: 'End', value: (r: any) => fmtTime(r.endAt) },
            { title: 'Client ID', value: (r: any) => r.client.clientNo }, { title: 'Client', value: (r: any) => r.client.name }, { title: 'Mobile', value: (r: any) => r.client.mobile },
            { title: 'Treatment', value: (r: any) => r.treatment.name }, { title: 'Therapist', value: (r: any) => r.therapist.name }, { title: 'Machine', value: (r: any) => r.machine?.code },
            { title: 'Room', value: (r: any) => r.room.name }, { title: 'Status', value: (r: any) => STATUS[r.status].label },
          ], data)}>Export</Button>
          {hasRole('RECEPTION', 'MANAGER', 'DOCTOR') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setBook(true)}>Book appointment</Button>}
        </>}
      />
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%' }}>
          <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} format="DD MMM YYYY" allowClear={false}
            presets={[
              { label: 'Today', value: [dayjs(), dayjs()] }, { label: 'Tomorrow', value: [dayjs().add(1, 'day'), dayjs().add(1, 'day')] },
              { label: 'Next 7 days', value: [dayjs(), dayjs().add(6, 'day')] }, { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
            ]} />
          <Input.Search placeholder="Client name / mobile / ID" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 230 }} />
          <Select allowClear placeholder="Status" style={{ width: 140 }} value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          <Select allowClear placeholder="Therapist" style={{ width: 150 }} value={f.therapistId} onChange={(v) => setF({ ...f, therapistId: v })} options={lists.staff.map((s) => ({ value: s.id, label: s.name }))} />
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Treatment" style={{ width: 200 }} value={f.treatmentId} onChange={(v) => setF({ ...f, treatmentId: v })} options={lists.treatments.map((s) => ({ value: s.id, label: s.name }))} />
          <Select allowClear placeholder="Machine" style={{ width: 120 }} value={f.machineId} onChange={(v) => setF({ ...f, machineId: v })} options={lists.machines.map((s) => ({ value: s.id, label: s.code }))} />
          <Select allowClear placeholder="Room" style={{ width: 150 }} value={f.roomId} onChange={(v) => setF({ ...f, roomId: v })} options={lists.rooms.map((s) => ({ value: s.id, label: s.name }))} />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={data} columns={columns} size="middle" scroll={{ x: 1000 }}
          pagination={{ pageSize: 25, showSizeChanger: false, showTotal: (t) => `${t} appointments` }}
          onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })} />
      </Card>
      <AppointmentPanel id={openId} open={!!openId} onClose={() => setOpenId(undefined)} onChanged={reload} />
      <BookingDrawer open={book} onClose={() => setBook(false)} onSaved={reload} />
    </>
  );
}
