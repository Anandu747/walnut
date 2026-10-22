'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Col, DatePicker, Form, Input, Modal, Row, Select, Table, Tag, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined, ToolOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { fmtDate, humanize } from '@/lib/format';
import { PageHeader, StatTile } from '@/components/ui';
import { MeterList } from '@/components/charts';
import { SERIES } from '@/lib/theme';
import DowntimeModal from '@/components/DowntimeModal';

const COLOR: Record<string, string> = { OPERATIONAL: 'green', MAINTENANCE: 'orange', OUT_OF_SERVICE: 'red' };

export default function MachinesPage() {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { data = [], loading, reload } = useApi<any[]>('/machines', []);
  const [types, setTypes] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [util, setUtil] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [down, setDown] = useState<any>(null);
  const [form] = Form.useForm();
  const canEdit = hasRole('MANAGER');

  useEffect(() => {
    api<any[]>('/machine-types').then(setTypes).catch(() => {});
    api<any[]>('/rooms').then(setRooms).catch(() => {});
    if (hasRole('MANAGER', 'ACCOUNTANT')) api<any[]>(`/reports/machine-utilisation?from=${dayjs().subtract(29, 'day').format('YYYY-MM-DD')}&to=${dayjs().add(1, 'day').format('YYYY-MM-DD')}`).then(setUtil).catch(() => {});
  }, [hasRole]);

  const save = async (v: any) => {
    const body = { ...v, ...Object.fromEntries(['installedAt', 'lastServiceAt', 'nextServiceAt'].map((k) => [k, v[k] ? v[k].toISOString() : null])) };
    try {
      if (edit.id) await api(`/machines/${edit.id}`, { method: 'PATCH', body }); else await api('/machines', { method: 'POST', body });
      message.success('Machine saved'); setEdit(null); reload();
    } catch (e) { message.error((e as Error).message); }
  };
  const openEdit = (m: any) => {
    setEdit(m ?? {});
    form.setFieldsValue(m ? { ...m, installedAt: m.installedAt && dayjs(m.installedAt), lastServiceAt: m.lastServiceAt && dayjs(m.lastServiceAt), nextServiceAt: m.nextServiceAt && dayjs(m.nextServiceAt) } : { status: 'OPERATIONAL' });
  };
  const utilOf = (code: string) => util.find((u) => u.code === code);
  const serviceDue = data.filter((m) => m.nextServiceAt && dayjs(m.nextServiceAt).diff(dayjs(), 'day') <= 14).length;

  return (
    <>
      <PageHeader crumb="Resources" title="Machines & Equipment" sub="Every physical unit is registered individually and booked as its own resource"
        extra={<>
          <Button icon={<ToolOutlined />} onClick={() => setDown({ kind: 'MACHINE' })}>Schedule downtime</Button>
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Add machine</Button>}
        </>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Machines" value={data.length} sub={`${types.length} machine types`} />
        <StatTile label="Operational" value={data.filter((m) => m.status === 'OPERATIONAL').length} />
        <StatTile label="In maintenance / out of service" value={data.filter((m) => m.status !== 'OPERATIONAL').length} />
        <StatTile label="Service due ≤ 14 days" value={serviceDue} />
      </div>
      <Row gutter={16}>
        <Col xs={24} xl={util.length ? 17 : 24}>
          <Card styles={{ body: { padding: 0 } }}>
            <Table rowKey="id" loading={loading} dataSource={data} pagination={false} size="middle" scroll={{ x: 900 }}
              columns={[
                { title: 'Code', dataIndex: 'code', render: (v, r) => <div><b>{v}</b><div className="muted" style={{ fontSize: 12 }}>{r.type.name}</div></div> },
                { title: 'Brand / serial', render: (_, r) => <div>{r.brand ?? '—'}<div className="muted" style={{ fontSize: 12 }}>{r.serialNo ?? '—'}</div></div> },
                { title: 'Room', render: (_, r) => r.room?.name ?? '—' },
                { title: 'Last service', render: (_, r) => fmtDate(r.lastServiceAt) },
                { title: 'Next service', render: (_, r) => { if (!r.nextServiceAt) return '—'; const d = dayjs(r.nextServiceAt).diff(dayjs(), 'day'); return <span>{fmtDate(r.nextServiceAt)}{d <= 14 && <Tag color={d < 0 ? 'red' : 'orange'} style={{ marginLeft: 6 }}>{d < 0 ? 'overdue' : `${d}d`}</Tag>}</span>; } },
                ...(util.length ? [{ title: '30-day utilisation', render: (_: unknown, r: any) => { const u = utilOf(r.code); return u ? <Tooltip title={`${Math.round(u.actualMinutes / 60)}h treatments · ${u.idleHours}h idle · ${Math.round(u.downtimeMinutes / 60)}h downtime`}><span className="tabular">{u.actualUtilisationPct}%</span></Tooltip> : '—'; } }] : []),
                {
                  title: 'Status', render: (_, r) => canEdit ? (
                    <Select size="small" value={r.status} style={{ width: 150 }} onChange={async (status) => { await api(`/machines/${r.id}/status`, { method: 'PATCH', body: { status } }); message.success(`${r.code} is now ${humanize(status)}`); reload(); }}
                      options={['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE'].map((s) => ({ value: s, label: humanize(s) }))} />
                  ) : <Tag color={COLOR[r.status]}>{humanize(r.status)}</Tag>,
                },
                { title: '', width: 90, render: (_, r) => <span><Tooltip title="Schedule downtime"><Button size="small" type="text" icon={<ToolOutlined />} onClick={() => setDown({ kind: 'MACHINE', resourceId: r.id })} /></Tooltip>{canEdit && <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} aria-label="Edit" />}</span> },
              ]} />
            {data.some((m) => m.notes) && <div style={{ padding: 12 }}>{data.filter((m) => m.notes).map((m) => <div key={m.id} className="muted" style={{ fontSize: 12 }}><b>{m.code}:</b> {m.notes}</div>)}</div>}
          </Card>
        </Col>
        {util.length > 0 && (
          <Col xs={24} xl={7}>
            <Card title="Utilisation · last 30 days" size="small">
              <MeterList color={SERIES.blue} warnAt={85} rows={util.map((u) => ({ label: u.code, value: u.actualUtilisationPct, note: `${u.sessions} sessions` }))} />
            </Card>
          </Col>
        )}
      </Row>
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={edit?.id ? `Edit ${edit.code}` : 'Add machine'} okText="Save" onOk={() => form.submit()} destroyOnHidden width={620}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="code" label="System reference" rules={[{ required: true }]}><Input placeholder="EMS-03" /></Form.Item></Col>
            <Col span={16}><Form.Item name="machineTypeId" label="Machine type" rules={[{ required: true }]}><Select options={types.map((t) => ({ value: t.id, label: t.name }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="brand" label="Brand / model"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="serialNo" label="Serial number"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="roomId" label="Home room"><Select allowClear options={rooms.map((r) => ({ value: r.id, label: r.name }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="status" label="Status"><Select options={['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE'].map((s) => ({ value: s, label: humanize(s) }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="installedAt" label="Installed"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="lastServiceAt" label="Last service"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="nextServiceAt" label="Next service"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={24}><Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
      <DowntimeModal init={down} onClose={() => setDown(null)} onSaved={reload} />
    </>
  );
}
