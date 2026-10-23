'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Checkbox, Col, DatePicker, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Row, Select, Space, Spin } from 'antd';
import { CheckOutlined, ClockCircleOutlined, FileTextOutlined, LoginOutlined, PlayCircleOutlined, ScheduleOutlined, StopOutlined, WhatsAppOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { ClientCell, StatusTag } from './ui';
import BookingDrawer from './BookingDrawer';

/** Moves an appointment through its lifecycle. Completion requires explicit delivery confirmation (who/what/when). */
export function useAppointmentActions(onChanged: () => void) {
  const { message } = App.useApp();
  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/appointments/${id}/status`, { method: 'PATCH', body: { status } });
      message.success('Status updated');
      onChanged();
    } catch (e) { message.error((e as Error).message); }
  };
  return { setStatus };
}

export function CompleteSessionModal({ appt, open, onClose, onDone }: { appt: any; open: boolean; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [staff, setStaff] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !appt) return;
    api<any[]>('/staff').then((s) => setStaff(s.filter((x) => x.skills.some((k: any) => k.treatmentId === appt.treatment?.id))));
    api<any[]>('/machines').then(setMachines);
    const start = dayjs(appt.startAt);
    form.setFieldsValue({ actual: [start, start.add(appt.treatment?.durationMin ?? 60, 'minute')], therapistId: appt.therapistId ?? appt.therapist?.id, machineId: appt.machineId ?? appt.machine?.id, confirm: false, notes: undefined });
  }, [open, appt, form]);

  const submit = async (v: any) => {
    setSaving(true);
    try {
      const r = await api<{ remaining: number | null }>(`/appointments/${appt.id}/complete`, {
        method: 'POST', body: { confirm: true, actualStart: v.actual[0].toISOString(), actualEnd: v.actual[1].toISOString(), therapistId: v.therapistId, machineId: v.machineId || undefined, notes: v.notes },
      });
      message.success(r.remaining != null ? `Session recorded — ${r.remaining} session(s) left on this package` : 'Session recorded');
      onDone();
      onClose();
    } catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };

  const typeMachines = machines.filter((m) => !appt?.machine || m.machineTypeId === machines.find((x) => x.id === (appt.machineId ?? appt.machine?.id))?.machineTypeId);
  return (
    <Modal open={open} onCancel={onClose} title="Confirm treatment delivery" okText="Complete session" onOk={() => form.submit()} confirmLoading={saving} destroyOnHidden width={560}>
      {appt && (
        <>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} title={`${appt.client?.name} · ${appt.treatment?.name}`}
            description={appt.packageItem ? `Deducts 1 session from "${appt.packageItem.clientPackage.name}" (${appt.packageItem.totalSessions - appt.packageItem.usedSessions} left before this session).` : 'Pay-per-visit session (not linked to a package).'} />
          <Form form={form} layout="vertical" onFinish={submit}>
            <Form.Item name="actual" label="Actual start – end" rules={[{ required: true }]}>
              <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD MMM HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="therapistId" label="Delivered by" rules={[{ required: true }]}><Select options={staff.map((s) => ({ value: s.id, label: s.name }))} /></Form.Item></Col>
              <Col span={12}><Form.Item name="machineId" label="Machine used"><Select allowClear disabled={!appt.machine} options={typeMachines.map((m) => ({ value: m.id, label: m.code }))} /></Form.Item></Col>
            </Row>
            <Form.Item name="notes" label="Session notes"><Input.TextArea rows={2} placeholder="Areas treated, intensity, client response" /></Form.Item>
            <Form.Item name="confirm" valuePropName="checked" rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Please confirm delivery'))) }]}>
              <Checkbox>I confirm this treatment was delivered to the client</Checkbox>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

export default function AppointmentPanel({ id, open, onClose, onChanged }: { id?: string; open: boolean; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth();
  const [a, setA] = useState<any>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [resched, setResched] = useState(false);
  const load = () => id && api(`/appointments/${id}`).then(setA).catch(() => setA(null));
  useEffect(() => { setA(null); if (open) load(); }, [id, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = () => { load(); onChanged(); };
  const { setStatus } = useAppointmentActions(changed);
  const live = a && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status);
  const canBook = hasRole('RECEPTION', 'MANAGER');
  // Package sessions are already paid for; only pay-per-visit appointments get their own invoice.
  const billable = a && !a.packageItem && !['CANCELLED', 'NO_SHOW'].includes(a.status) && hasRole('RECEPTION', 'MANAGER', 'ACCOUNTANT');
  const invoice = a?.invoices?.[0];

  return (
    <>
      <Drawer open={open} onClose={onClose} size={460} title="Appointment" destroyOnHidden>
        {!a ? <Spin /> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <ClientCell client={a.client} sub={`${a.client.clientNo} · ${a.client.mobile}`} />
              <StatusTag status={a.status} />
            </div>
            <Descriptions column={1} size="small" bordered styles={{ label: { width: 120 } }}
              items={[
                { label: 'Treatment', children: <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: a.treatment.color ?? '#ccc', marginRight: 6 }} />{a.treatment.name}</span> },
                { label: 'When', children: `${dayjs(a.startAt).format('ddd DD MMM YYYY')}, ${fmtTime(a.startAt)} – ${fmtTime(a.endAt)}` },
                { label: 'Therapist', children: a.therapist.name },
                { label: 'Machine', children: a.machine?.code ?? '—' },
                { label: 'Room', children: a.room.name },
                { label: 'Package', children: a.packageItem ? `${a.packageItem.clientPackage.name} (${a.packageItem.usedSessions}/${a.packageItem.totalSessions} used)` : 'Pay per visit' },
                ...(a.notes ? [{ label: 'Notes', children: a.notes }] : []),
                ...(a.session ? [{ label: 'Delivered', children: `${fmtDateTime(a.session.actualStart)} – ${fmtTime(a.session.actualEnd)}${a.session.notes ? ` · ${a.session.notes}` : ''}` }] : []),
                ...(invoice ? [{ label: 'Invoice', children: <Link href={`/billing/${invoice.id}`}>{invoice.number}</Link> }] : []),
              ]}
            />
            {billable && !invoice && (
              <Button block type={live ? 'default' : 'primary'} icon={<FileTextOutlined />} style={{ marginTop: 16 }} href={`/billing/new?clientId=${a.client.id}&appointmentId=${a.id}`}>Generate invoice</Button>
            )}
            {live && (
              <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
                {a.status === 'SCHEDULED' && canBook && <Button icon={<CheckOutlined />} onClick={() => setStatus(a.id, 'CONFIRMED')}>Mark confirmed</Button>}
                {['SCHEDULED', 'CONFIRMED'].includes(a.status) && <Button icon={<LoginOutlined />} onClick={() => setStatus(a.id, 'CHECKED_IN')}>Client arrived (check in)</Button>}
                {['CONFIRMED', 'CHECKED_IN', 'SCHEDULED'].includes(a.status) && <Button icon={<PlayCircleOutlined />} onClick={() => setStatus(a.id, 'IN_PROGRESS')}>Start treatment</Button>}
                <Button type="primary" icon={<CheckOutlined />} onClick={() => setCompleteOpen(true)}>Complete session…</Button>
                {canBook && <Button icon={<ScheduleOutlined />} onClick={() => setResched(true)}>Reschedule / change resources</Button>}
                <Space.Compact block>
                  {canBook && (
                    <Popconfirm title="Mark as no-show?" description="The package session is not deducted." onConfirm={() => setStatus(a.id, 'NO_SHOW')}>
                      <Button block icon={<ClockCircleOutlined />}>No-show</Button>
                    </Popconfirm>
                  )}
                  {canBook && (
                    <Popconfirm title="Cancel this appointment?" description="The slot is released for other bookings." onConfirm={() => setStatus(a.id, 'CANCELLED')}>
                      <Button block danger icon={<StopOutlined />}>Cancel</Button>
                    </Popconfirm>
                  )}
                </Space.Compact>
                <Button icon={<WhatsAppOutlined />} href={`/messages?clientId=${a.client.id}&purpose=REMINDER&appointmentId=${a.id}`}>Send reminder</Button>
              </div>
            )}
            <div style={{ marginTop: 20 }}><Link href={`/clients/${a.client.id}`}>Open client profile →</Link></div>
          </>
        )}
      </Drawer>
      <CompleteSessionModal appt={a} open={completeOpen} onClose={() => setCompleteOpen(false)} onDone={changed} />
      <BookingDrawer open={resched} onClose={() => setResched(false)} appointment={a} onSaved={changed} />
    </>
  );
}

