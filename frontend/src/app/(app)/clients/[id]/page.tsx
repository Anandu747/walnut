'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Avatar, Button, Card, Col, Descriptions, Empty, Form, Row, Skeleton, Space, Tabs, Tag, Tooltip } from 'antd';
import { CalendarOutlined, CrownFilled, EditOutlined, ShoppingCartOutlined, WarningFilled, WhatsAppOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { age, fmtDate, fmtTime, initials, money } from '@/lib/format';
import { GOLD } from '@/lib/theme';
import ClientForm, { fromForm, toForm } from '@/components/ClientForm';
import AssessmentTab, { METRICS } from '@/components/client/AssessmentTab';
import { AppointmentsTab, BillingTab, ConsultationsTab, DocumentsTab, MessagesTab, PackagesTab, TimelineTab } from '@/components/client/ClientTabs';
import BookingDrawer from '@/components/BookingDrawer';
import AppointmentPanel from '@/components/AppointmentPanel';

function ClientInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const { data: c, reload } = useApi<any>(`/clients/${id}`);
  const [tab, setTab] = useState(params.get('tab') ?? 'overview');
  const [book, setBook] = useState(params.get('book') === '1');
  const [openAppt, setOpenAppt] = useState<string>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const front = hasRole('RECEPTION', 'MANAGER', 'DOCTOR');
  const finance = hasRole('RECEPTION', 'MANAGER', 'ACCOUNTANT');
  const clinical = hasRole('DOCTOR', 'MANAGER');

  useEffect(() => { if (c && tab === 'registration') form.setFieldsValue(toForm(c)); }, [c, tab, form]);

  if (!c) return <Skeleton active avatar paragraph={{ rows: 8 }} />;

  const saveProfile = async (v: any) => {
    setSaving(true);
    try { await api(`/clients/${id}`, { method: 'PATCH', body: fromForm(v) }); message.success('Client details updated'); reload(); }
    catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };

  const activePkgs = c.packages.filter((p: any) => p.status === 'ACTIVE');
  const sessionsLeft = activePkgs.reduce((s: number, p: any) => s + p.items.reduce((t: number, i: any) => t + i.totalSessions - i.usedSessions, 0), 0);
  const last = c.measurements[c.measurements.length - 1], base = c.measurements[0];
  const next = c.appointments?.filter((a: any) => dayjs(a.startAt).isAfter(dayjs()) && ['SCHEDULED', 'CONFIRMED'].includes(a.status)).slice(-1)[0];
  const reviewOverdue = c.nextReviewDate && dayjs(c.nextReviewDate).isBefore(dayjs(), 'day');

  const overview = (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={8}>
        <Card size="small" title="Programme">
          {activePkgs.length ? activePkgs.map((p: any) => (
            <div key={p.id} style={{ marginBottom: 12 }}>
              <b>{p.name}</b> <span className="muted" style={{ fontSize: 12 }}>· expires {fmtDate(p.expiresAt)}</span>
              {p.items.map((i: any) => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{i.treatment.name}</span><span className="tabular">{i.totalSessions - i.usedSessions} / {i.totalSessions} left</span></div>)}
            </div>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active package" />}
          {c.goal && <div style={{ marginTop: 8, padding: 10, background: '#FBF3DF', borderRadius: 8 }}><span className="muted">Goal:</span> {c.goal}{c.targetWeightKg ? ` · target ${c.targetWeightKg} kg` : ''}</div>}
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Card size="small" title="Body composition" extra={<a onClick={() => setTab('assessment')}>Details</a>}>
          {!last ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No measurements" /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {METRICS.filter(([k]) => ['weightKg', 'bodyFatPct', 'waistCm', 'muscleMassKg'].includes(k)).map(([k, label, unit, lb]) => {
                const d = last[k] != null && base[k] != null ? Math.round((last[k] - base[k]) * 10) / 10 : null;
                return (
                  <div key={k} style={{ background: '#FAF9F6', borderRadius: 8, padding: 10 }}>
                    <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 650 }}>{last[k] ?? '—'} <span style={{ fontSize: 12, fontWeight: 400 }} className="muted">{unit}</span></div>
                    {d != null && d !== 0 && <div className={(d < 0) === lb ? 'delta-up' : 'delta-down'} style={{ fontSize: 12 }}>{d > 0 ? '+' : ''}{d} {unit} since {fmtDate(base.recordedAt)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Card size="small" title="Next steps">
          <Descriptions column={1} size="small" items={[
            { label: 'Next appointment', children: next ? `${dayjs(next.startAt).format('ddd DD MMM')}, ${fmtTime(next.startAt)} · ${next.treatment.name}` : <span className="muted">None booked</span> },
            { label: 'Doctor review', children: c.nextReviewDate ? <Tag color={reviewOverdue ? 'red' : 'gold'}>{reviewOverdue ? 'Overdue since ' : ''}{fmtDate(c.nextReviewDate)}</Tag> : '—' },
            { label: 'Sessions completed', children: c.summary?.completedSessions ?? '—' },
            { label: 'No-shows', children: c.summary?.noShows ?? '—' },
            ...(finance && c.summary ? [{ label: 'Balance due', children: c.summary.balanceDue > 0 ? <b style={{ color: '#C8372D' }}>{money(c.summary.balanceDue)}</b> : 'Nil' }] : []),
          ]} />
        </Card>
      </Col>
      <Col span={24}>
        <Card size="small" title="Profile">
          <Descriptions column={{ xs: 1, md: 2, xl: 4 }} size="small" items={[
            { label: 'Mobile', children: c.mobile }, { label: 'Email', children: c.email ?? '—' }, { label: 'Date of birth', children: c.dob ? `${fmtDate(c.dob)} (${age(c.dob)} yrs)` : '—' },
            { label: 'Nationality', children: c.nationality ?? '—' }, { label: 'Emirates ID', children: c.emiratesId ?? '—' }, { label: 'Address', children: c.address ?? '—' },
            { label: 'Source', children: `${c.source ?? '—'}${c.referredBy ? ` (ref. ${c.referredBy})` : ''}` }, { label: 'Marketing offer', children: c.offer ?? '—' }, { label: 'Emergency contact', children: c.emergencyName ? `${c.emergencyName} (${c.emergencyRelation}) ${c.emergencyPhone ?? ''}` : '—' },
            { label: 'Conditions', children: c.conditions ?? 'None reported' }, { label: 'Medications', children: c.medications ?? 'None' }, { label: 'Allergies', children: c.allergies ?? 'None known' },
            { label: 'Consents', children: <Space size={4} wrap><Tag color={c.consentSigned ? 'green' : 'orange'}>Treatment {c.consentSigned ? '✓' : 'pending'}</Tag><Tag color={c.photoConsent ? 'green' : 'default'}>Photos {c.photoConsent ? '✓' : '✗'}</Tag><Tag color={c.whatsappOptIn ? 'green' : 'default'}>WhatsApp {c.whatsappOptIn ? '✓' : '✗'}</Tag></Space> },
          ]} />
        </Card>
      </Col>
    </Row>
  );

  const tabs = [
    { key: 'overview', label: 'Overview', children: overview },
    ...(front ? [{
      key: 'registration', label: 'Registration', children: (
        <>
          <ClientForm form={form} onFinish={saveProfile} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="primary" loading={saving} onClick={() => form.submit()} icon={<EditOutlined />}>Save changes</Button></div>
        </>
      ),
    }] : []),
    { key: 'assessment', label: 'Assessment', children: <AssessmentTab client={c} onChanged={reload} canEdit={hasRole('DOCTOR', 'MANAGER', 'RECEPTION', 'THERAPIST')} /> },
    { key: 'consultations', label: `Consultations (${c.consultations.length})`, children: <ConsultationsTab client={c} onChanged={reload} canEdit={clinical} /> },
    { key: 'packages', label: `Packages (${c.packages.length})`, children: <PackagesTab client={c} onChanged={reload} canSell={finance} canManage={hasRole('MANAGER')} /> },
    { key: 'appointments', label: 'Appointments', children: <AppointmentsTab client={c} onOpen={setOpenAppt} onBook={() => setBook(true)} canBook={front} /> },
    ...(finance ? [{ key: 'billing', label: 'Billing', children: <BillingTab client={c} canBill={finance} /> }] : []),
    { key: 'documents', label: `Documents (${c.documents.length})`, children: <DocumentsTab client={c} onChanged={reload} canEdit={front} canDelete={hasRole('MANAGER')} /> },
    ...(front ? [{ key: 'messages', label: 'Messages', children: <MessagesTab client={c} /> }, { key: 'timeline', label: 'Timeline', children: <TimelineTab clientId={c.id} /> }] : []),
  ];

  return (
    <>
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <Avatar size={72} style={{ background: '#F3E9D2', color: '#7A5608', fontSize: 26, fontWeight: 600 }}>{initials(c.name)}</Avatar>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650 }}>{c.title ? `${c.title} ` : ''}{c.name}</h1>
              {c.vip && <Tag color="gold" icon={<CrownFilled />}>VIP</Tag>}
              {!c.active && <Tag>Inactive</Tag>}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              <b style={{ color: '#1F1D1A' }}>{c.clientNo}</b> · {c.gender ?? '—'}{age(c.dob) ? `, ${age(c.dob)} yrs` : ''} · {c.mobile} · client since {fmtDate(c.createdAt)}
            </div>
            <Space size={6} wrap style={{ marginTop: 8 }}>
              <Tag color="green">{activePkgs.length} active package(s) · {sessionsLeft} sessions left</Tag>
              {reviewOverdue && <Tag color="red">Review overdue</Tag>}
              {!c.consentSigned && <Tag color="orange">Consent pending</Tag>}
              {finance && c.summary?.balanceDue > 0 && <Tag color="red">Balance {money(c.summary.balanceDue)}</Tag>}
            </Space>
          </div>
          <Space wrap>
            {front && <Button icon={<CalendarOutlined />} onClick={() => setBook(true)}>Book</Button>}
            {finance && <Button icon={<ShoppingCartOutlined />} onClick={() => router.push(`/billing/new?clientId=${c.id}`)}>Sell package / bill</Button>}
            {front && (
              <Tooltip title={c.whatsappOptIn ? 'Send a WhatsApp message' : 'Client has not opted in to WhatsApp'}>
                <Link href={`/messages?clientId=${c.id}`}><Button icon={<WhatsAppOutlined style={{ color: '#25D366' }} />} disabled={!c.whatsappOptIn}>Message</Button></Link>
              </Tooltip>
            )}
          </Space>
        </div>
        {c.contraindications && (
          <Alert type="error" showIcon icon={<WarningFilled />} style={{ marginTop: 16 }} title="Contraindications / restrictions" description={c.contraindications} />
        )}
        {c.allergies && <div style={{ marginTop: 8, color: '#B25E09' }}><WarningFilled style={{ color: GOLD }} /> Allergies: <b>{c.allergies}</b></div>}
      </Card>
      <Tabs activeKey={tab} onChange={setTab} items={tabs} destroyOnHidden={false} />
      <BookingDrawer open={book} onClose={() => setBook(false)} init={{ clientId: c.id }} onSaved={reload} />
      <AppointmentPanel id={openAppt} open={!!openAppt} onClose={() => setOpenAppt(undefined)} onChanged={reload} />
    </>
  );
}

export default function ClientPage() {
  return <Suspense><ClientInner /></Suspense>;
}
