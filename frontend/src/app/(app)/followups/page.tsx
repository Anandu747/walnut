'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, DatePicker, Dropdown, Form, Input, Modal, Segmented, Select, Space, Table, Tag } from 'antd';
import { CalendarOutlined, CheckOutlined, MoreOutlined, PlusOutlined, WhatsAppOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtDate } from '@/lib/format';
import { ClientCell, PageHeader, StatTile } from '@/components/ui';
import BookingDrawer, { BookingInit } from '@/components/BookingDrawer';
import ClientSelect from '@/components/ClientSelect';

const TYPE: Record<string, { label: string; color: string; purpose: string }> = {
  REVIEW: { label: 'Doctor review', color: 'blue', purpose: 'FOLLOW_UP' }, PACKAGE_EXPIRY: { label: 'Package expiry', color: 'orange', purpose: 'EXPIRY' },
  PAYMENT_DUE: { label: 'Payment due', color: 'red', purpose: 'GENERAL' }, CALLBACK: { label: 'Call back', color: 'purple', purpose: 'GENERAL' },
};

export default function FollowUps() {
  const { message } = App.useApp();
  const [bucket, setBucket] = useState('overdue');
  const [type, setType] = useState<string>();
  const status = bucket === 'done' ? 'DONE' : 'OPEN';
  const { data = [], loading, reload } = useApi<any[]>(`/followups?status=${status}&bucket=${bucket === 'done' ? 'all' : bucket}${type ? `&type=${type}` : ''}`, []);
  const { data: all = [], reload: reloadAll } = useApi<any[]>('/followups?status=OPEN&bucket=week', []);
  const [done, setDone] = useState<any>(null);
  const [add, setAdd] = useState(false);
  const [book, setBook] = useState<BookingInit | null>(null);
  const [consultId, setConsultId] = useState<string>();
  const [form] = Form.useForm();
  useEffect(() => { api<any[]>('/treatments').then((t) => setConsultId(t.find((x) => x.category === 'Consultation' && /consult/i.test(x.name))?.id)).catch(() => {}); }, []);

  const refresh = () => { reload(); reloadAll(); };
  const patch = async (id: string, body: any, msg: string) => {
    try { await api(`/followups/${id}`, { method: 'PATCH', body }); message.success(msg); refresh(); } catch (e) { message.error((e as Error).message); }
  };
  const today = dayjs().startOf('day');
  const overdue = all.filter((f) => dayjs(f.dueDate).isBefore(today)).length;
  const dueToday = all.filter((f) => dayjs(f.dueDate).isSame(today, 'day')).length;

  return (
    <>
      <PageHeader crumb="Clients" title="Follow-ups & Reviews" sub="15-day doctor reviews, package expiries, unpaid balances and call-backs — generated automatically"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ dueDate: dayjs().add(1, 'day'), type: 'CALLBACK' }); setAdd(true); }}>Add task</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Overdue" value={<span style={{ color: overdue ? '#C8372D' : undefined }}>{overdue}</span>} onClick={() => setBucket('overdue')} />
        <StatTile label="Due today" value={dueToday} onClick={() => setBucket('today')} />
        <StatTile label="Due within 7 days" value={all.length} onClick={() => setBucket('week')} />
        <StatTile label="Reviews due (7 days)" value={all.filter((f) => f.type === 'REVIEW').length} sub="doctor progress reviews" />
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%' }}>
          <Segmented value={bucket} onChange={(v) => setBucket(String(v))} options={[{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Next 7 days' }, { value: 'all', label: 'All open' }, { value: 'done', label: 'Completed' }]} />
          <Select allowClear placeholder="Task type" style={{ width: 170 }} value={type} onChange={setType} options={Object.entries(TYPE).map(([value, t]) => ({ value, label: t.label }))} />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={data} size="middle" pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Client', render: (_, r) => <ClientCell client={r.client} sub={`${r.client.clientNo} · ${r.client.mobile}`} /> },
            { title: 'Task', render: (_, r) => <div><Tag color={TYPE[r.type].color}>{TYPE[r.type].label}</Tag> {r.title}{r.notes && <div className="muted" style={{ fontSize: 12 }}>{r.notes}</div>}{r.outcome && <div style={{ fontSize: 12 }}>Outcome: {r.outcome}</div>}</div> },
            {
              title: 'Due', sorter: (a, b) => +new Date(a.dueDate) - +new Date(b.dueDate), render: (_, r) => {
                const d = today.diff(dayjs(r.dueDate).startOf('day'), 'day');
                return <span>{fmtDate(r.dueDate)}{r.status === 'OPEN' && d > 0 && <Tag color="red" style={{ marginLeft: 6 }}>{d}d overdue</Tag>}{r.status === 'OPEN' && d === 0 && <Tag color="gold" style={{ marginLeft: 6 }}>today</Tag>}</span>;
              },
            },
            { title: 'Owner', dataIndex: 'assignedTo', render: (v) => v ?? '—' },
            {
              title: '', width: 260, render: (_, r) => r.status !== 'OPEN' ? <Tag>{r.status === 'DONE' ? 'Done' : 'Skipped'} {fmtDate(r.completedAt)}</Tag> : (
                <Space>
                  {r.type === 'REVIEW' && consultId && <Button size="small" icon={<CalendarOutlined />} onClick={() => setBook({ clientId: r.client.id, treatmentId: consultId })}>Book review</Button>}
                  <Link href={`/messages?clientId=${r.client.id}&purpose=${TYPE[r.type].purpose}`}><Button size="small" icon={<WhatsAppOutlined style={{ color: '#25D366' }} />} disabled={!r.client.whatsappOptIn} aria-label="WhatsApp" /></Link>
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => { form.resetFields(); setDone(r); }}>Done</Button>
                  <Dropdown menu={{
                    items: [
                      { key: '3', label: 'Snooze 3 days', onClick: () => patch(r.id, { dueDate: dayjs().add(3, 'day').toISOString() }, 'Snoozed 3 days') },
                      { key: '7', label: 'Snooze 1 week', onClick: () => patch(r.id, { dueDate: dayjs().add(7, 'day').toISOString() }, 'Snoozed 1 week') },
                      { key: 'skip', label: 'Skip (not needed)', danger: true, onClick: () => patch(r.id, { status: 'SKIPPED', outcome: 'Skipped' }, 'Task skipped') },
                    ],
                  }}><Button size="small" icon={<MoreOutlined />} aria-label="More" /></Dropdown>
                </Space>
              ),
            },
          ]} />
      </Card>
      <Modal open={!!done} onCancel={() => setDone(null)} title={`Complete: ${done?.title}`} okText="Mark done" destroyOnHidden
        onOk={() => form.validateFields().then((v) => { patch(done.id, { status: 'DONE', outcome: v.outcome }, 'Task completed'); setDone(null); })}>
        <Form form={form} layout="vertical">
          <Form.Item name="outcome" label="Outcome" rules={[{ required: true }]}>
            <Select options={['Review booked', 'Called — client will book', 'Payment collected', 'Package renewed', 'Package extended', 'Client not interested', 'No answer — left WhatsApp'].map((value) => ({ value }))} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={add} onCancel={() => setAdd(false)} title="New follow-up task" okText="Create" destroyOnHidden
        onOk={() => form.validateFields().then(async (v) => {
          try { await api('/followups', { method: 'POST', body: { ...v, dueDate: v.dueDate.toISOString() } }); message.success('Task created'); setAdd(false); refresh(); } catch (e) { message.error((e as Error).message); }
        })}>
        <Form form={form} layout="vertical">
          <Form.Item name="clientId" label="Client" rules={[{ required: true }]}><ClientSelect /></Form.Item>
          <Form.Item name="type" label="Type"><Select options={Object.entries(TYPE).map(([value, t]) => ({ value, label: t.label }))} /></Form.Item>
          <Form.Item name="title" label="Task" rules={[{ required: true }]}><Input placeholder="e.g. Call back about Bridal Sculpt pricing" /></Form.Item>
          <Form.Item name="dueDate" label="Due date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
      <BookingDrawer open={!!book} onClose={() => setBook(null)} init={book ?? undefined} onSaved={refresh} />
    </>
  );
}
