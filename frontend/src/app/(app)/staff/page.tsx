'use client';
import { useEffect, useState } from 'react';
import { App, Avatar, Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Table, Tabs, Tag, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { fmtDateTime, initials, ROLE_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/ui';

const ACCESS: Record<string, string> = {
  SUPER_ADMIN: 'Full configuration, users, permissions, audit',
  MANAGER: 'Dashboard, reports, clients, consultations, approvals',
  DOCTOR: 'Assessments, clinical records, plans, follow-up',
  RECEPTION: 'Registration, appointments, packages, billing',
  THERAPIST: 'Own schedule, session records, limited client info',
  ACCOUNTANT: 'Billing, payments, VAT, financial reports',
};

export default function StaffPage() {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { data = [], loading, reload } = useApi<any[]>('/staff', []);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [form] = Form.useForm();
  useEffect(() => { api<any[]>('/treatments').then((t) => setTreatments(t.filter((x) => x.active))).catch(() => {}); }, []);

  const save = async (v: any) => {
    try {
      if (edit.id) await api(`/staff/${edit.id}`, { method: 'PATCH', body: { ...v, password: v.password || undefined } });
      else await api('/staff', { method: 'POST', body: v });
      message.success('Staff saved'); setEdit(null); reload();
    } catch (e) { message.error((e as Error).message); }
  };
  const toggleSkill = async (u: any, treatmentId: string, on: boolean) => {
    const skills = on ? [...u.skills.map((s: any) => s.treatmentId), treatmentId] : u.skills.map((s: any) => s.treatmentId).filter((x: string) => x !== treatmentId);
    try { await api(`/staff/${u.id}`, { method: 'PATCH', body: { skills } }); reload(); } catch (e) { message.error((e as Error).message); }
  };
  const practitioners = data.filter((u) => ['THERAPIST', 'DOCTOR', 'MANAGER'].includes(u.role) && u.active);

  return (
    <>
      <PageHeader crumb="Resources" title="Staff & Qualifications" sub="Individual logins with role-based access. Only qualified staff can be booked for a treatment."
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdit({}); form.setFieldsValue({ role: 'THERAPIST', skills: [] }); }}>Add staff</Button>} />
      <Tabs items={[
        {
          key: 'users', label: 'Users & roles', children: (
            <Card styles={{ body: { padding: 0 } }}>
              <Table rowKey="id" loading={loading} dataSource={data} pagination={false} size="middle"
                columns={[
                  { title: 'Name', render: (_, r) => <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar style={{ background: r.color ?? '#C9B88E' }}>{initials(r.name)}</Avatar><span><b>{r.name}</b><br /><span className="muted" style={{ fontSize: 12 }}>{r.designation}</span></span></span> },
                  { title: 'Role', render: (_, r) => <Tooltip title={ACCESS[r.role]}><Tag color={r.role === 'SUPER_ADMIN' ? 'red' : r.role === 'MANAGER' ? 'gold' : r.role === 'THERAPIST' ? 'blue' : 'default'}>{ROLE_LABEL[r.role]}</Tag></Tooltip> },
                  { title: 'Login', render: (_, r) => <span>{r.email}<br /><span className="muted" style={{ fontSize: 12 }}>{r.phone}</span></span> },
                  { title: 'Qualified for', render: (_, r) => r.skills.length ? `${r.skills.length} treatment(s)` : <span className="muted">—</span> },
                  { title: 'Commission', render: (_, r) => r.commissionPct ? `${Number(r.commissionPct)}%` : '—' },
                  { title: 'Last login', render: (_, r) => r.lastLoginAt ? fmtDateTime(r.lastLoginAt) : '—' },
                  { title: 'Active', render: (_, r) => <Switch size="small" checked={r.active} disabled={r.role === 'SUPER_ADMIN' && !hasRole('SUPER_ADMIN')} onChange={async (active) => { await api(`/staff/${r.id}/active`, { method: 'PATCH', body: { active } }); reload(); }} /> },
                  { title: '', width: 50, render: (_, r) => <Button size="small" type="text" icon={<EditOutlined />} disabled={r.role === 'SUPER_ADMIN' && !hasRole('SUPER_ADMIN')} onClick={() => { setEdit(r); form.setFieldsValue({ ...r, commissionPct: r.commissionPct ? Number(r.commissionPct) : null, skills: r.skills.map((s: any) => s.treatmentId), password: '' }); }} aria-label="Edit" /> },
                ]} />
            </Card>
          ),
        },
        {
          key: 'matrix', label: 'Qualification matrix', children: (
            <Card styles={{ body: { padding: 0 } }}>
              <Table rowKey="id" dataSource={treatments} pagination={false} size="small" scroll={{ x: 900 }}
                columns={[
                  { title: 'Treatment', fixed: 'left', width: 240, render: (_, t) => <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: t.color, marginRight: 6 }} />{t.name}</span> },
                  ...practitioners.map((u) => ({
                    title: <div style={{ textAlign: 'center', lineHeight: 1.2 }}>{u.name}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{u.designation}</div></div>, align: 'center' as const,
                    render: (_: unknown, t: any) => <Checkbox checked={u.skills.some((s: any) => s.treatmentId === t.id)} onChange={(e) => toggleSkill(u, t.id, e.target.checked)} />,
                  })),
                ]} />
            </Card>
          ),
        },
        {
          key: 'roles', label: 'Role permissions', children: (
            <Card>
              <Table rowKey="0" pagination={false} size="small" dataSource={Object.entries(ACCESS)} columns={[{ title: 'Role', render: (_, [r]) => <b>{ROLE_LABEL[r]}</b> }, { title: 'Main system access', render: (_, [, a]) => a }]} />
            </Card>
          ),
        },
      ]} />
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'Add staff member'} okText="Save" onOk={() => form.submit()} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="name" label="Full name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="designation" label="Designation"><Input placeholder="e.g. Female Slimming Technician" /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Login email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="password" label={edit?.id ? 'New password (leave blank to keep)' : 'Password'} rules={edit?.id ? [{ min: 8 }] : [{ required: true, min: 8 }]}><Input.Password /></Form.Item></Col>
            <Col span={8}><Form.Item name="role" label="Role" rules={[{ required: true }]}><Select options={Object.keys(ACCESS).filter((r) => r !== 'SUPER_ADMIN' || hasRole('SUPER_ADMIN')).map((value) => ({ value, label: ROLE_LABEL[value] }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="gender" label="Gender"><Select allowClear options={[{ value: 'Female' }, { value: 'Male' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="commissionPct" label="Commission"><InputNumber min={0} max={100} suffix="%" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={16}><Form.Item name="skills" label="Qualified to deliver"><Select mode="multiple" allowClear options={treatments.map((t) => ({ value: t.id, label: t.name }))} maxTagCount="responsive" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
