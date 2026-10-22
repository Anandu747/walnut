'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Table, Tabs, TimePicker } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { humanize } from '@/lib/format';
import { PageHeader } from '@/components/ui';

export default function SettingsPage() {
  const { message } = App.useApp();
  const { data: s, reload } = useApi<any>('/settings');
  const { data: templates = [], reload: reloadT } = useApi<any[]>('/message-templates', []);
  const [form] = Form.useForm();
  const [tForm] = Form.useForm();
  const [editT, setEditT] = useState<any>(null);

  useEffect(() => {
    if (s) form.setFieldsValue({ ...s, vatRate: Number(s.vatRate), hours: [dayjs().startOf('day').add(s.openMin, 'minute'), dayjs().startOf('day').add(s.closeMin, 'minute')] });
  }, [s, form]);

  const save = async (v: any) => {
    const { hours, ...rest } = v;
    try {
      await api('/settings', { method: 'PATCH', body: { ...rest, openMin: hours[0].hour() * 60 + hours[0].minute(), closeMin: hours[1].hour() * 60 + hours[1].minute() } });
      message.success('Settings saved'); reload();
    } catch (e) { message.error((e as Error).message); }
  };
  const saveT = async (v: any) => {
    try {
      if (editT.id) await api(`/message-templates/${editT.id}`, { method: 'PATCH', body: v }); else await api('/message-templates', { method: 'POST', body: v });
      message.success('Template saved'); setEditT(null); reloadT();
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader crumb="Administration" title="Centre Settings" />
      <Tabs items={[
        {
          key: 'centre', label: 'Centre profile & tax', children: (
            <Card>
              <Form form={form} layout="vertical" onFinish={save}>
                <Row gutter={16}>
                  <Col xs={24} md={12}><Form.Item name="name" label="Legal / trading name" rules={[{ required: true }]}><Input /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="trn" label="VAT TRN (Tax Registration Number)" rules={[{ pattern: /^\d{15}$/, message: 'TRN is 15 digits' }]}><Input placeholder="100XXXXXXXXXXX3" /></Form.Item></Col>
                  <Col xs={24}><Form.Item name="address" label="Address (printed on tax invoices)"><Input /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
                  <Col xs={8} md={4}><Form.Item name="vatRate" label="VAT rate"><InputNumber min={0} max={100} suffix="%" style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={8} md={4}><Form.Item name="invoicePrefix" label="Invoice prefix"><Input maxLength={8} /></Form.Item></Col>
                  <Col xs={8} md={4}><Form.Item label="Currency"><Input value="AED" disabled /></Form.Item></Col>
                  <Col xs={12} md={8}><Form.Item name="hours" label="Working hours" rules={[{ required: true }]}><TimePicker.RangePicker format="HH:mm" minuteStep={15} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={4}><Form.Item name="slotMin" label="Calendar slot"><Select options={[10, 15, 20, 30].map((v) => ({ value: v, label: `${v} min` }))} /></Form.Item></Col>
                </Row>
                <Button type="primary" htmlType="submit">Save settings</Button>
              </Form>
            </Card>
          ),
        },
        {
          key: 'templates', label: 'Message templates', children: (
            <Card title="Approved message templates" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditT({}); tForm.setFieldsValue({ channel: 'WHATSAPP', purpose: 'GENERAL', active: true }); }}>Add template</Button>} styles={{ body: { padding: 0 } }}>
              <Table rowKey="id" dataSource={templates} pagination={false} size="middle"
                columns={[
                  { title: 'Name', dataIndex: 'name', render: (v) => <b>{v}</b> }, { title: 'Purpose', render: (_, r) => humanize(r.purpose) }, { title: 'Channel', render: (_, r) => humanize(r.channel) },
                  { title: 'Text', dataIndex: 'body', render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
                  { title: 'Active', render: (_, r) => <Switch size="small" checked={r.active} onChange={async (active) => { await api(`/message-templates/${r.id}`, { method: 'PATCH', body: { active } }); reloadT(); }} /> },
                  { title: '', render: (_, r) => <Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setEditT(r); tForm.setFieldsValue(r); }} aria-label="Edit" /> },
                ]} />
              <div className="muted" style={{ padding: 12, fontSize: 12 }}>Placeholders: {'{name} {treatment} {date} {time} {package} {expiry} {sessions} {amount} {invoice}'}</div>
            </Card>
          ),
        },
      ]} />
      <Modal open={!!editT} onCancel={() => setEditT(null)} title={editT?.id ? 'Edit template' : 'New template'} onOk={() => tForm.submit()} destroyOnHidden width={600}>
        <Form form={tForm} layout="vertical" onFinish={saveT}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          {!editT?.id && <Row gutter={12}>
            <Col span={12}><Form.Item name="purpose" label="Purpose"><Select options={['REMINDER', 'FOLLOW_UP', 'EXPIRY', 'MARKETING', 'GENERAL'].map((value) => ({ value, label: humanize(value) }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="channel" label="Channel"><Select options={['WHATSAPP', 'SMS', 'EMAIL'].map((value) => ({ value, label: humanize(value) }))} /></Form.Item></Col>
          </Row>}
          <Form.Item name="body" label="Message" rules={[{ required: true, min: 5 }]}><Input.TextArea rows={5} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
