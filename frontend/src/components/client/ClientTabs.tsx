'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Col, DatePicker, Empty, Form, Image, Input, InputNumber, Modal, Popconfirm, Progress, Row, Segmented, Select, Space, Table, Tag, Timeline, Upload } from 'antd';
import { DeleteOutlined, EyeOutlined, FilePdfOutlined, PlusOutlined, ShoppingCartOutlined, UploadOutlined, WhatsAppOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, apiBlobUrl } from '@/lib/api';
import { clean, fmtDate, fmtDateTime, fmtTime, humanize, INVOICE_STATUS, money, PACKAGE_PROGRESS, PACKAGE_STATUS } from '@/lib/format';
import { StatusTag } from '../ui';

// ---------------- Consultations ----------------
export function ConsultationsTab({ client, onChanged, canEdit }: { client: any; onChanged: () => void; canEdit: boolean }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const save = async (v: any) => {
    setSaving(true);
    try {
      await api(`/clients/${client.id}/consultations`, { method: 'POST', body: clean(v) });
      message.success(`Consultation saved — next review in ${v.reviewIntervalDays} days`);
      setOpen(false); form.resetFields(); onChanged();
    } catch (e) { message.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="muted">Next review: <b>{client.nextReviewDate ? fmtDate(client.nextReviewDate) : 'not scheduled'}</b> · interval {client.reviewIntervalDays} days</span>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.setFieldsValue({ kind: client.consultations.length ? 'REVIEW' : 'INITIAL', reviewIntervalDays: client.reviewIntervalDays }); setOpen(true); }}>New consultation</Button>}
      </div>
      {!client.consultations.length ? <Card><Empty description="No consultations yet" /></Card> : (
        <Card>
          <Timeline items={client.consultations.map((c: any) => ({
            color: c.kind === 'INITIAL' ? 'gold' : 'blue',
            content: (
              <div style={{ paddingBottom: 8 }}>
                <div><b>{fmtDateTime(c.date)}</b> <Tag color={c.kind === 'INITIAL' ? 'gold' : 'blue'}>{c.kind === 'INITIAL' ? 'Initial assessment' : 'Progress review'}</Tag> <span className="muted">by {c.doctor?.name}</span></div>
                {c.complaint && <div style={{ marginTop: 4 }}><span className="muted">Concern:</span> {c.complaint}</div>}
                {c.notes && <div style={{ marginTop: 4 }}>{c.notes}</div>}
                {c.suitability && <div style={{ marginTop: 4 }}><span className="muted">Suitability:</span> {c.suitability}</div>}
                {c.plan && <div style={{ marginTop: 4 }}><span className="muted">Plan:</span> {c.plan}</div>}
                {c.nextReviewDate && <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>Next review set for {fmtDate(c.nextReviewDate)}</div>}
              </div>
            ),
          }))} />
        </Card>
      )}
      <Modal open={open} onCancel={() => setOpen(false)} title="Consultation" okText="Save consultation" onOk={() => form.submit()} confirmLoading={saving} width={640} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="kind" label="Type"><Segmented options={[{ value: 'INITIAL', label: 'Initial assessment' }, { value: 'REVIEW', label: '15-day progress review' }]} /></Form.Item>
          <Form.Item name="complaint" label="Chief concern"><Input placeholder="e.g. stubborn lower-abdominal fat" /></Form.Item>
          <Form.Item name="notes" label="Assessment notes"><Input.TextArea rows={3} placeholder="Findings, analyzer interpretation, progress vs last review" /></Form.Item>
          <Form.Item name="suitability" label="Treatment suitability"><Select allowClear options={['Suitable for non-surgical body contouring', 'Suitable with restrictions (see notes)', 'Not suitable — refer to GP'].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="plan" label="Treatment plan / recommendation"><Input.TextArea rows={2} placeholder="e.g. Mixed package: 4 Cryo + 4 Endospheres + 2 Onda Pro, weekly" /></Form.Item>
          <Form.Item name="reviewIntervalDays" label="Next review in" extra="Default is 15 days; adjust per client" rules={[{ required: true }]}><InputNumber min={1} max={365} suffix="days" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---------------- Packages ----------------
export function PackagesTab({ client, onChanged, canSell, canManage }: { client: any; onChanged: () => void; canSell: boolean; canManage: boolean }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [form] = Form.useForm();
  const load = () => api<any[]>(`/clients/${client.id}/packages`).then(setPkgs).catch(() => {});
  useEffect(() => { load(); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (v: any) => {
    try {
      await api(`/packages/${edit.id}`, { method: 'PATCH', body: { reason: v.reason, status: v.status, expiresAt: v.expiresAt?.toISOString() } });
      message.success('Package updated'); setEdit(null); load(); onChanged();
    } catch (e) { message.error((e as Error).message); }
  };
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canSell && <Button type="primary" icon={<ShoppingCartOutlined />} onClick={() => router.push(`/billing/new?clientId=${client.id}`)}>Sell package</Button>}
      </div>
      {!pkgs.length ? <Card><Empty description="No packages yet" /></Card> : (
        <Row gutter={[16, 16]}>
          {pkgs.map((p) => {
            const days = dayjs(p.expiresAt).diff(dayjs(), 'day');
            return (
              <Col xs={24} lg={12} key={p.id}>
                <Card size="small" title={p.name} style={{ opacity: p.status === 'ACTIVE' ? 1 : 0.75 }}
                  extra={<Space>{p.progress && <Tag color={PACKAGE_PROGRESS[p.progress].color}>{PACKAGE_PROGRESS[p.progress].label}</Tag>}{p.status !== 'ACTIVE' && p.status !== 'COMPLETED' && <Tag color={PACKAGE_STATUS[p.status]}>{humanize(p.status)}</Tag>}{canManage && <a onClick={() => { setEdit(p); form.setFieldsValue({ expiresAt: dayjs(p.expiresAt), status: p.status, reason: undefined }); }}>Manage</a>}</Space>}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    Bought {fmtDate(p.purchasedAt)} · {money(p.price)} · expires {fmtDate(p.expiresAt)}
                    {p.status === 'ACTIVE' && days <= 14 && <Tag color={days < 0 ? 'red' : 'orange'} style={{ marginLeft: 6 }}>{days < 0 ? 'expired' : `${days} days left`}</Tag>}
                    <div>Therapist: <b style={{ color: '#1F1D1A' }}>{p.therapists?.length ? p.therapists.map((t: any) => t.name).join(', ') : 'not booked yet'}</b></div>
                  </div>
                  {p.items.map((i: any) => (
                    <div key={i.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: i.treatment.color, marginRight: 6 }} />{i.treatment.name}</span>
                        <span className="tabular"><b>{i.remaining}</b> left of {i.totalSessions}{i.booked ? <span className="muted"> · {i.booked} booked</span> : null}</span>
                      </div>
                      <Progress percent={Math.round((i.usedSessions / i.totalSessions) * 100)} success={{ percent: Math.round(((i.usedSessions) / i.totalSessions) * 100) }} showInfo={false} size="small" />
                    </div>
                  ))}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <Modal open={!!edit} onCancel={() => setEdit(null)} title={`Manage package · ${edit?.name}`} okText="Save" onOk={() => form.submit()} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="expiresAt" label="Expiry date"><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={['ACTIVE', 'EXPIRED', 'CANCELLED'].map((value) => ({ value, label: humanize(value) }))} /></Form.Item>
          <Form.Item name="reason" label="Reason (kept in audit log)" rules={[{ required: true, min: 3 }]}><Input placeholder="e.g. Extended 30 days — client travelled for surgery" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---------------- Appointments ----------------
export function AppointmentsTab({ client, onOpen, onBook, canBook }: { client: any; onOpen: (id: string) => void; onBook: () => void; canBook: boolean }) {
  const [show, setShow] = useState<'upcoming' | 'all'>('upcoming');
  const rows = show === 'upcoming' ? client.appointments.filter((a: any) => dayjs(a.endAt).isAfter(dayjs()) && !['CANCELLED', 'NO_SHOW'].includes(a.status)).reverse() : client.appointments;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Segmented value={show} onChange={(v) => setShow(v as 'upcoming' | 'all')} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'all', label: `All (${client.appointments.length})` }]} />
        {canBook && <Button type="primary" icon={<PlusOutlined />} onClick={onBook}>Book appointment</Button>}
      </div>
      <Table size="small" rowKey="id" dataSource={rows} pagination={{ pageSize: 15 }} onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Date', render: (_, r: any) => <span className="tabular">{dayjs(r.startAt).format('ddd DD MMM YYYY')}, {fmtTime(r.startAt)}</span> },
          { title: 'Treatment', render: (_, r: any) => <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.treatment.color, marginRight: 6 }} />{r.treatment.name}</span> },
          { title: 'Therapist', render: (_, r: any) => r.therapist.name },
          { title: 'Machine', render: (_, r: any) => r.machine?.code ?? '—' },
          { title: 'Room', render: (_, r: any) => r.room.name },
          { title: 'Session notes', render: (_, r: any) => <span className="muted" style={{ fontSize: 12 }}>{r.session?.notes ?? r.notes ?? ''}</span> },
          { title: 'Status', render: (_, r: any) => <StatusTag status={r.status} /> },
        ]} />
    </>
  );
}

// ---------------- Billing ----------------
export function BillingTab({ client, canBill }: { client: any; canBill: boolean }) {
  const router = useRouter();
  const pays = client.invoices.flatMap((i: any) => i.payments.map((p: any) => ({ ...p, number: i.number })));
  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><div className="stat-tile"><div className="label">Lifetime value</div><div className="value">{money(client.summary.lifetimeValue)}</div></div></Col>
        <Col span={8}><div className="stat-tile"><div className="label">Paid</div><div className="value">{money(client.summary.paid)}</div></div></Col>
        <Col span={8}><div className="stat-tile"><div className="label">Balance due</div><div className="value" style={{ color: client.summary.balanceDue > 0 ? '#C8372D' : undefined }}>{money(client.summary.balanceDue)}</div></div></Col>
      </Row>
      <Card size="small" title="Invoices & credit notes" extra={canBill && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => router.push(`/billing/new?clientId=${client.id}`)}>New invoice</Button>} style={{ marginBottom: 16 }}>
        <Table size="small" rowKey="id" dataSource={client.invoices} pagination={false} onRow={(r: any) => ({ onClick: () => router.push(`/billing/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Number', dataIndex: 'number', render: (v, r: any) => <b>{v}{r.kind === 'CREDIT_NOTE' && <Tag color="purple" style={{ marginLeft: 6 }}>Credit note</Tag>}</b> },
            { title: 'Date', render: (_, r: any) => fmtDate(r.issuedAt) },
            { title: 'Total', align: 'right', render: (_, r: any) => money(r.total) },
            { title: 'Paid', align: 'right', render: (_, r: any) => money(r.paid) },
            { title: 'Balance', align: 'right', render: (_, r: any) => r.kind === 'INVOICE' && r.status !== 'VOID' && Number(r.total) - Number(r.paid) > 0 ? <b style={{ color: '#C8372D' }}>{money(Number(r.total) - Number(r.paid))}</b> : '—' },
            { title: 'Status', render: (_, r: any) => <Tag color={INVOICE_STATUS[r.status]}>{humanize(r.status)}</Tag> },
          ]} />
      </Card>
      <Card size="small" title="Receipts">
        <Table size="small" rowKey="id" dataSource={pays} pagination={false}
          columns={[
            { title: 'Receipt', dataIndex: 'receiptNo' }, { title: 'Date', render: (_, r: any) => fmtDateTime(r.paidAt) }, { title: 'Invoice', dataIndex: 'number' },
            { title: 'Method', render: (_, r: any) => humanize(r.method) },
            { title: 'Amount', align: 'right', render: (_, r: any) => <span style={{ color: r.kind === 'REFUND' ? '#C8372D' : undefined }}>{r.kind === 'REFUND' ? '−' : ''}{money(r.amount)}</span> },
          ]} />
      </Card>
    </>
  );
}

// ---------------- Documents & photos ----------------
const KINDS = [{ value: 'CONSENT', label: 'Signed consent' }, { value: 'PHOTO_BEFORE', label: 'Before photo' }, { value: 'PHOTO_AFTER', label: 'After photo' }, { value: 'REPORT', label: 'Analyzer / lab report' }, { value: 'OTHER', label: 'Other' }];
function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { let u: string; apiBlobUrl(`/documents/${id}`).then((x) => { u = x; setUrl(x); }).catch(() => {}); return () => { if (u) URL.revokeObjectURL(u); }; }, [id]);
  return url ? <Image src={url} width={150} height={150} style={{ objectFit: 'cover', borderRadius: 8 }} alt="" /> : <div style={{ width: 150, height: 150, background: '#F1EFEA', borderRadius: 8 }} />;
}
export function DocumentsTab({ client, onChanged, canEdit, canDelete }: { client: any; onChanged: () => void; canEdit: boolean; canDelete: boolean }) {
  const { message } = App.useApp();
  const [kind, setKind] = useState('CONSENT');
  const [title, setTitle] = useState('');
  const upload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { message.error('Max 8 MB'); return false; }
    const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    try {
      await api(`/clients/${client.id}/documents`, { method: 'POST', body: { kind, title: title || KINDS.find((k) => k.value === kind)!.label, fileName: file.name, mime: file.type || 'application/octet-stream', base64 } });
      message.success('Uploaded'); setTitle(''); onChanged();
    } catch (e) { message.error((e as Error).message); }
    return false;
  };
  const open = async (id: string) => { const u = await apiBlobUrl(`/documents/${id}`); window.open(u, '_blank'); };
  const del = async (id: string) => { try { await api(`/documents/${id}`, { method: 'DELETE' }); onChanged(); } catch (e) { message.error((e as Error).message); } };
  const photos = client.documents.filter((d: any) => d.kind.startsWith('PHOTO'));
  const docs = client.documents.filter((d: any) => !d.kind.startsWith('PHOTO'));
  return (
    <>
      {canEdit && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Select value={kind} onChange={setKind} style={{ width: 200 }} options={KINDS.map((k) => ({ ...k, disabled: k.value.startsWith('PHOTO') && !client.photoConsent }))} />
            <Input placeholder="Title (optional), e.g. Abdomen front" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 260 }} />
            <Upload beforeUpload={upload} showUploadList={false} accept={kind.startsWith('PHOTO') ? 'image/*' : 'image/*,application/pdf'}><Button icon={<UploadOutlined />}>Upload file</Button></Upload>
            {!client.photoConsent && <span className="muted" style={{ fontSize: 12 }}>Photo upload disabled — no photo consent on file</span>}
          </Space>
        </Card>
      )}
      <Card size="small" title="Before & after photos" style={{ marginBottom: 16 }}>
        {!photos.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No photos" /> : (
          <Image.PreviewGroup>
            <Space wrap size={12}>
              {photos.map((p: any) => (
                <div key={p.id} style={{ textAlign: 'center' }}>
                  <Thumb id={p.id} />
                  <div style={{ fontSize: 12, marginTop: 4 }}><Tag color={p.kind === 'PHOTO_BEFORE' ? 'orange' : 'green'}>{p.kind === 'PHOTO_BEFORE' ? 'Before' : 'After'}</Tag>{fmtDate(p.createdAt)}</div>
                </div>
              ))}
            </Space>
          </Image.PreviewGroup>
        )}
      </Card>
      <Card size="small" title="Documents">
        <Table size="small" rowKey="id" dataSource={docs} pagination={false} locale={{ emptyText: 'No documents' }}
          columns={[
            { title: 'Document', render: (_, r: any) => <span><FilePdfOutlined style={{ marginRight: 6 }} />{r.title}</span> },
            { title: 'Type', render: (_, r: any) => KINDS.find((k) => k.value === r.kind)?.label },
            { title: 'File', dataIndex: 'fileName', render: (v, r: any) => <span className="muted">{v} · {Math.round(r.size / 1024)} KB</span> },
            { title: 'Uploaded', render: (_, r: any) => fmtDate(r.createdAt) },
            { title: '', render: (_, r: any) => <Space><Button size="small" icon={<EyeOutlined />} onClick={() => open(r.id)}>View</Button>{canDelete && <Popconfirm title="Delete document?" onConfirm={() => del(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}</Space> },
          ]} />
      </Card>
    </>
  );
}

// ---------------- Messages & timeline ----------------
export function MessagesTab({ client }: { client: any }) {
  return (
    <Card size="small" title="Messages sent" extra={<Link href={`/messages?clientId=${client.id}`}><Button size="small" type="primary" icon={<WhatsAppOutlined />}>Send message</Button></Link>}>
      {!client.messages.length ? <Empty description="No messages yet" /> : (
        <Timeline items={client.messages.map((m: any) => ({ color: 'green', content: <div><div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(m.sentAt)} · {humanize(m.channel)} to {m.to}</div><div>{m.body}</div></div> }))} />
      )}
    </Card>
  );
}

export function TimelineTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<any[]>();
  useEffect(() => { api<any[]>(`/clients/${clientId}/timeline`).then(setRows).catch(() => setRows([])); }, [clientId]);
  return (
    <Card size="small" title="Activity & audit trail" loading={!rows}>
      {rows && !rows.length ? <Empty description="No recorded activity" /> : (
        <Timeline items={(rows ?? []).map((l) => ({ content: <div><b>{humanize(l.action.replace('.', ' · '))}</b> <span className="muted">by {l.user ?? 'System'} · {fmtDateTime(l.createdAt)}</span>{l.details && <div className="muted" style={{ fontSize: 12 }}>{Object.entries(l.details).filter(([k]) => k !== 'clientId').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</div>}</div> }))} />
      )}
    </Card>
  );
}
