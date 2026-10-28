'use client';
import { useEffect, useState } from 'react';
import { App, AutoComplete, Button, Card, Col, ColorPicker, Divider, Dropdown, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Switch, Table, Tag } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { humanize, money } from '@/lib/format';
import { PageHeader, StatTile } from '@/components/ui';

const CATEGORIES = ['Fat Reduction', 'Muscle Toning', 'Body Contouring', 'Skin Tightening', 'Cellulite & Lymphatic', 'Wellness', 'Consultation'];
const DEFAULTS = { durationMin: 45, bufferMin: 10, price: 0, taxCategory: 'STANDARD', category: 'Body Contouring', active: true, color: '#2a78d6', skills: [] };

export default function TreatmentsPage() {
  const { hasRole } = useAuth();
  const { message, modal } = App.useApp();
  const { data = [], loading, reload } = useApi<any[]>('/treatments', []);
  const [types, setTypes] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [edit, setEdit] = useState<{ id?: string; name?: string; values: any } | null>(null);
  const [newType, setNewType] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [category, setCategory] = useState<string>();
  const [form] = Form.useForm();
  const canEdit = hasRole('MANAGER');
  const loadTypes = () => api<any[]>('/machine-types').then(setTypes).catch(() => {});
  useEffect(() => { loadTypes(); api<any[]>('/staff').then(setStaff).catch(() => {}); }, []);

  // Categories = the standard list plus any custom ones already in use.
  const categories = [...new Set([...CATEGORIES, ...data.map((t) => t.category)])];
  const rows = data.filter((t) =>
    (status === 'all' || (status === 'active') === t.active) && (!category || t.category === category) &&
    (!q || `${t.name} ${t.code ?? ''} ${t.machineType?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  // Values go in as the form's initialValues; the modal is destroyed on close, so each open starts fresh.
  const open = (t: any, copy = false) => setEdit({
    ...(!copy && { id: t.id, name: t.name }),
    values: t.id ? { ...t, price: Number(t.price), skills: t.skills.map((s: any) => s.userId), ...(copy && { name: `${t.name} (copy)`, code: null }) } : DEFAULTS,
  });
  const save = async (v: any) => {
    const body = { ...v, color: typeof v.color === 'string' ? v.color : v.color?.toHexString?.(), machineTypeId: v.machineTypeId ?? null };
    try {
      if (edit!.id) await api(`/treatments/${edit!.id}`, { method: 'PATCH', body }); else await api('/treatments', { method: 'POST', body });
      message.success(edit!.id ? 'Treatment updated' : 'Treatment created'); setEdit(null); reload();
    } catch (e) { message.error((e as Error).message); }
  };
  const toggle = async (t: any, active: boolean) => {
    try { await api(`/treatments/${t.id}`, { method: 'PATCH', body: { active } }); message.success(`${t.name} ${active ? 'activated' : 'deactivated'}`); reload(); } catch (e) { message.error((e as Error).message); }
  };
  const remove = (t: any) => modal.confirm({
    title: `Delete ${t.name}?`, content: 'Only treatments that were never booked or sold can be deleted. Otherwise deactivate it.', okText: 'Delete', okButtonProps: { danger: true },
    onOk: async () => { try { await api(`/treatments/${t.id}`, { method: 'DELETE' }); message.success('Treatment deleted'); reload(); } catch (e) { message.error((e as Error).message); } },
  });
  const addType = async () => {
    try {
      const t = await api<any>('/machine-types', { method: 'POST', body: { name: newType.trim() } });
      await loadTypes(); form.setFieldValue('machineTypeId', t.id); setNewType('');
    } catch (e) { message.error((e as Error).message); }
  };
  const name = (id: string) => staff.find((s) => s.id === id)?.name;
  const qualified = staff.filter((s) => s.active && ['THERAPIST', 'DOCTOR', 'MANAGER'].includes(s.role));

  return (
    <>
      <PageHeader crumb="Resources" title="Treatments & Services" sub="Create and manage treatments: duration, preparation/cleaning buffer, machine, price, VAT and qualified staff"
        extra={canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => open({})}>New treatment</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatTile label="Active treatments" value={data.filter((t) => t.active).length} />
        <StatTile label="Categories" value={new Set(data.map((t) => t.category)).size} />
        <StatTile label="Machine-based" value={data.filter((t) => t.active && t.machineTypeId).length} sub="need a compatible machine" />
        <StatTile label="Inactive" value={data.filter((t) => !t.active).length} sub="hidden from booking & billing" />
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%', justifyContent: 'space-between' }}>
          <Segmented value={status} onChange={(v) => setStatus(String(v))} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
          <Space wrap>
            <Select allowClear placeholder="Category" style={{ width: 190 }} value={category} onChange={setCategory} options={categories.map((value) => ({ value }))} />
            <Input.Search allowClear placeholder="Treatment, code or machine" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          </Space>
        </Space>
        <Table rowKey="id" loading={loading} dataSource={rows} pagination={false} size="middle" scroll={{ x: 1100 }}
          columns={[
            { title: 'Treatment', render: (_, r) => <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: r.color ?? '#ccc', flexShrink: 0 }} /><span><b>{r.name}</b>{r.code && <span className="muted" style={{ fontSize: 12 }}> · {r.code}</span>}</span></span> },
            { title: 'Category', dataIndex: 'category' },
            { title: 'Machine', render: (_, r) => r.machineType?.name ?? <span className="muted">None</span> },
            { title: 'Duration', render: (_, r) => `${r.durationMin} min` },
            { title: 'Buffer', render: (_, r) => `${r.bufferMin} min` },
            { title: 'Price', align: 'right', sorter: (a, b) => Number(a.price) - Number(b.price), render: (_, r) => money(r.price, false) },
            { title: 'VAT', render: (_, r) => r.taxCategory === 'STANDARD' ? '5%' : humanize(r.taxCategory) },
            { title: 'Qualified staff', render: (_, r) => <span style={{ fontSize: 12 }}>{r.skills.map((s: any) => name(s.userId)).filter(Boolean).join(', ') || <Tag color="orange">None — cannot be booked</Tag>}</span> },
            { title: 'Active', width: 70, render: (_, r) => <Switch size="small" checked={r.active} disabled={!canEdit} onChange={(v) => toggle(r, v)} /> },
            ...(canEdit ? [{
              title: '', width: 80, render: (_: unknown, r: any) => (
                <Space size={0}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Edit" />
                  <Dropdown menu={{ items: [
                    { key: 'copy', icon: <CopyOutlined />, label: 'Duplicate', onClick: () => open(r, true) },
                    { key: 'del', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => remove(r) },
                  ] }}><Button size="small" type="text" icon={<MoreOutlined />} aria-label="More" /></Dropdown>
                </Space>
              ),
            }] : []),
          ]} />
      </Card>
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New treatment'} okText={edit?.id ? 'Save' : 'Create treatment'} onOk={() => form.submit()} destroyOnHidden width={680}>
        <Form form={form} layout="vertical" onFinish={save} initialValues={edit?.values}>
          <Row gutter={12}>
            <Col span={16}><Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}><Input placeholder="e.g. Emsculpt NEO – Abdomen" /></Form.Item></Col>
            <Col span={8}><Form.Item name="code" label="Code"><Input placeholder="e.g. EMS-ABD" /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]} extra="Pick one or type a new category">
                <AutoComplete options={categories.map((value) => ({ value }))} showSearch={{ filterOption: (i, o) => String(o?.value).toLowerCase().includes(i.toLowerCase()) }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="machineTypeId" label="Requires machine type">
                <Select allowClear placeholder="None (manual / consultation)" options={types.map((t) => ({ value: t.id, label: t.name }))}
                  popupRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '6px 0' }} />
                      <Space.Compact style={{ width: '100%', padding: '0 6px 6px' }}>
                        <Input size="small" placeholder="New machine type" value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                        <Button size="small" icon={<PlusOutlined />} disabled={!newType.trim()} onClick={addType}>Add</Button>
                      </Space.Compact>
                    </>
                  )} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="durationMin" label="Duration" rules={[{ required: true }]}><InputNumber min={5} max={480} suffix="min" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="bufferMin" label="Prep / cleaning buffer"><InputNumber min={0} max={120} suffix="min" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="price" label="Price (excl. VAT)"><InputNumber min={0} prefix="AED" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="taxCategory" label="VAT treatment" extra="Confirm with your UAE tax adviser"><Select options={[{ value: 'STANDARD', label: 'Standard 5%' }, { value: 'ZERO', label: 'Zero rated' }, { value: 'EXEMPT', label: 'Exempt' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="color" label="Calendar colour"><ColorPicker disabledAlpha /></Form.Item></Col>
            <Col span={8}><Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={24}>
              <Form.Item name="skills" label="Qualified staff" extra="Only these staff can be booked for this treatment">
                <Select mode="multiple" allowClear placeholder="Select therapists / doctors" showSearch={{ optionFilterProp: 'label' }} options={qualified.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
            <Col span={24}><Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
