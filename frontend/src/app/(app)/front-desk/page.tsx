'use client';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Col, DatePicker, Empty, Row, Space, Tag, Tooltip } from 'antd';
import { CheckOutlined, LoginOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { fmtTime, STATUS } from '@/lib/format';
import { ClientCell, PageHeader } from '@/components/ui';
import AppointmentPanel, { CompleteSessionModal, useAppointmentActions } from '@/components/AppointmentPanel';
import BookingDrawer from '@/components/BookingDrawer';

const LANES = [
  { key: 'upcoming', title: 'Upcoming', statuses: ['SCHEDULED', 'CONFIRMED'], color: '#E0A800' },
  { key: 'arrived', title: 'Arrived / waiting', statuses: ['CHECKED_IN'], color: '#2a78d6' },
  { key: 'in', title: 'In treatment', statuses: ['IN_PROGRESS'], color: '#6250d6' },
  { key: 'done', title: 'Completed', statuses: ['COMPLETED'], color: '#2E8B57' },
  { key: 'missed', title: 'No-show / cancelled', statuses: ['NO_SHOW', 'CANCELLED'], color: '#A8A49B' },
];

export default function FrontDesk() {
  const { user, hasRole } = useAuth();
  const [day, setDay] = useState<Dayjs>(dayjs());
  const [openId, setOpenId] = useState<string>();
  const [completing, setCompleting] = useState<any>(null);
  const [book, setBook] = useState(false);
  const from = day.startOf('day'), to = from.add(1, 'day');
  const { data = [], loading, reload } = useApi<any[]>(`/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, []);
  const { setStatus } = useAppointmentActions(reload);
  useEffect(() => { const t = setInterval(reload, 60_000); return () => clearInterval(t); }, [reload]);
  const isToday = day.isSame(dayjs(), 'day');

  const late = (a: any) => isToday && ['SCHEDULED', 'CONFIRMED'].includes(a.status) && dayjs(a.startAt).isBefore(dayjs().subtract(10, 'minute'));

  return (
    <>
      <PageHeader
        crumb="Overview" title={user?.role === 'THERAPIST' ? 'My treatments today' : 'Front Desk Today'}
        sub={`${data.filter((a) => a.status !== 'CANCELLED').length} appointments · ${data.filter((a) => a.status === 'COMPLETED').length} completed · refreshes every minute`}
        extra={<>
          <DatePicker value={day} onChange={(d) => d && setDay(d)} allowClear={false} format="ddd, DD MMM YYYY" />
          <Button onClick={() => setDay(dayjs())}>Today</Button>
          <Tooltip title="Reload"><Button icon={<ReloadOutlined spin={loading} />} onClick={reload} /></Tooltip>
          {hasRole('RECEPTION', 'MANAGER', 'DOCTOR') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setBook(true)}>Walk-in / book</Button>}
        </>}
      />
      <Row gutter={12} wrap={false} style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {LANES.map((lane) => {
          const items = data.filter((a) => lane.statuses.includes(a.status));
          return (
            <Col key={lane.key} flex="1 0 250px">
              <div style={{ background: '#EFEDE7', borderRadius: 12, padding: 10, minHeight: 420 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px 10px' }}>
                  <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: lane.color }} />{lane.title}</b>
                  <Badge count={items.length} showZero color="#8A867E" />
                </div>
                {items.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="None" />}
                <div style={{ display: 'grid', gap: 8 }}>
                  {items.map((a) => (
                    <Card key={a.id} size="small" hoverable onClick={() => setOpenId(a.id)} styles={{ body: { padding: 10 } }} style={{ borderLeft: `3px solid ${a.treatment.color ?? '#ccc'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <b className="tabular">{fmtTime(a.startAt)}–{fmtTime(a.endAt)}</b>
                        {late(a) ? <Tag color="red">Late</Tag> : lane.key === 'missed' ? <Tag>{STATUS[a.status].label}</Tag> : a.status === 'CONFIRMED' ? <Tag color="cyan">Confirmed</Tag> : null}
                      </div>
                      <ClientCell client={a.client} sub={a.client.mobile} />
                      <div style={{ marginTop: 6, fontSize: 13 }}>{a.treatment.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{a.therapist.name} · {a.machine?.code ?? 'no machine'} · {a.room.name}</div>
                      {a.packageItem && <div className="muted" style={{ fontSize: 12 }}>Session {a.packageItem.usedSessions + (a.status === 'COMPLETED' ? 0 : 1)} of {a.packageItem.totalSessions} · {a.packageItem.clientPackage.name}</div>}
                      <Space size={6} style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                        {['SCHEDULED', 'CONFIRMED'].includes(a.status) && <Button size="small" icon={<LoginOutlined />} onClick={() => setStatus(a.id, 'CHECKED_IN')}>Arrived</Button>}
                        {['CHECKED_IN', 'CONFIRMED', 'SCHEDULED'].includes(a.status) && <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setStatus(a.id, 'IN_PROGRESS')}>Start</Button>}
                        {a.status === 'IN_PROGRESS' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setCompleting(a)}>Complete</Button>}
                      </Space>
                    </Card>
                  ))}
                </div>
              </div>
            </Col>
          );
        })}
      </Row>
      <AppointmentPanel id={openId} open={!!openId} onClose={() => setOpenId(undefined)} onChanged={reload} />
      <CompleteSessionModal appt={completing} open={!!completing} onClose={() => setCompleting(null)} onDone={reload} />
      <BookingDrawer open={book} onClose={() => setBook(false)} init={{ startAt: isToday ? dayjs().add(15 - (dayjs().minute() % 15), 'minute').second(0) : day.hour(10).minute(0) }} onSaved={reload} />
    </>
  );
}
