'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar, Button, Card, Col, DatePicker, Descriptions, Empty, Row, Select, Skeleton, Table, Tag } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtDate, fmtDateTime, fmtTime, initials, money, num } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { rangePresets, rangeQuery } from '@/lib/ranges';
import { SERIES } from '@/lib/theme';
import { PageHeader, StatTile, StatusTag } from '@/components/ui';
import { ColumnChart } from '@/components/charts';

function TherapistInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [staff, setStaff] = useState<any[]>([]);
  const [id, setId] = useState<string | undefined>(params.get('id') ?? undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const { data: d, loading } = useApi<any>(id ? `/reports/therapist/${id}?${rangeQuery(range)}` : null);

  useEffect(() => {
    api<any[]>('/staff').then((s) => {
      const list = s.filter((x) => x.role === 'THERAPIST').sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
      setStaff(list);
      setId((cur) => cur ?? list[0]?.id);
    }).catch(() => {});
  }, []);
  const pick = (v: string) => { setId(v); router.replace(`/reports/therapist-performance?id=${v}`); };
  const k = d?.kpis, p = d?.profile;

  return (
    <>
      <PageHeader crumb="Reports · Operations" title="Individual therapist performance" sub="Profile, productivity, treatment mix and session log for one therapist"
        extra={<>
          <Select showSearch={{ optionFilterProp: 'label' }} style={{ width: 220 }} placeholder="Choose therapist" value={id} onChange={pick}
            options={staff.map((s) => ({ value: s.id, label: `${s.name}${s.active ? '' : ' (inactive)'}` }))} />
          <DatePicker.RangePicker value={range} allowClear={false} format="DD MMM YYYY" presets={rangePresets()} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} />
          <Button icon={<DownloadOutlined />} disabled={!d?.sessions.length} onClick={() => exportCsv(`therapist-${p.name}-${range[0].format('YYYYMMDD')}`, [
            { title: 'Date', value: (r: any) => dayjs(r.start).format('YYYY-MM-DD') }, { title: 'Start', value: (r: any) => fmtTime(r.start) }, { title: 'Client', value: (r: any) => r.client.name },
            { title: 'Client ID', value: (r: any) => r.client.clientNo }, { title: 'Treatment', value: (r: any) => r.treatment }, { title: 'Machine', value: (r: any) => r.machine },
            { title: 'Room', value: (r: any) => r.room }, { title: 'Minutes', value: (r: any) => r.minutes }, { title: 'Value', value: (r: any) => r.value }, { title: 'Package session', value: (r: any) => (r.fromPackage ? 'Yes' : 'No') },
          ], d.sessions)}>Excel (CSV)</Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>PDF</Button>
        </>} />
      {!id ? <Card><Empty description="No therapists found" /></Card> : !d ? <Skeleton active paragraph={{ rows: 12 }} /> : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={8}>
              <Card style={{ height: '100%' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                  <Avatar size={56} style={{ background: p.color ?? '#8A867E', fontWeight: 600 }}>{initials(p.name)}</Avatar>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 650 }}>{p.name} {!p.active && <Tag>Inactive</Tag>}</div>
                    <div className="muted">{p.designation ?? 'Therapist'}</div>
                  </div>
                </div>
                <Descriptions size="small" column={1} items={[
                  { label: 'Phone', children: p.phone ?? '—' }, { label: 'Email', children: p.email }, { label: 'Gender', children: p.gender ?? '—' },
                  { label: 'Commission', children: p.commissionPct != null ? `${Number(p.commissionPct)}% of delivered value` : '—' },
                  { label: 'Joined', children: fmtDate(p.createdAt) }, { label: 'Last login', children: fmtDateTime(p.lastLoginAt) },
                ]} />
                <div className="muted" style={{ fontSize: 12, margin: '12px 0 6px' }}>Qualified treatments ({p.skills.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{p.skills.map((s: string) => <Tag key={s} style={{ marginInlineEnd: 0 }}>{s.split(' (')[0]}</Tag>)}</div>
              </Card>
            </Col>
            <Col xs={24} xl={16}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16 }}>
                <StatTile label="Completed sessions" value={num(k.completedSessions)} sub={`${k.uniqueClients} different clients`} />
                <StatTile label="Treatment hours" value={(k.treatmentMinutes / 60).toFixed(1)} sub={`avg ${k.avgMinutes} min / session`} />
                <StatTile label="Delivered value" value={money(k.deliveredValue, false)} sub="revenue earned on sessions" />
                <StatTile label="Commission" value={money(k.commission, false)} sub={p.commissionPct != null ? `${Number(p.commissionPct)}%` : 'no commission set'} />
                <StatTile label="Utilisation" value={`${k.utilisationPct}%`} sub={`treatment time ÷ ${Math.round(k.availableMinutes / 60)}h available${k.leaveMinutes ? ` (after ${Math.round(k.leaveMinutes / 60)}h leave)` : ''}`} />
                <StatTile label="Completion rate" value={`${k.completionPct}%`} sub={`${k.booked} booked · ${k.noShows} no-show · ${k.cancelled} cancelled`} />
              </div>
              <Card size="small" title={`Sessions per ${d.granularity}`} style={{ marginTop: 16 }}>
                {d.sessions.length ? (
                  <ColumnChart data={d.trend} x="key" height={200} series={[{ key: 'sessions', label: 'Sessions', color: p.color ?? SERIES.gold }]}
                    xFormat={(s) => (d.granularity === 'month' ? dayjs(s + '-01').format('MMM YY') : dayjs(s).format('DD MMM'))} />
                ) : <Empty description="No completed sessions in this period" />}
              </Card>
            </Col>

            <Col xs={24} xl={14}>
              <Card size="small" title="Treatment mix" styles={{ body: { padding: 0 } }}>
                <Table size="small" rowKey="treatment" pagination={false} dataSource={d.treatments}
                  columns={[
                    { title: 'Treatment', dataIndex: 'treatment' },
                    { title: 'Sessions', dataIndex: 'sessions', align: 'right' },
                    { title: 'Share', align: 'right', render: (_, r: any) => `${Math.round((r.sessions / k.completedSessions) * 100)}%` },
                    { title: 'Hours', align: 'right', render: (_, r: any) => (r.minutes / 60).toFixed(1) },
                    { title: 'Value', align: 'right', render: (_, r: any) => money(r.value, false) },
                  ]} />
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <Card size="small" title="Upcoming bookings" styles={{ body: { padding: 0 } }}>
                <Table size="small" rowKey="id" pagination={false} dataSource={d.upcoming} locale={{ emptyText: 'Nothing booked' }}
                  columns={[
                    { title: 'When', render: (_, r: any) => dayjs(r.startAt).format('ddd DD MMM, HH:mm') },
                    { title: 'Client', render: (_, r: any) => <Link href={`/clients/${r.client.id}`}>{r.client.name}</Link> },
                    { title: 'Treatment', render: (_, r: any) => <span style={{ fontSize: 12 }}>{r.treatment.name}</span> },
                    { title: '', render: (_, r: any) => <StatusTag status={r.status} /> },
                  ]} />
              </Card>
            </Col>

            <Col span={24}>
              <Card size="small" title={`Session log (${d.sessions.length})`} styles={{ body: { padding: 0 } }}>
                <Table size="small" rowKey="id" dataSource={d.sessions} pagination={{ pageSize: 15, showSizeChanger: false }} scroll={{ x: 900 }}
                  columns={[
                    { title: 'Date', render: (_, r: any) => <span>{fmtDate(r.start)} <span className="muted">{fmtTime(r.start)}–{fmtTime(r.end)}</span></span> },
                    { title: 'Client', render: (_, r: any) => <Link href={`/clients/${r.client.id}`}>{r.client.name}</Link> },
                    { title: 'Treatment', dataIndex: 'treatment' },
                    { title: 'Machine', render: (_, r: any) => r.machine ?? '—' },
                    { title: 'Room', dataIndex: 'room' },
                    { title: 'Min', dataIndex: 'minutes', align: 'right' },
                    { title: 'Value', align: 'right', render: (_, r: any) => money(r.value) },
                    { title: 'Type', render: (_, r: any) => r.fromPackage ? <Tag color="gold">Package</Tag> : <Tag>Pay per visit</Tag> },
                  ]} />
              </Card>
            </Col>
          </Row>
        </div>
      )}
    </>
  );
}

export default function TherapistPerformancePage() {
  return <Suspense><TherapistInner /></Suspense>;
}
