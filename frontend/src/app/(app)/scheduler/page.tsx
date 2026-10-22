'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Checkbox, DatePicker, Empty, Input, Segmented, Spin, Tooltip } from 'antd';
import { LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { minToTime, STATUS } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import BookingDrawer, { BookingInit } from '@/components/BookingDrawer';
import AppointmentPanel from '@/components/AppointmentPanel';

type Group = 'therapist' | 'machine' | 'room';
const KEY: Record<Group, 'therapistId' | 'machineId' | 'roomId'> = { therapist: 'therapistId', machine: 'machineId', room: 'roomId' };
const BLOCK_KIND: Record<Group, string> = { therapist: 'THERAPIST', machine: 'MACHINE', room: 'ROOM' };
const SLOT_H = 18; // px per slot (15 min => 72px per hour)

type Ev = { id: string; start: number; end: number; lane?: number; lanes?: number; [k: string]: any };

/** Assigns side-by-side lanes to overlapping events within one column. */
function layout(evs: Ev[]) {
  const sorted = [...evs].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Ev[] = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((e) => e.lane! + 1)); cluster.forEach((e) => (e.lanes = n)); cluster = []; };
  for (const e of sorted) {
    if (e.start >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter((c) => c.end > e.start).map((c) => c.lane));
    let lane = 0; while (used.has(lane)) lane++;
    e.lane = lane; cluster.push(e); clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush();
  return sorted;
}

function SchedulerInner() {
  const params = useSearchParams();
  const { hasRole } = useAuth();
  const [date, setDate] = useState<Dayjs>(params.get('date') ? dayjs(params.get('date')) : dayjs());
  const [view, setView] = useState<'day' | 'week'>('day');
  const [group, setGroup] = useState<Group>('therapist');
  const [hidden, setHidden] = useState<Record<Group, string[]>>({ therapist: [], machine: [], room: [] });
  const [hideCancelled, setHideCancelled] = useState(true);
  const [filter, setFilter] = useState('');
  const [book, setBook] = useState<BookingInit | null>(params.get('book') ? {} : null);
  const [openId, setOpenId] = useState<string>();
  const [now, setNow] = useState(dayjs());
  const scroller = useRef<HTMLDivElement>(null);
  const canBook = hasRole('RECEPTION', 'MANAGER', 'DOCTOR');

  const from = view === 'day' ? date.startOf('day') : date.subtract((date.day() + 6) % 7, 'day').startOf('day'); // weeks start Monday
  const days = view === 'day' ? 1 : 7;
  const to = from.add(days, 'day');
  const { data, loading, reload } = useApi<any>(`/scheduler?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);

  useEffect(() => { const t = setInterval(() => setNow(dayjs()), 60_000); return () => clearInterval(t); }, []);
  // Scroll to "now" (or opening time) when the view loads.
  useEffect(() => {
    if (!data || !scroller.current) return;
    const m = now.hour() * 60 + now.minute();
    const target = date.isSame(now, 'day') && m > data.hours.openMin ? ((m - data.hours.openMin - 60) / data.hours.slotMin) * SLOT_H : 0;
    scroller.current.scrollTop = Math.max(0, target);
  }, [data?.hours?.openMin, date.format('YYYY-MM-DD'), view]); // eslint-disable-line react-hooks/exhaustive-deps

  const resources = useMemo(() => {
    if (!data) return [];
    if (group === 'therapist') return data.therapists.map((t: any) => ({ id: t.id, name: t.name, sub: t.designation, color: t.color ?? '#8A867E' }));
    if (group === 'machine') return data.machines.map((m: any) => ({ id: m.id, name: m.code, sub: `${m.type.name}${m.room ? ' · ' + m.room.name : ''}`, color: m.status === 'OPERATIONAL' ? '#2a78d6' : '#C8372D', status: m.status }));
    return data.rooms.map((r: any) => ({ id: r.id, name: r.name, sub: '', color: '#B8860B' }));
  }, [data, group]);
  const visible = resources.filter((r: any) => !hidden[group].includes(r.id));
  const visibleIds = new Set(visible.map((r: any) => r.id));

  if (!data) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  const { openMin, closeMin, slotMin } = data.hours;
  const slots = Math.ceil((closeMin - openMin) / slotMin);
  const minuteOf = (d: Dayjs) => d.hour() * 60 + d.minute();
  const pos = (m: number) => ((m - openMin) / slotMin) * SLOT_H;

  const appts = data.appointments.filter((a: any) => !(hideCancelled && ['CANCELLED', 'NO_SHOW'].includes(a.status)));
  const columns: { key: string; title: React.ReactNode; day: Dayjs; resourceId?: string; maintenance?: boolean }[] = view === 'day'
    ? visible.map((r: any) => ({
      key: r.id, day: date, resourceId: r.id, maintenance: r.status && r.status !== 'OPERATIONAL',
      title: <div style={{ lineHeight: 1.25 }}><b>{r.name}</b>{r.sub && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{r.sub}</div>}</div>,
    }))
    : Array.from({ length: 7 }, (_, i) => {
      const d = from.add(i, 'day');
      return { key: d.format('YYYY-MM-DD'), day: d, title: <div style={{ fontWeight: d.isSame(now, 'day') ? 700 : 500 }}>{d.format('ddd DD/MM')}{d.isSame(now, 'day') && <span style={{ marginLeft: 6, fontSize: 11, background: '#94690A', color: '#fff', borderRadius: 10, padding: '1px 8px' }}>Today</span>}</div> };
    });

  const eventsFor = (col: (typeof columns)[number]): Ev[] => {
    const evs: Ev[] = appts
      .filter((a: any) => dayjs(a.startAt).isSame(col.day, 'day') && (col.resourceId ? a[KEY[group]] === col.resourceId : visibleIds.has(a[KEY[group]])))
      .map((a: any) => ({ ...a, kind: 'appt', start: minuteOf(dayjs(a.startAt)), end: minuteOf(dayjs(a.endAt)) }));
    const blocks: Ev[] = data.blocks
      .filter((b: any) => b.kind === BLOCK_KIND[group] && (col.resourceId ? b.resourceId === col.resourceId : visibleIds.has(b.resourceId)))
      .filter((b: any) => dayjs(b.startAt).isBefore(col.day.endOf('day')) && dayjs(b.endAt).isAfter(col.day.startOf('day')))
      .map((b: any) => ({ ...b, kind: 'block', start: Math.max(openMin, dayjs(b.startAt).isBefore(col.day.startOf('day')) ? 0 : minuteOf(dayjs(b.startAt))), end: Math.min(closeMin, dayjs(b.endAt).isAfter(col.day.endOf('day')) ? 1440 : minuteOf(dayjs(b.endAt))) }));
    return layout([...blocks, ...evs]);
  };

  const onSlot = (col: (typeof columns)[number], slot: number) => {
    if (!canBook) return;
    const start = col.day.startOf('day').add(openMin + slot * slotMin, 'minute');
    if (start.isBefore(dayjs().subtract(slotMin, 'minute'))) return;
    const single = view === 'week' && visible.length === 1 ? visible[0].id : undefined;
    const rid = col.resourceId ?? single;
    setBook({ startAt: start, ...(rid && { [KEY[group]]: rid }) });
  };

  const colW = view === 'day' ? Math.max(150, Math.min(260, 1100 / Math.max(1, columns.length))) : undefined;
  const statusOrder = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

  return (
    <>
      <PageHeader
        crumb="Scheduler" title="Resource Calendar"
        sub="Every booking reserves a qualified therapist, a compatible machine and a free room at the same time"
        extra={canBook && <Button type="primary" icon={<PlusOutlined />} onClick={() => setBook({ startAt: undefined })}>Book appointment</Button>}
      />
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* Resource picker — like the doctor list in a hospital scheduler */}
        <div style={{ width: 264, flexShrink: 0, background: '#fff', border: '1px solid #ECEAE4', borderRadius: 12, padding: 12, alignSelf: 'flex-start', position: 'sticky', top: 76 }}>
          <Segmented block size="small" value={group} onChange={(v) => setGroup(v as Group)} options={[{ value: 'therapist', label: 'Staff' }, { value: 'machine', label: 'Machines' }, { value: 'room', label: 'Rooms' }]} />
          <Input size="small" prefix={<SearchOutlined className="muted" />} placeholder={`search ${group}`} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ margin: '10px 0' }} allowClear />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span className="muted">{visible.length} of {resources.length} shown</span>
            <span>
              <a onClick={() => setHidden({ ...hidden, [group]: [] })}>All</a>{' · '}
              <a onClick={() => setHidden({ ...hidden, [group]: resources.map((r: any) => r.id) })}>None</a>
            </span>
          </div>
          <div style={{ display: 'grid', gap: 2, maxHeight: '55vh', overflow: 'auto' }}>
            {resources.filter((r: any) => (r.name + r.sub).toLowerCase().includes(filter.toLowerCase())).map((r: any) => (
              <label key={r.id} style={{ display: 'flex', gap: 8, padding: '6px 4px', borderRadius: 6, cursor: 'pointer', alignItems: 'flex-start' }}>
                <Checkbox checked={!hidden[group].includes(r.id)} onChange={(e) => setHidden({ ...hidden, [group]: e.target.checked ? hidden[group].filter((x) => x !== r.id) : [...hidden[group], r.id] })} />
                <span style={{ lineHeight: 1.25, minWidth: 0 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.color, marginRight: 6 }} />
                  <b style={{ fontSize: 13 }}>{r.name}</b>
                  {r.status && r.status !== 'OPERATIONAL' && <span style={{ color: '#C8372D', fontSize: 11 }}> · {r.status.toLowerCase().replace(/_/g, ' ')}</span>}
                  {r.sub && <div className="muted" style={{ fontSize: 11 }}>{r.sub}</div>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid #ECEAE4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #ECEAE4', flexWrap: 'wrap' }}>
            <Segmented value={view} onChange={(v) => setView(v as 'day' | 'week')} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
            <Button icon={<LeftOutlined />} onClick={() => setDate(date.subtract(days, 'day'))} aria-label="Previous" />
            <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} format={view === 'day' ? 'ddd, DD MMM YYYY' : '[Week of] DD MMM YYYY'} />
            <Button icon={<RightOutlined />} onClick={() => setDate(date.add(days, 'day'))} aria-label="Next" />
            <Button onClick={() => setDate(dayjs())}>Today</Button>
            <Tooltip title="Reload"><Button icon={<ReloadOutlined spin={loading} />} onClick={reload} /></Tooltip>
            <Checkbox checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)}>Hide cancelled / no-show</Checkbox>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
              {statusOrder.map((s) => <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[s].dot }} />{STATUS[s].label}</span>)}
            </div>
          </div>

          {columns.length === 0 ? <Empty style={{ padding: 60 }} description="Select at least one resource on the left" /> : (
            <div ref={scroller} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
              <div style={{ display: 'flex', minWidth: 'fit-content' }}>
                {/* time gutter */}
                <div style={{ width: 64, flexShrink: 0, position: 'sticky', left: 0, background: '#fff', zIndex: 3, borderRight: '1px solid #ECEAE4' }}>
                  <div style={{ height: 48, borderBottom: '1px solid #ECEAE4', position: 'sticky', top: 0, background: '#fff', zIndex: 9 }} />
                  {Array.from({ length: slots }, (_, i) => {
                    const m = openMin + i * slotMin;
                    return <div key={i} style={{ height: SLOT_H, fontSize: 11, textAlign: 'right', paddingRight: 8, color: m % 60 === 0 ? '#1F1D1A' : '#A8A49B', fontWeight: m % 60 === 0 ? 600 : 400, transform: 'translateY(-7px)' }}>{m % 30 === 0 ? minToTime(m) : ''}</div>;
                  })}
                </div>
                {columns.map((col) => {
                  const evs = eventsFor(col);
                  const isToday = col.day.isSame(now, 'day');
                  const nowM = minuteOf(now);
                  return (
                    <div key={col.key} style={{ width: colW, flex: view === 'week' ? 1 : undefined, minWidth: view === 'week' ? 130 : undefined, flexShrink: 0, borderRight: '1px solid #ECEAE4' }}>
                      <div style={{ height: 48, padding: '6px 8px', borderBottom: '1px solid #ECEAE4', position: 'sticky', top: 0, background: col.maintenance ? '#FDF1F0' : '#FAF9F6', zIndex: 8, fontSize: 13, overflow: 'hidden' }}>{col.title}</div>
                      <div className="sched-grid" style={{ height: slots * SLOT_H, background: col.maintenance ? 'repeating-linear-gradient(45deg,#fafafa,#fafafa 6px,#f1f0ec 6px,#f1f0ec 12px)' : undefined }}>
                        {Array.from({ length: slots }, (_, i) => {
                          const m = openMin + i * slotMin;
                          return <div key={i} className={canBook ? 'sched-slot' : undefined} onClick={() => onSlot(col, i)} style={{ height: SLOT_H, borderTop: `1px solid ${m % 60 === 0 ? '#E4E1D8' : '#F4F2EE'}` }} />;
                        })}
                        {isToday && nowM > openMin && nowM < closeMin && <div style={{ position: 'absolute', left: 0, right: 0, top: pos(nowM), borderTop: '2px solid #E8833A', zIndex: 4, pointerEvents: 'none' }} />}
                        {evs.map((e) => {
                          const top = pos(Math.max(e.start, openMin)), h = Math.max(SLOT_H, pos(Math.min(e.end, closeMin)) - top) - 2;
                          const w = 100 / (e.lanes ?? 1);
                          const style = { top, height: h, left: `calc(${e.lane! * w}% + 2px)`, width: `calc(${w}% - 4px)` };
                          if (e.kind === 'block')
                            return (
                              <Tooltip key={e.id} title={`Not available · ${e.reason} · ${dayjs(e.startAt).format('DD MMM HH:mm')}–${dayjs(e.endAt).format('HH:mm')}`}>
                                <div className="sched-event" style={{ ...style, background: 'repeating-linear-gradient(45deg,#E9E7E1,#E9E7E1 6px,#DDDAD2 6px,#DDDAD2 12px)', color: '#5C5953', cursor: 'default', zIndex: 1 }}>
                                  <b>Not available</b><div>{e.reason}</div>
                                </div>
                              </Tooltip>
                            );
                          const color = e.treatment.color ?? '#8A867E';
                          const struck = ['CANCELLED', 'NO_SHOW'].includes(e.status);
                          return (
                            <div key={e.id} className="sched-event" onClick={() => setOpenId(e.id)}
                              style={{ ...style, background: `${color}1F`, borderLeft: `3px solid ${color}`, opacity: struck ? 0.55 : 1, zIndex: 2 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                                <b style={{ textDecoration: struck ? 'line-through' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dayjs(e.startAt).format('HH:mm')} {e.client.name}</b>
                                <span title={STATUS[e.status].label} style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[e.status].dot, flexShrink: 0, marginTop: 4 }} />
                              </div>
                              {h > 30 && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.treatment.name}</div>}
                              {h > 46 && <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[group !== 'therapist' && e.therapist.name, group !== 'machine' && e.machine?.code, group !== 'room' && e.room.name].filter(Boolean).join(' · ')}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <BookingDrawer open={!!book} onClose={() => setBook(null)} init={book ?? undefined} onSaved={reload} />
      <AppointmentPanel id={openId} open={!!openId} onClose={() => setOpenId(undefined)} onChanged={reload} />
    </>
  );
}

export default function SchedulerPage() {
  return <Suspense><SchedulerInner /></Suspense>;
}
