'use client';
import { useEffect, useState } from 'react';
import { App, DatePicker, Form, Modal, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { api } from '@/lib/api';

const REASONS: Record<string, string[]> = {
  MACHINE: ['Scheduled service', 'Deep cleaning', 'Safety check', 'Repair', 'Calibration'],
  THERAPIST: ['Annual leave', 'Sick leave', 'Training', 'Break'],
  ROOM: ['Maintenance', 'Deep cleaning', 'Closed'],
};

/** Blocks a machine, therapist or room for a period; the booking engine then treats it as busy. */
export default function DowntimeModal({ init, onClose, onSaved }: { init: { kind: string; resourceId?: string } | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [res, setRes] = useState<Record<string, { value: string; label: string }[]>>({ MACHINE: [], THERAPIST: [], ROOM: [] });
  const kind = Form.useWatch('kind', form);

  useEffect(() => {
    if (!init) return;
    Promise.all([api<any[]>('/machines'), api<any[]>('/staff'), api<any[]>('/rooms')]).then(([m, s, r]) => setRes({
      MACHINE: m.map((x) => ({ value: x.id, label: `${x.code} · ${x.type.name}` })),
      THERAPIST: s.filter((x) => x.active && x.skills.length).map((x) => ({ value: x.id, label: x.name })),
      ROOM: r.map((x) => ({ value: x.id, label: x.name })),
    }));
    const start = dayjs().add(1, 'day').hour(10).minute(0).second(0);
    form.setFieldsValue({ kind: init.kind, resourceId: init.resourceId, range: [start, start.add(2, 'hour')], reason: REASONS[init.kind][0] });
  }, [init, form]);

  const save = async (v: any) => {
    try {
      await api('/blocks', { method: 'POST', body: { kind: v.kind, resourceId: v.resourceId, startAt: v.range[0].toISOString(), endAt: v.range[1].toISOString(), reason: v.reason } });
      message.success('Downtime scheduled — the slot is now unavailable for booking');
      onClose(); onSaved();
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <Modal open={!!init} onCancel={onClose} title="Schedule downtime / unavailability" okText="Block time" onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="kind" label="Resource type"><Segmented options={[{ value: 'MACHINE', label: 'Machine' }, { value: 'THERAPIST', label: 'Staff' }, { value: 'ROOM', label: 'Room' }]} onChange={(k) => form.setFieldsValue({ resourceId: undefined, reason: REASONS[String(k)][0] })} /></Form.Item>
        <Form.Item name="resourceId" label="Resource" rules={[{ required: true }]}><Select showSearch={{ optionFilterProp: 'label' }} options={res[kind ?? 'MACHINE']} /></Form.Item>
        <Form.Item name="range" label="From – to" rules={[{ required: true }]}><DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD MMM YYYY HH:mm" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true }]}><Select options={(REASONS[kind ?? 'MACHINE'] ?? []).map((value) => ({ value }))} /></Form.Item>
      </Form>
    </Modal>
  );
}
