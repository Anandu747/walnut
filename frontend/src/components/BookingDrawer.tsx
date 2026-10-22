'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Col, DatePicker, Drawer, Form, Input, Row, Select, Space, Switch, Tag, TimePicker, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ThunderboltOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api, ApiError } from '@/lib/api';
import ClientSelect from './ClientSelect';

export type BookingInit = { clientId?: string; treatmentId?: string; startAt?: Dayjs; therapistId?: string; machineId?: string; roomId?: string };
const AUTO = '__auto__';

/**
 * Book or reschedule. Leaving therapist / machine / room on "Auto" lets the server allocate the first free compatible
 * resource. Availability is re-checked live as the receptionist changes treatment or time, before anything is saved.
 */
export default function BookingDrawer({ open, onClose, onSaved, init, appointment }: {
  open: boolean; onClose: () => void; onSaved?: (a: any) => void; init?: BookingInit; appointment?: any;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [treatments, setTreatments] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [avail, setAvail] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reschedule = !!appointment;

  const clientId = Form.useWatch('clientId', form);
  const treatmentId = Form.useWatch('treatmentId', form);
  const date: Dayjs | undefined = Form.useWatch('date', form);
  const time: Dayjs | undefined = Form.useWatch('time', form);
  const therapistId = Form.useWatch('therapistId', form);
  const machineId = Form.useWatch('machineId', form);
  const roomId = Form.useWatch('roomId', form);
  const startAt = date && time ? date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0) : undefined;

  useEffect(() => {
    if (!open) return;
    setError(''); setAvail(null); setSlots([]);
    Promise.all([api<any[]>('/treatments'), api<any[]>('/staff'), api<any[]>('/machines'), api<any[]>('/rooms')]).then(([t, s, m, r]) => {
      setTreatments(t.filter((x) => x.active)); setStaff(s.filter((x) => x.active && x.skills.length)); setMachines(m); setRooms(r.filter((x) => x.active));
    });
    const a = appointment;
    const start = a ? dayjs(a.startAt) : init?.startAt;
    form.setFieldsValue({
      clientId: a?.client?.id ?? a?.clientId ?? init?.clientId, treatmentId: a?.treatment?.id ?? a?.treatmentId ?? init?.treatmentId,
      date: start ?? dayjs(), time: start ?? null,
      // Rescheduling defaults to 'keep current if still free'; the server re-allocates anything that is busy at the new time.
      therapistId: init?.therapistId ?? AUTO, machineId: init?.machineId ?? AUTO, roomId: init?.roomId ?? AUTO,
      clientPackageItemId: a?.clientPackageItemId ?? undefined, confirmed: true, notes: a?.notes ?? undefined,
    });
    // Initialise only when the drawer opens; later parent re-renders must not wipe what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setPkgs([]);
    if (clientId && open) api<any[]>(`/clients/${clientId}/packages`).then(setPkgs).catch(() => {});
  }, [clientId, open]);

  const pkgOptions = useMemo(() => pkgs.filter((p) => p.status === 'ACTIVE').flatMap((p) =>
    p.items.filter((i: any) => i.treatmentId === treatmentId && (i.bookable > 0 || i.id === appointment?.clientPackageItemId)).map((i: any) => ({
      value: i.id, label: `${p.name} — ${i.remaining} left${i.booked ? ` (${i.booked} already booked)` : ''} · expires ${dayjs(p.expiresAt).format('DD MMM')}`,
    }))), [pkgs, treatmentId, appointment]);

  // Default to the client's package balance for this treatment, so sessions are deducted correctly.
  useEffect(() => {
    if (!reschedule && treatmentId) form.setFieldValue('clientPackageItemId', pkgOptions[0]?.value);
  }, [pkgOptions, treatmentId, form, reschedule]);

  // Live availability for the chosen treatment and time.
  useEffect(() => {
    setAvail(null);
    if (!open || !treatmentId || !startAt) return;
    const h = setTimeout(() => {
      api(`/appointments/suggest?treatmentId=${treatmentId}&startAt=${encodeURIComponent(startAt.toISOString())}${appointment ? `&excludeId=${appointment.id}` : ''}`).then(setAvail).catch(() => {});
    }, 150);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, treatmentId, startAt?.valueOf(), appointment]);

  useEffect(() => {
    setSlots([]);
    if (!open || !treatmentId) return;
    const from = date && date.isAfter(dayjs(), 'day') ? date.startOf('day') : dayjs();
    const th = therapistId && therapistId !== AUTO ? `&therapistId=${therapistId}` : '';
    api<any[]>(`/appointments/next-slots?treatmentId=${treatmentId}&count=8&from=${encodeURIComponent(from.toISOString())}${th}`).then(setSlots).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, treatmentId, date?.format('YYYY-MM-DD'), therapistId]);

  const treatment = treatments.find((t) => t.id === treatmentId);
  const qualified = staff.filter((s) => !treatmentId || s.skills.some((k: any) => k.treatmentId === treatmentId));
  const compatible = machines.filter((m) => treatment?.machineTypeId && m.machineTypeId === treatment.machineTypeId);
  const freeIds = new Set([...(avail?.therapists ?? []), ...(avail?.machines ?? []), ...(avail?.rooms ?? [])].map((x: any) => x.id));
  const tag = (id: string) => (avail ? (freeIds.has(id) ? ' · free' : ' · busy') : '');

  const checks: { ok: boolean; text: string }[] = [];
  if (avail) {
    checks.push({ ok: avail.inHours, text: avail.inHours ? 'Within working hours' : 'Outside working hours for this duration' });
    const pickT = therapistId && therapistId !== AUTO ? freeIds.has(therapistId) : avail.therapists.length > 0;
    checks.push({ ok: pickT, text: therapistId && therapistId !== AUTO ? `${staff.find((s) => s.id === therapistId)?.name ?? 'Therapist'} ${pickT ? 'is free' : 'is busy / on leave'}` : `${avail.therapists.length} qualified therapist(s) free` });
    if (treatment?.machineTypeId) {
      const pickM = machineId && machineId !== AUTO ? freeIds.has(machineId) : avail.machines.length > 0;
      checks.push({ ok: pickM, text: machineId && machineId !== AUTO ? `${machines.find((m) => m.id === machineId)?.code} ${pickM ? 'is free' : 'is busy / in maintenance'}` : `${avail.machines.map((m: any) => m.code).join(', ') || 'No machine'} free` });
    }
    const pickR = roomId && roomId !== AUTO ? freeIds.has(roomId) : avail.rooms.length > 0;
    checks.push({ ok: pickR, text: roomId && roomId !== AUTO ? `${rooms.find((r) => r.id === roomId)?.name} ${pickR ? 'is free' : 'is occupied'}` : `${avail.rooms.length} room(s) free` });
  }
  const allOk = checks.length > 0 && checks.every((c) => c.ok);

  const submit = async (v: any) => {
    if (!startAt) return;
    setSaving(true); setError('');
    const pick = (x: string) => (x && x !== AUTO ? x : undefined);
    try {
      const body = { startAt: startAt.toISOString(), therapistId: pick(v.therapistId), machineId: treatment?.machineTypeId ? pick(v.machineId) : undefined, roomId: pick(v.roomId) };
      const a = reschedule
        ? await api(`/appointments/${appointment.id}`, { method: 'PATCH', body: { ...body, notes: v.notes } })
        : await api('/appointments', { method: 'POST', body: { ...body, clientId: v.clientId, treatmentId: v.treatmentId, clientPackageItemId: v.clientPackageItemId, notes: v.notes, status: v.confirmed ? 'CONFIRMED' : 'SCHEDULED' } });
      message.success(reschedule ? 'Appointment rescheduled' : `Booked ${treatment?.name} at ${startAt.format('DD MMM, HH:mm')}`);
      onSaved?.(a);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const grouped = [...new Set(treatments.map((t) => t.category))].map((cat) => ({
    label: cat, options: treatments.filter((t) => t.category === cat).map((t) => ({ value: t.id, label: `${t.name} · ${t.durationMin} min` })),
  }));

  return (
    <Drawer
      open={open} onClose={onClose} size={620} destroyOnHidden
      title={reschedule ? `Reschedule · ${appointment.client?.name}` : 'Book appointment'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>{treatment ? `${treatment.durationMin} min + ${treatment.bufferMin} min prep/cleaning` : ''}</span>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>{reschedule ? 'Save changes' : 'Book appointment'}</Button>
          </Space>
        </div>
      }
    >
      {error && <Alert type="error" showIcon title="Cannot book this slot" description={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional" onValuesChange={() => setError('')}>
        <Form.Item name="clientId" label="Client" rules={[{ required: true, message: 'Select a client' }]}
          extra={!reschedule && <Link href="/clients/new"><UserAddOutlined /> Register a new client</Link>}>
          <ClientSelect />
        </Form.Item>
        <Form.Item name="treatmentId" label="Treatment / service" rules={[{ required: true, message: 'Select a treatment' }]}>
          <Select disabled={reschedule} showSearch={{ optionFilterProp: 'label' }} placeholder="Select treatment" options={grouped}
            onChange={() => form.setFieldsValue({ therapistId: AUTO, machineId: AUTO, roomId: AUTO })} />
        </Form.Item>
        {!reschedule && (
          <Form.Item name="clientPackageItemId" label="Deduct from package"
            extra={clientId && treatmentId && !pkgOptions.length ? 'No active package balance for this treatment — the session will be billed separately.' : undefined}>
            <Select allowClear placeholder="Pay per visit" options={pkgOptions} />
          </Form.Item>
        )}
        <Row gutter={12}>
          <Col span={12}><Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="ddd, DD MMM YYYY" /></Form.Item></Col>
          <Col span={12}><Form.Item name="time" label="Start time" rules={[{ required: true, message: 'Pick a time or a free slot below' }]}><TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={15} needConfirm={false} /></Form.Item></Col>
        </Row>
        {treatmentId && slots.length > 0 && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}><ThunderboltOutlined /> Next free slots with therapist, machine and room available:</Typography.Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {slots.map((s) => {
                const d = dayjs(s.startAt);
                const active = startAt && d.isSame(startAt);
                return (
                  <Tag.CheckableTag key={s.startAt} checked={!!active} onChange={() => form.setFieldsValue({ date: d, time: d })} style={{ border: '1px solid #E5DCC5', padding: '2px 10px' }}>
                    {d.isSame(dayjs(), 'day') ? 'Today' : d.format('ddd DD')} {d.format('HH:mm')}
                  </Tag.CheckableTag>
                );
              })}
            </div>
          </div>
        )}
        <Row gutter={12}>
          <Col span={treatment?.machineTypeId ? 8 : 12}>
            <Form.Item name="therapistId" label="Therapist">
              <Select options={[{ value: AUTO, label: reschedule ? 'Keep current if free' : 'Auto (first free)' }, ...qualified.map((s) => ({ value: s.id, label: s.name + tag(s.id) }))]} />
            </Form.Item>
          </Col>
          {treatment?.machineTypeId && (
            <Col span={8}>
              <Form.Item name="machineId" label="Machine">
                <Select options={[{ value: AUTO, label: reschedule ? 'Keep current' : 'Auto' }, ...compatible.map((m) => ({ value: m.id, label: m.code + (m.status !== 'OPERATIONAL' ? ' · maintenance' : tag(m.id)), disabled: m.status !== 'OPERATIONAL' }))]} />
              </Form.Item>
            </Col>
          )}
          <Col span={treatment?.machineTypeId ? 8 : 12}>
            <Form.Item name="roomId" label="Room">
              <Select options={[{ value: AUTO, label: reschedule ? 'Keep current' : 'Auto' }, ...rooms.map((r) => ({ value: r.id, label: r.name + tag(r.id) }))]} />
            </Form.Item>
          </Col>
        </Row>
        {checks.length > 0 && (
          <Alert
            type={allOk ? 'success' : 'warning'} showIcon={false} style={{ marginBottom: 16 }}
            title={<b>{allOk ? 'All resources available' : 'Conflict — choose another time or resource'}</b>}
            description={
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {checks.map((c) => <span key={c.text}>{c.ok ? <CheckCircleFilled style={{ color: '#2E8B57' }} /> : <CloseCircleFilled style={{ color: '#C8372D' }} />} {c.text}</span>)}
              </div>
            }
          />
        )}
        {!reschedule && <Form.Item name="confirmed" label="Confirmed with client" valuePropName="checked"><Switch /></Form.Item>}
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} placeholder="e.g. Focus on abdomen, client prefers female therapist" /></Form.Item>
      </Form>
    </Drawer>
  );
}
