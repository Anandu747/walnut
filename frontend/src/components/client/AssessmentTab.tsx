'use client';
import { useState } from 'react';
import { App, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Row, Segmented, Table, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { clean, fmtDate } from '@/lib/format';
import { SERIES } from '@/lib/theme';
import { LineChart } from '../charts';

// [field, label, unit, lowerIsBetter]
export const METRICS: [string, string, string, boolean][] = [
  ['weightKg', 'Weight', 'kg', true], ['bmi', 'BMI', '', true], ['bodyFatPct', 'Body fat', '%', true], ['muscleMassKg', 'Muscle mass', 'kg', false],
  ['visceralFat', 'Visceral fat', 'lvl', true], ['bodyWaterPct', 'Body water', '%', false], ['bmrKcal', 'BMR', 'kcal', false], ['metabolicAge', 'Metabolic age', 'yrs', true],
  ['waistCm', 'Waist', 'cm', true], ['abdomenCm', 'Abdomen', 'cm', true], ['hipCm', 'Hip', 'cm', true], ['chestCm', 'Chest', 'cm', true], ['armCm', 'Arm', 'cm', true], ['thighCm', 'Thigh', 'cm', true],
];
const INPUTS = METRICS.filter(([k]) => k !== 'bmi');
const withBmi = (m: any) => ({ ...m, bmi: m.weightKg && m.heightCm ? Math.round((m.weightKg / (m.heightCm / 100) ** 2) * 10) / 10 : null });

export default function AssessmentTab({ client, onChanged, canEdit }: { client: any; onChanged: () => void; canEdit: boolean }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metric, setMetric] = useState('weightKg');
  const [form] = Form.useForm();
  const rows = client.measurements.map(withBmi);
  const base = rows[0], last = rows[rows.length - 1], prev = rows[rows.length - 2];

  const save = async (v: any) => {
    setSaving(true);
    try {
      await api(`/clients/${client.id}/measurements`, { method: 'POST', body: clean({ ...v, recordedAt: v.recordedAt?.toISOString() }) });
      message.success('Measurements saved');
      setOpen(false); form.resetFields(); onChanged();
    } catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };

  const delta = (key: string, lowerBetter: boolean, from: any, unit: string) => {
    if (!from || from[key] == null || last?.[key] == null) return <span className="muted">—</span>;
    const d = Math.round((last[key] - from[key]) * 10) / 10;
    if (d === 0) return <span className="muted">no change</span>;
    const good = d < 0 === lowerBetter;
    return <span className={good ? 'delta-up' : 'delta-down'}>{d < 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {Math.abs(d)} {unit}</span>;
  };

  const metricDef = METRICS.find((m) => m[0] === metric)!;
  const target = metric === 'weightKg' ? client.targetWeightKg : null;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <span className="muted">{rows.length} assessment(s) · baseline {base ? fmtDate(base.recordedAt) : '—'} · latest {last ? fmtDate(last.recordedAt) : '—'}</span>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.setFieldsValue({ heightCm: last?.heightCm, source: 'ANALYZER', recordedAt: dayjs() }); setOpen(true); }}>Record measurements</Button>}
      </div>
      {!rows.length ? <Card><Empty description="No body composition recorded yet" /></Card> : (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={10}>
            <Card title="Progress since baseline" size="small">
              <Table size="small" pagination={false} rowKey={(r) => r[0]} dataSource={METRICS.filter(([k]) => last?.[k] != null)}
                columns={[
                  { title: 'Measure', render: (_, [, label, unit]) => `${label}${unit ? ` (${unit})` : ''}` },
                  { title: 'Baseline', align: 'right', render: (_, [k]) => base?.[k] ?? '—' },
                  { title: 'Latest', align: 'right', render: (_, [k]) => <b>{last?.[k] ?? '—'}</b> },
                  { title: 'Since baseline', align: 'right', render: (_, [k, , unit, lb]) => delta(k, lb, base, unit) },
                  { title: 'Since last', align: 'right', render: (_, [k, , unit, lb]) => delta(k, lb, prev, unit) },
                ]} />
            </Card>
          </Col>
          <Col xs={24} xl={14}>
            <Card size="small" title="Trend" extra={<Segmented size="small" value={metric} onChange={(v) => setMetric(String(v))}
              options={[['weightKg', 'Weight'], ['bodyFatPct', 'Body fat'], ['waistCm', 'Waist'], ['muscleMassKg', 'Muscle'], ['visceralFat', 'Visceral']].map(([value, label]) => ({ value, label }))} />}>
              <div style={{ fontSize: 13, marginBottom: 8 }} className="muted">{metricDef[1]} ({metricDef[2]}) — {metricDef[3] ? 'lower is better' : 'higher is better'}</div>
              <LineChart data={rows} x="recordedAt" y={metric} color={metric === 'weightKg' ? SERIES.gold : SERIES.blue} height={260} xFormat={(s) => dayjs(s).format('DD MMM')} format={(v) => `${v}`} target={target} />
            </Card>
          </Col>
          <Col span={24}>
            <Card size="small" title="Measurement history">
              <Table size="small" rowKey="id" scroll={{ x: 1300 }} pagination={{ pageSize: 8 }} dataSource={[...rows].reverse()}
                columns={[
                  { title: 'Date', fixed: 'left', render: (_, r: any) => <span>{fmtDate(r.recordedAt)} {r.source === 'ANALYZER' && <Tag color="blue" style={{ marginLeft: 4 }}>Analyzer</Tag>}</span> },
                  ...METRICS.map(([k, label, unit]) => ({ title: `${label}${unit ? ` ${unit}` : ''}`, dataIndex: k, align: 'right' as const, render: (v: any) => v ?? '—' })),
                ]} />
            </Card>
          </Col>
        </Row>
      )}
      <Modal open={open} onCancel={() => setOpen(false)} title="Record body composition & measurements" okText="Save" onOk={() => form.submit()} confirmLoading={saving} width={760} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="recordedAt" label="Date & time"><DatePicker showTime format="DD MMM YYYY HH:mm" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="source" label="Source"><Segmented block options={[{ value: 'ANALYZER', label: 'Body analyzer' }, { value: 'MANUAL', label: 'Manual' }]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="heightCm" label="Height (cm)"><InputNumber min={100} max={230} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <div className="section-title">Analyzer outputs</div>
          <Row gutter={12}>
            {INPUTS.slice(0, 7).map(([k, label, unit]) => <Col span={6} key={k}><Form.Item name={k} label={`${label}${unit ? ` (${unit})` : ''}`}><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>)}
          </Row>
          <div className="section-title">Circumferences (cm)</div>
          <Row gutter={12}>
            {INPUTS.slice(7).map(([k, label]) => <Col span={4} key={k}><Form.Item name={k} label={label}><InputNumber min={0} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>)}
          </Row>
          <Form.Item name="notes" label="Notes"><Input placeholder="e.g. measured after fasting, morning" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
