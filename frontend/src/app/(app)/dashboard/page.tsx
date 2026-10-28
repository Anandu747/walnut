'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, DatePicker, Empty, Row, Segmented, Skeleton, Table } from 'antd';
import { CalendarOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { compact, money, num, STATUS } from '@/lib/format';
import { SERIES } from '@/lib/theme';
import { PageHeader, StatTile, StatusDot, Legend } from '@/components/ui';
import { ColumnChart, MeterList } from '@/components/charts';

type Range = [Dayjs, Dayjs]; // inclusive days
/** Preset → its date range and the like-for-like window it is compared with. */
const PRESETS: Record<string, { label: string; range: () => Range; prev: (r: Range) => Range; vs: string }> = {
  today: { label: 'Today', range: () => [dayjs(), dayjs()], prev: ([a, b]) => [a.subtract(1, 'day'), b.subtract(1, 'day')], vs: 'yesterday' },
  yesterday: { label: 'Yesterday', range: () => [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')], prev: ([a, b]) => [a.subtract(1, 'day'), b.subtract(1, 'day')], vs: 'the day before' },
  week: { label: 'Last 7 days', range: () => [dayjs().subtract(6, 'day'), dayjs()], prev: ([a, b]) => [a.subtract(7, 'day'), b.subtract(7, 'day')], vs: 'prior 7 days' },
  month: { label: 'Month to date', range: () => [dayjs().startOf('month'), dayjs()], prev: ([a, b]) => [a.subtract(1, 'month'), b.subtract(1, 'month')], vs: 'same days last month' },
  lastMonth: { label: 'Last month', range: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')], prev: ([a]) => [a.subtract(1, 'month').startOf('month'), a.subtract(1, 'month').endOf('month')], vs: 'the month before' },
  year: { label: 'Year to date', range: () => [dayjs().startOf('year'), dayjs()], prev: ([a, b]) => [a.subtract(1, 'year'), b.subtract(1, 'year')], vs: 'same period last year' },
};
const day0 = (d: Dayjs) => d.startOf('day').toISOString();
const dayEnd = (d: Dayjs) => d.add(1, 'day').startOf('day').toISOString();

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const router = useRouter();
  const [preset, setPreset] = useState<string>('month');
  const [custom, setCustom] = useState<Range>([dayjs().subtract(13, 'day'), dayjs()]);
  const range = preset === 'custom' ? custom : PRESETS[preset].range();
  const days = range[1].startOf('day').diff(range[0].startOf('day'), 'day') + 1;
  // Custom ranges compare with the equally long period just before (the API default).
  const prev = preset === 'custom' ? null : PRESETS[preset].prev(range);
  const vs = preset === 'custom' ? `previous ${days} day${days > 1 ? 's' : ''}` : PRESETS[preset].vs;
  const label = preset === 'custom' ? `${range[0].format('DD MMM')} – ${range[1].format('DD MMM')}` : PRESETS[preset].label;
  const { data: d, loading } = useApi<any>(`/reports/dashboard?from=${day0(range[0])}&to=${dayEnd(range[1])}${prev ? `&prevFrom=${day0(prev[0])}&prevTo=${dayEnd(prev[1])}` : ''}`);
  const finance = hasRole('MANAGER', 'ACCOUNTANT');
  const hour = dayjs().hour();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const k = d?.kpis;
  const totalSessions = d?.therapists.reduce((s: number, t: any) => s + t.sessions, 0) ?? 0;

  return (
    <>
      <PageHeader
        crumb={finance ? 'Management overview' : 'Overview'} title={`${greet}, ${user?.name.split(' (')[0]}`}
        sub={`${days === 1 ? range[0].format('ddd DD MMM YYYY') : `${range[0].format('DD MMM')} – ${range[1].format('DD MMM YYYY')}`} · compared with ${vs}`}
        extra={<>
          <Segmented value={preset} onChange={(v) => setPreset(String(v))} options={[...Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })), { value: 'custom', label: 'Custom' }]} />
          <DatePicker.RangePicker value={range} allowClear={false} format="DD MMM YYYY" disabledDate={(x) => x.isAfter(dayjs(), 'day')}
            onChange={(v) => { if (v?.[0] && v[1]) { setCustom([v[0], v[1]]); setPreset('custom'); } }} />
        </>}
      />
      {!d ? <Skeleton active paragraph={{ rows: 10 }} /> : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Row gutter={[16, 16]}>
            {finance && <>
              <Col xs={12} xl={6}><StatTile label="Package & service sales" value={money(k.sales, false)} current={k.sales} previous={k.prev.sales} vs={vs} sub="excl. VAT" /></Col>
              <Col xs={12} xl={6}><StatTile label="Payments collected" value={money(k.collections, false)} current={k.collections} previous={k.prev.collections} vs={vs} sub={k.refunds ? `after ${money(k.refunds, false)} refunds` : 'cash & electronic'} /></Col>
              <Col xs={12} xl={6}><StatTile label="Delivered treatment value" value={money(k.delivered, false)} current={k.delivered} previous={k.prev.delivered} vs={vs} sub="revenue earned on completed sessions" /></Col>
            </>}
            <Col xs={12} xl={6}><StatTile label="New clients" value={num(k.newClients)} current={k.newClients} previous={k.prev.newClients} vs={vs} sub="first-time registrations" onClick={() => router.push('/clients?filter=new-30')} /></Col>
            <Col xs={12} xl={6}><StatTile label="Completed sessions" value={num(k.sessions)} current={k.sessions} previous={k.prev.sessions} vs={vs} sub="all treatments" /></Col>
            {finance && <>
              <Col xs={12} xl={6}><StatTile label="Outstanding balances" value={money(k.outstanding, false)} sub="unpaid invoices · all time" onClick={() => router.push('/billing?outstanding=1')} /></Col>
              <Col xs={12} xl={6}><StatTile label="Package liability" value={money(k.liability, false)} sub={`${num(k.pendingSessions)} unused sessions on ${k.activePackages} active packages`} onClick={() => router.push('/reports/package-liability')} /></Col>
            </>}
            <Col xs={12} xl={6}><StatTile label="Reviews due / overdue" value={num(k.followUpsDue)} sub="15-day doctor reviews" onClick={() => router.push('/followups')} /></Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            {finance && (
              <Col xs={24} xl={16}>
                <Card title="Sales vs collections" extra={<Legend items={[{ label: 'Sales (excl. VAT)', color: SERIES.gold }, { label: 'Collections', color: SERIES.blue }]} />}>
                  <ColumnChart
                    data={d.trend} x="key" height={260} format={(v) => money(v, false)}
                    series={[{ key: 'sales', label: 'Sales', color: SERIES.gold }, { key: 'collections', label: 'Collections', color: SERIES.blue }]}
                    xFormat={(s) => (d.granularity === 'month' ? dayjs(s + '-01').format('MMM YY') : dayjs(s).format('DD MMM'))}
                  />
                </Card>
              </Col>
            )}
            <Col xs={24} xl={finance ? 8 : 12}>
              <Card title="Today at the centre" extra={<Button type="link" onClick={() => router.push('/front-desk')}>Front desk <RightOutlined /></Button>} style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 40, fontWeight: 650, lineHeight: 1 }}>{d.today.total}</span>
                  <span className="muted">appointments today</span>
                </div>
                {d.today.total === 0 ? <Empty description="No appointments today" /> : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {Object.keys(STATUS).filter((s) => d.today.byStatus[s]).map((s) => (
                      <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#FAF9F6', borderRadius: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><StatusDot status={s} size={10} />{STATUS[s].label}</span>
                        <b className="tabular">{d.today.byStatus[s]}</b>
                      </div>
                    ))}
                  </div>
                )}
                <Button block icon={<CalendarOutlined />} style={{ marginTop: 16 }} onClick={() => router.push('/scheduler')}>Open resource calendar</Button>
              </Card>
            </Col>

            <Col xs={24} xl={finance ? 12 : 12}>
              <Card title="Therapist performance" extra={<span className="muted">{label}</span>}>
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={d.therapists}
                  columns={[
                    { title: 'Therapist', dataIndex: 'name', render: (v, r: any) => <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: r.color ?? '#ccc' }} />{finance ? <Link href={`/reports/therapist-performance?id=${r.id}`}>{v}</Link> : v}</span> },
                    { title: 'Sessions', dataIndex: 'sessions', align: 'right' },
                    { title: 'Hours', dataIndex: 'minutes', align: 'right', render: (v) => (v / 60).toFixed(1) },
                    ...(finance ? [{ title: 'Delivered', dataIndex: 'value', align: 'right' as const, render: (v: number) => compact(v) }] : []),
                    {
                      title: 'Workload share', width: '34%', render: (_, r: any) => {
                        const p = totalSessions ? Math.round((r.sessions / totalSessions) * 100) : 0;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: `${SERIES.blue}22` }}><div style={{ width: `${p}%`, height: 6, borderRadius: 3, background: SERIES.blue }} /></div>
                            <span className="tabular muted" style={{ width: 34, textAlign: 'right' }}>{p}%</span>
                          </div>
                        );
                      },
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title="Machine utilisation" extra={<span className="muted">actual minutes ÷ available minutes</span>}>
                {d.machineTypes.length ? (
                  <MeterList color={SERIES.blue} warnAt={85} rows={d.machineTypes.map((m: any) => ({ label: m.name, value: m.utilisationPct, note: `${Math.round(m.actualMinutes / 60)}h used of ${Math.round(m.availableMinutes / 60)}h available` }))} />
                ) : <Empty />}
              </Card>
            </Col>
            {finance && (
              <Col span={24}>
                <Card title="Top treatments by delivered value" extra={<Button type="link" onClick={() => router.push('/reports/sales-by-treatment')}>Sales report <RightOutlined /></Button>}>
                  <ColumnChart data={d.topTreatments} x="name" height={220} series={[{ key: 'value', label: 'Delivered value', color: SERIES.gold }]} format={(v) => money(v, false)} labelEvery={1} xFormat={(s) => s.split(' (')[0].split(' –')[0]} />
                </Card>
              </Col>
            )}
          </Row>
        </div>
      )}
    </>
  );
}
