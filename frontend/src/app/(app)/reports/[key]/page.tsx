'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, DatePicker, InputNumber, Segmented, Space, Table, Tag } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useApi } from '@/lib/useApi';
import { REPORT_LIST } from '@/lib/nav';
import { fmtDate, fmtDateTime, fmtTime, humanize, money, STATUS } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { SERIES } from '@/lib/theme';
import { Legend, PageHeader, StatTile, StatusTag } from '@/components/ui';
import { ColumnChart } from '@/components/charts';

type Col = { title: string; key: string; render?: (r: any) => React.ReactNode; csv?: (r: any) => unknown; align?: 'right'; money?: boolean };
type Def = {
  filter: 'range' | 'date' | 'days' | 'year' | 'months' | 'none';
  url: (f: Filters) => string;
  rows: (d: any) => any[];
  cols: Col[];
  tiles?: (d: any, rows: any[]) => { label: string; value: React.ReactNode; sub?: string }[];
  chart?: { x: string; series: { key: string; label: string; color: string }[]; xFormat?: (s: string) => string; money?: boolean };
  extra?: (d: any) => React.ReactNode;
};
type Filters = { range: [Dayjs, Dayjs]; date: Dayjs; days: number; year: number; months: number };

const ymd = (d: Dayjs) => d.format('YYYY-MM-DD');
const rq = (f: Filters) => `from=${ymd(f.range[0])}&to=${ymd(f.range[1].add(1, 'day'))}`;
const m = (key: string, title: string): Col => ({ key, title, align: 'right', money: true });
const n = (key: string, title: string): Col => ({ key, title, align: 'right' });
const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const clientLink = (c: any) => c ? <Link href={`/clients/${c.id}`}>{c.name}</Link> : '—';

const DEFS: Record<string, Def> = {
  'daily-appointments': {
    filter: 'date', url: (f) => `/reports/daily-appointments?date=${ymd(f.date)}`, rows: (d) => d,
    cols: [
      { key: 'startAt', title: 'Time', render: (r) => `${fmtTime(r.startAt)}–${fmtTime(r.endAt)}`, csv: (r) => fmtTime(r.startAt) },
      { key: 'client', title: 'Client', render: (r) => `${r.client.name} (${r.client.clientNo})`, csv: (r) => r.client.name },
      { key: 'mobile', title: 'Mobile', render: (r) => r.client.mobile, csv: (r) => r.client.mobile },
      { key: 'treatment', title: 'Treatment', render: (r) => r.treatment.name, csv: (r) => r.treatment.name },
      { key: 'therapist', title: 'Therapist', render: (r) => r.therapist.name, csv: (r) => r.therapist.name },
      { key: 'machine', title: 'Machine', render: (r) => r.machine?.code ?? '—', csv: (r) => r.machine?.code },
      { key: 'room', title: 'Room', render: (r) => r.room.name, csv: (r) => r.room.name },
      { key: 'status', title: 'Status', render: (r) => <StatusTag status={r.status} />, csv: (r) => STATUS[r.status].label },
      { key: 'actual', title: 'Delivered', render: (r) => r.session ? `${fmtTime(r.session.actualStart)}–${fmtTime(r.session.actualEnd)}` : '—', csv: (r) => r.session ? fmtTime(r.session.actualStart) : '' },
    ],
    tiles: (_, rows) => [
      { label: 'Appointments', value: rows.length }, { label: 'Completed', value: rows.filter((r) => r.status === 'COMPLETED').length },
      { label: 'No-shows', value: rows.filter((r) => r.status === 'NO_SHOW').length }, { label: 'Cancelled', value: rows.filter((r) => r.status === 'CANCELLED').length },
    ],
  },
  'therapist-sessions': {
    filter: 'range', url: (f) => `/reports/therapist-sessions?${rq(f)}`, rows: (d) => d,
    cols: [{ key: 'therapist', title: 'Therapist' }, { key: 'designation', title: 'Designation' }, n('completedSessions', 'Sessions'), n('treatmentMinutes', 'Treatment min'), n('avgMinutes', 'Avg min'), n('noShows', 'No-shows'), n('cancelled', 'Cancelled'), m('deliveredValue', 'Delivered value'), m('commission', 'Commission')],
    chart: { x: 'therapist', series: [{ key: 'completedSessions', label: 'Completed sessions', color: SERIES.gold }] },
  },
  'machine-utilisation': {
    filter: 'range', url: (f) => `/reports/machine-utilisation?${rq(f)}`, rows: (d) => d,
    cols: [
      { key: 'code', title: 'Machine' }, { key: 'type', title: 'Type' }, { key: 'room', title: 'Room' }, n('sessions', 'Sessions'),
      { key: 'availableMinutes', title: 'Available h', align: 'right', render: (r) => (r.availableMinutes / 60).toFixed(1), csv: (r) => (r.availableMinutes / 60).toFixed(1) },
      { key: 'downtimeMinutes', title: 'Downtime h', align: 'right', render: (r) => (r.downtimeMinutes / 60).toFixed(1), csv: (r) => (r.downtimeMinutes / 60).toFixed(1) },
      n('idleHours', 'Idle h'), { key: 'bookedUtilisationPct', title: 'Booked %', align: 'right', render: (r) => `${r.bookedUtilisationPct}%` },
      { key: 'actualUtilisationPct', title: 'Actual %', align: 'right', render: (r) => <b>{r.actualUtilisationPct}%</b> },
    ],
    chart: { x: 'code', series: [{ key: 'bookedUtilisationPct', label: 'Booked %', color: SERIES.gold }, { key: 'actualUtilisationPct', label: 'Actual %', color: SERIES.blue }] },
    extra: () => <span className="muted" style={{ fontSize: 12 }}>Utilisation = actual treatment minutes ÷ available operating minutes × 100. Available minutes exclude scheduled downtime.</span>,
  },
  followups: {
    filter: 'none', url: () => '/reports/followups', rows: (d) => d,
    cols: [
      { key: 'client', title: 'Client', render: (r) => clientLink({ ...r.client, id: r.clientId }), csv: (r) => r.client.name },
      { key: 'mobile', title: 'Mobile', render: (r) => r.client.mobile, csv: (r) => r.client.mobile },
      { key: 'type', title: 'Type', render: (r) => humanize(r.type), csv: (r) => r.type }, { key: 'title', title: 'Task' },
      { key: 'dueDate', title: 'Due', render: (r) => fmtDate(r.dueDate), csv: (r) => r.dueDate.slice(0, 10) },
      { key: 'overdueDays', title: 'Overdue', align: 'right', render: (r) => r.overdueDays ? <Tag color="red">{r.overdueDays} days</Tag> : <Tag color="gold">today</Tag>, csv: (r) => r.overdueDays },
    ],
    tiles: (_, rows) => [{ label: 'Open tasks due', value: rows.length }, { label: 'Overdue', value: rows.filter((r) => r.overdueDays > 0).length }, { label: 'Doctor reviews', value: rows.filter((r) => r.type === 'REVIEW').length }],
  },
  'package-liability': {
    filter: 'none', url: () => '/reports/package-liability', rows: (d) => d.rows,
    cols: [
      { key: 'client', title: 'Client', render: (r) => clientLink(r.client), csv: (r) => r.client.name }, { key: 'name', title: 'Package' }, m('price', 'Price'),
      n('totalSessions', 'Sessions'), n('usedSessions', 'Used'), n('remaining', 'Remaining'), { key: 'expiresAt', title: 'Expires', render: (r) => fmtDate(r.expiresAt), csv: (r) => r.expiresAt.slice(0, 10) }, m('value', 'Unfulfilled value'),
    ],
    tiles: (d) => [{ label: 'Package liability', value: money(d.total, false), sub: 'cash received for sessions not yet delivered' }, { label: 'Sessions outstanding', value: d.sessions.toLocaleString() }, { label: 'Active packages', value: d.rows.length }],
  },
  'package-expiry': {
    filter: 'days', url: (f) => `/reports/package-expiry?days=${f.days}`, rows: (d) => d,
    cols: [
      { key: 'client', title: 'Client', render: (r) => clientLink(r.client), csv: (r) => r.client.name }, { key: 'name', title: 'Package' },
      { key: 'expiresAt', title: 'Expires', render: (r) => { const dd = dayjs(r.expiresAt).diff(dayjs(), 'day'); return <span>{fmtDate(r.expiresAt)} <Tag color={dd < 0 ? 'red' : dd <= 7 ? 'orange' : 'gold'}>{dd < 0 ? 'expired' : `${dd}d`}</Tag></span>; }, csv: (r) => r.expiresAt.slice(0, 10) },
      n('remaining', 'Sessions left'), m('value', 'Value at risk'),
    ],
    tiles: (_, rows) => [{ label: 'Packages expiring', value: rows.length }, { label: 'Unused sessions', value: sum(rows, 'remaining') }, { label: 'Value at risk', value: money(sum(rows, 'value'), false) }],
  },
  'sales-by-treatment': {
    filter: 'range', url: (f) => `/reports/sales-by-treatment?${rq(f)}`, rows: (d) => d,
    cols: [{ key: 'item', title: 'Item' }, { key: 'kind', title: 'Type', render: (r) => <Tag color={r.kind === 'PACKAGE' ? 'gold' : 'default'}>{humanize(r.kind)}</Tag>, csv: (r) => r.kind }, n('qty', 'Qty'), m('gross', 'Gross'), m('discount', 'Discount'), m('net', 'Net sales'), m('vat', 'VAT'), m('total', 'Total')],
    chart: { x: 'item', series: [{ key: 'net', label: 'Net sales', color: SERIES.gold }], money: true, xFormat: (s) => s.split(':')[0].split(' (')[0].slice(0, 16) },
  },
  collections: {
    filter: 'range', url: (f) => `/reports/collections?${rq(f)}`, rows: (d) => d.byMethod,
    cols: [{ key: 'method', title: 'Method', render: (r) => humanize(r.method), csv: (r) => r.method }, n('count', 'Transactions'), m('payments', 'Received'), m('refunds', 'Refunded'), m('net', 'Net')],
    tiles: (d) => [
      { label: 'Net collected', value: money(sum(d.byMethod, 'net'), false) }, { label: 'Refunds', value: money(sum(d.byMethod, 'refunds'), false) },
      { label: 'Outstanding (all time)', value: money(sum(d.outstanding, 'balance'), false), sub: `${d.outstanding.length} unpaid invoices` },
    ],
    extra: (d) => (
      <Card size="small" title="Outstanding invoices — ageing" style={{ marginTop: 16 }}>
        <Table size="small" rowKey="id" dataSource={d.outstanding} pagination={{ pageSize: 10 }} columns={[
          { title: 'Invoice', render: (_, r: any) => <Link href={`/billing/${r.id}`}>{r.number}</Link> }, { title: 'Client', render: (_, r: any) => r.client.name },
          { title: 'Issued', render: (_, r: any) => fmtDate(r.issuedAt) }, { title: 'Age', align: 'right', render: (_, r: any) => <Tag color={r.ageDays > 60 ? 'red' : r.ageDays > 30 ? 'orange' : 'default'}>{r.ageDays} days</Tag> },
          { title: 'Total', align: 'right', render: (_, r: any) => money(r.total) }, { title: 'Balance', align: 'right', render: (_, r: any) => <b>{money(r.balance)}</b> },
        ]} />
      </Card>
    ),
  },
  vat: {
    filter: 'range', url: (f) => `/reports/vat?${rq(f)}`, rows: (d) => d.rows,
    cols: [{ key: 'category', title: 'Supply type' }, n('lines', 'Lines'), m('net', 'Net amount'), m('vat', 'Output VAT'), m('gross', 'Gross')],
    tiles: (d) => [{ label: 'Taxable supplies (net)', value: money(d.totals.net) }, { label: 'Output VAT payable', value: money(d.totals.vat) }, { label: 'Documents', value: d.invoices.length }],
    extra: (d) => (
      <Card size="small" title="Tax documents in period" style={{ marginTop: 16 }}>
        <Table size="small" rowKey="id" dataSource={d.invoices} pagination={{ pageSize: 10 }} columns={[
          { title: 'Number', render: (_, r: any) => <Link href={`/billing/${r.id}`}>{r.number}</Link> }, { title: 'Date', render: (_, r: any) => fmtDate(r.issuedAt) }, { title: 'Client', render: (_, r: any) => r.client.name },
          { title: 'Taxable', align: 'right', render: (_, r: any) => money(r.taxable) }, { title: 'VAT', align: 'right', render: (_, r: any) => money(r.vatAmount) }, { title: 'Total', align: 'right', render: (_, r: any) => money(r.total) },
        ]} />
      </Card>
    ),
  },
  'new-vs-returning': {
    filter: 'months', url: (f) => `/reports/new-vs-returning?months=${f.months}`, rows: (d) => d,
    cols: [{ key: 'month', title: 'Month', render: (r) => dayjs(r.month + '-01').format('MMM YYYY'), csv: (r) => r.month }, n('newClients', 'New registrations'), n('newVisiting', 'New clients treated'), n('returning', 'Returning clients'), n('totalVisiting', 'Total clients treated')],
    chart: { x: 'month', series: [{ key: 'newVisiting', label: 'New', color: SERIES.gold }, { key: 'returning', label: 'Returning', color: SERIES.blue }], xFormat: (s) => dayjs(s + '-01').format('MMM YY') },
  },
  yoy: {
    filter: 'year', url: (f) => `/reports/yoy?year=${f.year}`, rows: (d) => d,
    cols: [{ key: 'month', title: 'Month' }, m('sales', 'Sales'), m('prevSales', 'Sales last year'), { key: 'growthPct', title: 'Growth', align: 'right', render: (r) => r.growthPct == null ? '—' : <span className={r.growthPct >= 0 ? 'delta-up' : 'delta-down'}>{r.growthPct >= 0 ? '+' : ''}{r.growthPct}%</span> }, m('collections', 'Collections'), m('prevCollections', 'Collections LY'), m('delivered', 'Delivered'), m('prevDelivered', 'Delivered LY')],
    chart: { x: 'month', series: [{ key: 'prevSales', label: 'Last year', color: SERIES.blue }, { key: 'sales', label: 'This year', color: SERIES.gold }], money: true },
  },
};

export default function ReportPage() {
  const { key } = useParams<{ key: string }>();
  const def = DEFS[key];
  const meta = REPORT_LIST.find((r) => r.key === key);
  const [f, setF] = useState<Filters>({ range: [dayjs().startOf('month'), dayjs()], date: dayjs(), days: 30, year: dayjs().year(), months: 12 });
  const { data, loading } = useApi<any>(def ? def.url(f) : null);
  const rows = useMemo(() => (data && def ? def.rows(data) : []), [data, def]);
  if (!def || !meta) return <Card>Unknown report</Card>;

  const cols = def.cols.map((c) => ({
    title: c.title, key: c.key, align: c.align,
    sorter: c.align === 'right' ? (a: any, b: any) => (Number(a[c.key]) || 0) - (Number(b[c.key]) || 0) : undefined,
    render: (_: unknown, r: any) => (c.render ? c.render(r) : c.money ? money(r[c.key]) : r[c.key] ?? '—'),
  }));
  const moneyCols = def.cols.filter((c) => c.money || (c.align === 'right' && !c.render));
  const filename = `${key}-${f.range[0].format('YYYYMMDD')}`;

  return (
    <>
      <PageHeader crumb={`Reports · ${meta.group}`} title={meta.label} sub={meta.description}
        extra={<>
          {def.filter === 'range' && <DatePicker.RangePicker value={f.range} allowClear={false} format="DD MMM YYYY" onChange={(v) => v && setF({ ...f, range: v as [Dayjs, Dayjs] })} presets={[
            { label: 'Today', value: [dayjs(), dayjs()] }, { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] }, { label: 'Month to date', value: [dayjs().startOf('month'), dayjs()] },
            { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            { label: 'Last quarter', value: [dayjs().subtract(3, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] }, { label: 'Year to date', value: [dayjs().startOf('year'), dayjs()] },
          ]} />}
          {def.filter === 'date' && <DatePicker value={f.date} allowClear={false} onChange={(d) => d && setF({ ...f, date: d })} format="ddd, DD MMM YYYY" />}
          {def.filter === 'days' && <Space>Expiring within <InputNumber min={0} max={365} value={f.days} onChange={(v) => setF({ ...f, days: v ?? 30 })} suffix="days" /></Space>}
          {def.filter === 'year' && <Segmented value={f.year} onChange={(v) => setF({ ...f, year: Number(v) })} options={[dayjs().year() - 1, dayjs().year()]} />}
          {def.filter === 'months' && <Segmented value={f.months} onChange={(v) => setF({ ...f, months: Number(v) })} options={[{ value: 6, label: '6 months' }, { value: 12, label: '12 months' }, { value: 24, label: '24 months' }]} />}
          <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => exportCsv(filename, def.cols.map((c) => ({ title: c.title, value: c.csv ?? ((r: any) => r[c.key]) })), rows)}>Excel (CSV)</Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>PDF</Button>
        </>} />
      <div className="print-only" style={{ marginBottom: 12 }}>Walnut Slimming & Body Shaping Center · generated {fmtDateTime(new Date())}</div>
      {def.tiles && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
          {def.tiles(data, rows).map((t) => <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} />)}
        </div>
      )}
      {def.chart && rows.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }} extra={def.chart.series.length > 1 && <Legend items={def.chart.series} />} title={def.chart.series.length === 1 ? def.chart.series[0].label : ' '}>
          <ColumnChart data={rows} x={def.chart.x} series={def.chart.series} height={240} xFormat={def.chart.xFormat} format={def.chart.money ? (v) => money(v, false) : undefined} labelEvery={rows.length <= 14 ? 1 : undefined} />
        </Card>
      )}
      <Card styles={{ body: { padding: 0 } }}>
        <Table rowKey={(r: any) => r.id ?? r.code ?? r.month ?? r.therapist ?? r.item ?? r.method ?? r.category} loading={loading} dataSource={rows} columns={cols} size="middle" scroll={{ x: 900 }}
          pagination={rows.length > 25 ? { pageSize: 25, showSizeChanger: false } : false}
          summary={moneyCols.length && rows.length > 1 && !['daily-appointments', 'followups', 'machine-utilisation', 'new-vs-returning'].includes(key) ? () => (
            <Table.Summary.Row style={{ background: '#FAF9F6' }}>
              {def.cols.map((c, i) => (
                <Table.Summary.Cell key={c.key} index={i} align={c.align}>
                  {i === 0 ? <b>Total</b> : c.money ? <b>{money(sum(rows, c.key))}</b> : moneyCols.includes(c) && !c.key.toLowerCase().includes('pct') && !c.key.startsWith('avg') ? <b>{sum(rows, c.key).toLocaleString()}</b> : null}
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          ) : undefined} />
      </Card>
      {def.extra && data && def.extra(data)}
    </>
  );
}
