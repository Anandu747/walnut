'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Tag } from 'antd';
import { EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { money } from '@/lib/format';
import { PageHeader } from '@/components/ui';

export default function PackageCatalogue() {
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { data = [], reload } = useApi<any[]>('/package-templates', []);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const items = Form.useWatch('items', form) ?? [];
  const canEdit = hasRole('MANAGER');
  useEffect(() => { api<any[]>('/treatments').then(setTreatments).catch(() => {}); }, []);

  const listValue = items.reduce((s: number, i: any) => s + (Number(treatments.find((t) => t.id === i?.treatmentId)?.price) || 0) * (i?.sessions || 0), 0);
  const price = Form.useWatch('price', form) ?? 0;

  const openEdit = (t: any) => {
    setEdit(t ?? {});
    form.setFieldsValue(t ? { ...t, price: Number(t.price), items: t.items.map((i: any) => ({ treatmentId: i.treatmentId, sessions: i.sessions })) } : { validityDays: 90, active: true, items: [{ sessions: 6 }] });
  };
  const save = async (v: any) => {
    setSaving(true);
    try {
      if (edit.id) await api(`/package-templates/${edit.id}`, { method: 'PATCH', body: v });
      else await api('/package-templates', { method: 'POST', body: v });
      message.success('Package saved'); setEdit(null); reload();
    } catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader crumb="Packages" title="Package Catalogue" sub="Single-treatment and mixed packages — each treatment keeps its own session balance"
        extra={canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>New package</Button>} />
      <Row gutter={[16, 16]}>
        {data.map((t) => {
          const list = t.items.reduce((s: number, i: any) => s + Number(i.treatment.price) * i.sessions, 0);
          const saving = list > Number(t.price) ? Math.round((1 - Number(t.price) / list) * 100) : 0;
          return (
            <Col xs={24} md={12} xl={8} key={t.id}>
              <Card size="small" style={{ height: '100%', opacity: t.active ? 1 : 0.6 }} title={t.name}
                extra={<Space>{!t.active && <Tag>Inactive</Tag>}{t.items.length > 1 && <Tag color="purple">Mixed</Tag>}{canEdit && <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(t)} aria-label="Edit" />}</Space>}>
                <div className="muted" style={{ fontSize: 12, minHeight: 18 }}>{t.description}</div>
                <div style={{ margin: '10px 0', display: 'grid', gap: 4 }}>
                  {t.items.map((i: any) => (
                    <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: i.treatment.color, marginRight: 6 }} />{i.treatment.name}</span><b>{i.sessions} sessions</b>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #F1EFEA', paddingTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ whiteSpace: 'nowrap' }}><b style={{ fontSize: 20 }}>{money(t.price, false)}</b> <span className="muted" style={{ fontSize: 12 }}>+ VAT</span></span>
                    {saving > 0 && <Tag color="green" style={{ marginInlineEnd: 0 }}>{saving}% off list price</Tag>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Valid {t.validityDays} days · sold {t._count.clientPackages} times</div>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={edit?.id ? 'Edit package' : 'New package'} okText="Save" onOk={() => form.submit()} confirmLoading={saving} width={640} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="Package name" rules={[{ required: true }]}><Input placeholder="e.g. Summer Sculpt: 6 Emsculpt + 4 Onda Pro" /></Form.Item>
          <Form.Item name="description" label="Description"><Input /></Form.Item>
          <div className="section-title">Treatments in this package</div>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="start" style={{ display: 'flex' }}>
                    <Form.Item name={[f.name, 'treatmentId']} rules={[{ required: true, message: 'Pick a treatment' }]} style={{ width: 380 }}>
                      <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Treatment" options={treatments.map((t) => ({ value: t.id, label: `${t.name} (${money(t.price, false)})` }))} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'sessions']} rules={[{ required: true }]}><InputNumber min={1} max={100} suffix="sessions" style={{ width: 140 }} /></Form.Item>
                    {fields.length > 1 && <MinusCircleOutlined style={{ marginTop: 9 }} onClick={() => remove(f.name)} />}
                  </Space>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ sessions: 4 })} block style={{ marginBottom: 16 }}>Add treatment (mixed package)</Button>
              </>
            )}
          </Form.List>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="price" label="Package price (excl. VAT)" rules={[{ required: true }]} extra={listValue ? `List value ${money(listValue, false)}${price && price < listValue ? ` · ${Math.round((1 - price / listValue) * 100)}% saving` : ''}` : undefined}><InputNumber prefix="AED" min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="validityDays" label="Validity" rules={[{ required: true }]}><InputNumber min={1} max={730} suffix="days" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="active" label="Available for sale" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          {edit?.id && <span className="muted" style={{ fontSize: 12 }}>Changes apply to future sales only — packages already sold keep their sessions and price.</span>}
        </Form>
      </Modal>
    </>
  );
}
