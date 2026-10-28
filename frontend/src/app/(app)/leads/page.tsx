'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, Badge, Button, Card, Col, DatePicker, Dropdown, Form, Input, Modal, Row, Segmented, Select, Space, Table, Tag } from 'antd';
import { AppstoreOutlined, GiftOutlined, MoreOutlined, PhoneOutlined, PlusOutlined, UnorderedListOutlined, UploadOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtDate, SOURCES } from '@/lib/format';
import { PageHeader, StatTile } from '@/components/ui';
import OfferSelect, { loadOffers } from '@/components/OfferSelect';

const STAGES = [
  { key: 'NEW', label: 'New enquiry', color: '#E0A800' }, { key: 'CONTACTED', label: 'Contacted', color: '#2a78d6' },
  { key: 'CONSULT_BOOKED', label: 'Consultation booked', color: '#6250d6' }, { key: 'CONVERTED', label: 'Converted', color: '#2E8B57' }, { key: 'LOST', label: 'Lost', color: '#A8A49B' },
];

function LeadsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();
  const { data = [], reload } = useApi<any[]>('/leads', []);
  const [edit, setEdit] = useState<any>(params.get('new') ? {} : null);
  const [form] = Form.useForm();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [offer, setOffer] = useState<string>();
  const [q, setQ] = useState('');
  useEffect(() => { if (edit) form.setFieldsValue({ source: 'Instagram', status: 'NEW', ...edit, nextActionAt: edit.nextActionAt ? dayjs(edit.nextActionAt) : dayjs().add(1, 'day') }); }, [edit, form]);

  const move = async (l: any, status: string) => {
    try { await api(`/leads/${l.id}`, { method: 'PATCH', body: { status } }); reload(); } catch (e) { message.error((e as Error).message); }
  };
  const save = async (v: any) => {
    try {
      const body = { ...v, nextActionAt: v.nextActionAt?.toISOString() };
      if (edit.id) await api(`/leads/${edit.id}`, { method: 'PATCH', body }); else await api('/leads', { method: 'POST', body });
      message.success('Lead saved'); setEdit(null); reload(); loadOffers(true);
    } catch (e) { message.error((e as Error).message); }
  };
  const convert = (l: any) => router.push(`/clients/new?${new URLSearchParams({ leadId: l.id, name: l.name, mobile: l.mobile, ...(l.gender && { gender: l.gender }), ...(l.offer && { offer: l.offer }), source: l.source })}`);
  const stage = (k: string) => STAGES.find((x) => x.key === k)!;
  const offers = [...new Set(data.map((l) => l.offer).filter(Boolean))].sort() as string[];
  const shown = data.filter((l) => (!offer || l.offer === offer) && (!q || `${l.name} ${l.mobile}`.toLowerCase().includes(q.toLowerCase())));
  const month = data.filter((l) => dayjs(l.createdAt).isAfter(dayjs().startOf('month')));
  const conv = data.filter((l) => l.status === 'CONVERTED').length, closed = conv + data.filter((l) => l.status === 'LOST').length;

  return (
    <>
      <PageHeader crumb="Clients" title="Leads & Enquiries" sub="Track Instagram, Google and walk-in enquiries until they become clients"
        extra={<>
          <Button icon={<UploadOutlined />} onClick={() => router.push('/settings/import?type=leads')}>Import</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEdit({})}>Add enquiry</Button>
        </>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Enquiries this month" value={month.length} />
        <StatTile label="Open pipeline" value={data.filter((l) => !['CONVERTED', 'LOST'].includes(l.status)).length} />
        <StatTile label="Conversion rate" value={closed ? `${Math.round((conv / closed) * 100)}%` : '—'} sub="converted ÷ closed" />
        <StatTile label="Action due today" value={data.filter((l) => l.nextActionAt && !['CONVERTED', 'LOST'].includes(l.status) && dayjs(l.nextActionAt).isBefore(dayjs().endOf('day'))).length} />
      </div>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Segmented value={view} onChange={(v) => setView(v as typeof view)} options={[{ value: 'board', label: 'Board', icon: <AppstoreOutlined /> }, { value: 'list', label: 'List', icon: <UnorderedListOutlined /> }]} />
        <Space wrap>
          <Select allowClear placeholder="Marketing offer" style={{ width: 280 }} value={offer} onChange={setOffer} options={offers.map((value) => ({ value, label: `${value} (${data.filter((l) => l.offer === value).length})` }))} />
          <Input.Search allowClear placeholder="Name or mobile" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        </Space>
      </Space>
      {view === 'list' ? (
        <Card styles={{ body: { padding: 0 } }}>
          <Table rowKey="id" dataSource={shown} size="middle" pagination={{ pageSize: 20 }} scroll={{ x: 900 }} onRow={(l) => ({ onClick: () => setEdit(l), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Name', render: (_, l) => <div><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{l.mobile}</div></div> },
              { title: 'Source', dataIndex: 'source', render: (v) => <Tag>{v}</Tag> },
              { title: 'Offer selected', dataIndex: 'offer', render: (v) => v ? <Tag color="magenta" icon={<GiftOutlined />}>{v}</Tag> : <span className="muted">—</span> },
              { title: 'Interested in', dataIndex: 'interest', render: (v) => v ?? '—' },
              { title: 'Stage', render: (_, l) => <Tag color={stage(l.status).color}>{stage(l.status).label}</Tag> },
              { title: 'Next action', render: (_, l) => l.nextActionAt && !['CONVERTED', 'LOST'].includes(l.status) ? fmtDate(l.nextActionAt) : '—' },
              { title: 'Enquired', sorter: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt), render: (_, l) => fmtDate(l.createdAt) },
            ]} />
        </Card>
      ) : (
      <Row gutter={12} wrap={false} style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {STAGES.map((s) => {
          const items = shown.filter((l) => l.status === s.key);
          return (
            <Col key={s.key} flex="1 0 240px">
              <div style={{ background: '#EFEDE7', borderRadius: 12, padding: 10, minHeight: 360 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 10px' }}>
                  <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />{s.label}</b>
                  <Badge count={items.length} showZero color="#8A867E" />
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {items.map((l) => (
                    <Card key={l.id} size="small" hoverable onClick={() => setEdit(l)} styles={{ body: { padding: 10 } }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <b>{l.name}</b>
                        <Dropdown menu={{ items: [...STAGES.filter((x) => x.key !== l.status).map((x) => ({ key: x.key, label: `Move to ${x.label}`, onClick: (e: any) => { e.domEvent.stopPropagation(); move(l, x.key); } })), ...(l.status !== 'CONVERTED' ? [{ type: 'divider' as const }, { key: 'conv', icon: <UserAddOutlined />, label: 'Register as client', onClick: (e: any) => { e.domEvent.stopPropagation(); convert(l); } }] : [])] }}>
                          <Button size="small" type="text" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} aria-label="Actions" />
                        </Dropdown>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}><PhoneOutlined /> {l.mobile}</div>
                      {l.interest && <div style={{ fontSize: 13, marginTop: 4 }}>{l.interest}</div>}
                      {l.offer && <Tag color="magenta" icon={<GiftOutlined />} style={{ marginTop: 4, whiteSpace: 'normal' }}>{l.offer}</Tag>}
                      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Tag>{l.source}</Tag>
                        {l.nextActionAt && !['CONVERTED', 'LOST'].includes(l.status) && <span style={{ fontSize: 12, color: dayjs(l.nextActionAt).isBefore(dayjs(), 'day') ? '#C8372D' : '#8A867E' }}>next: {fmtDate(l.nextActionAt)}</span>}
                      </div>
                      {l.notes && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{l.notes}</div>}
                    </Card>
                  ))}
                </div>
              </div>
            </Col>
          );
        })}
      </Row>
      )}
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={edit?.id ? 'Edit enquiry' : 'New enquiry'} okText="Save" onOk={() => form.submit()} destroyOnHidden
        footer={(_, { OkBtn, CancelBtn }) => <>{edit?.id && edit.status !== 'CONVERTED' && <Button icon={<UserAddOutlined />} onClick={() => convert(edit)} style={{ float: 'left' }}>Register as client</Button>}<CancelBtn /><OkBtn /></>}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="mobile" label="Mobile" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="gender" label="Gender"><Select allowClear options={[{ value: 'Female' }, { value: 'Male' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="source" label="Source"><Select options={SOURCES.map((value) => ({ value }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="status" label="Stage"><Select options={STAGES.map((s) => ({ value: s.key, label: s.label }))} /></Form.Item></Col>
            <Col span={16}><Form.Item name="interest" label="Interested in"><Input placeholder="e.g. Emsculpt for abdomen" /></Form.Item></Col>
            <Col span={8}><Form.Item name="nextActionAt" label="Next action"><DatePicker style={{ width: '100%' }} format="DD MMM" /></Form.Item></Col>
            <Col span={24}><Form.Item name="offer" label="Marketing offer selected"><OfferSelect /></Form.Item></Col>
            <Col span={24}><Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

export default function LeadsPage() {
  return <Suspense><LeadsInner /></Suspense>;
}
