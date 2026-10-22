'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Col, ColorPicker, Form, Input, InputNumber, Modal, Row, Select, Switch, Table, Tag } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { humanize, money } from '@/lib/format';
import { PageHeader } from '@/components/ui';

const CATEGORIES = ['Fat Reduction', 'Muscle Toning', 'Body Contouring', 'Skin Tightening', 'Cellulite & Lymphatic', 'Wellness', 'Consultation'];

export default function TreatmentsPage() {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { data = [], loading, reload } = useApi<any[]>('/treatments', []);
  const [types, setTypes] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [form] = Form.useForm();
  const canEdit = hasRole('MANAGER');
  useEffect(() => { api<any[]>('/machine-types').then(setTypes).catch(() => {}); api<any[]>('/staff').then(setStaff).catch(() => {}); }, []);

  const save = async (v: any) => {
    const body = { ...v, color: typeof v.color === 'string' ? v.color : v.color?.toHexString?.(), machineTypeId: v.machineTypeId ?? null };
    try {
      if (edit.id) await api(`/treatments/${edit.id}`, { method: 'PATCH', body }); else await api('/treatments', { method: 'POST', body });
      message.success('Saved'); setEdit(null); reload();
    } catch (e) { message.error((e as Error).message); }
  };
  const name = (id: string) => staff.find((s) => s.id === id)?.name;

  return (
    <>
      <PageHeader crumb="Resources" title="Treatments & Services" sub="Duration, preparation/cleaning buffer, compatible machine type, price and VAT treatment"
        extra={canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdit({}); form.setFieldsValue({ durationMin: 45, bufferMin: 10, price: 0, taxCategory: 'STANDARD', category: 'Body Contouring', active: true, color: '#2a78d6' }); }}>Add treatment</Button>} />
      <Card styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" loading={loading} dataSource={data} pagination={false} size="middle" scroll={{ x: 1000 }}
          columns={[
            { title: 'Treatment', render: (_, r) => <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: r.color ?? '#ccc' }} /><b>{r.name}</b>{!r.active && <Tag>Inactive</Tag>}</span> },
            { title: 'Category', dataIndex: 'category', filters: CATEGORIES.map((c) => ({ text: c, value: c })), onFilter: (v, r) => r.category === v },
            { title: 'Machine', render: (_, r) => r.machineType?.name ?? <span className="muted">None</span> },
            { title: 'Duration', render: (_, r) => `${r.durationMin} min` },
            { title: 'Buffer', render: (_, r) => `${r.bufferMin} min` },
            { title: 'Price', align: 'right', render: (_, r) => money(r.price, false) },
            { title: 'VAT', render: (_, r) => r.taxCategory === 'STANDARD' ? '5%' : humanize(r.taxCategory) },
            { title: 'Qualified staff', render: (_, r) => <span style={{ fontSize: 12 }}>{r.skills.map((s: any) => name(s.userId)).filter(Boolean).join(', ') || '—'}</span> },
            ...(canEdit ? [{ title: '', width: 50, render: (_: unknown, r: any) => <Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setEdit(r); form.setFieldsValue({ ...r, price: Number(r.price) }); }} aria-label="Edit" /> }] : []),
          ]} />
      </Card>
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'Add treatment'} okText="Save" onOk={() => form.submit()} destroyOnHidden width={620}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={16}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="code" label="Code"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="category" label="Category"><Select options={CATEGORIES.map((value) => ({ value }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="machineTypeId" label="Requires machine type"><Select allowClear placeholder="None (manual / consultation)" options={types.map((t) => ({ value: t.id, label: t.name }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="durationMin" label="Duration" rules={[{ required: true }]}><InputNumber min={5} max={480} suffix="min" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="bufferMin" label="Prep / cleaning buffer"><InputNumber min={0} max={120} suffix="min" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="price" label="Price (excl. VAT)"><InputNumber min={0} prefix="AED" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="taxCategory" label="VAT treatment" extra="Confirm with your UAE tax adviser"><Select options={[{ value: 'STANDARD', label: 'Standard 5%' }, { value: 'ZERO', label: 'Zero rated' }, { value: 'EXEMPT', label: 'Exempt' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="color" label="Calendar colour"><ColorPicker disabledAlpha /></Form.Item></Col>
            <Col span={8}><Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={24}><Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
