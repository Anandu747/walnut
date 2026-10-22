'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, App, Button, Card, Col, Input, Row, Segmented, Select, Table, Tag } from 'antd';
import { SendOutlined, WhatsAppOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtDateTime, fmtTime, humanize, money } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import ClientSelect from '@/components/ClientSelect';

/** Fills {placeholders} in an approved template from the client's live data. */
function render(body: string, c: any, apptId?: string | null) {
  const pkg = c?.packages?.find((p: any) => p.status === 'ACTIVE');
  const appt = (apptId && c?.appointments?.find((a: any) => a.id === apptId)) || c?.appointments?.filter((a: any) => dayjs(a.startAt).isAfter(dayjs()) && ['SCHEDULED', 'CONFIRMED'].includes(a.status)).slice(-1)[0];
  const inv = c?.invoices?.find((i: any) => i.kind === 'INVOICE' && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status));
  const vals: Record<string, string> = {
    name: c?.name.split(' ')[0] ?? '', treatment: appt?.treatment.name ?? 'treatment', date: appt ? dayjs(appt.startAt).format('ddd DD MMM') : '', time: appt ? fmtTime(appt.startAt) : '',
    package: pkg?.name ?? '', expiry: pkg ? dayjs(pkg.expiresAt).format('DD MMM YYYY') : '', sessions: pkg ? String(pkg.items.reduce((s: number, i: any) => s + i.totalSessions - i.usedSessions, 0)) : '',
    amount: inv ? money(Number(inv.total) - Number(inv.paid), true).replace(/^AED\s/, '') : '', invoice: inv?.number ?? '',
  };
  return body.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? `{${k}}`);
}

function MessagesInner() {
  const params = useSearchParams();
  const { message } = App.useApp();
  const [clientId, setClientId] = useState<string | undefined>(params.get('clientId') ?? undefined);
  const [client, setClient] = useState<any>(null);
  const [templateId, setTemplateId] = useState<string>();
  const [channel, setChannel] = useState('WHATSAPP');
  const [body, setBody] = useState('');
  const { data: templates = [] } = useApi<any[]>('/message-templates', []);
  const { data: log = [], reload } = useApi<any[]>('/messages', []);

  useEffect(() => { setClient(null); if (clientId) api(`/clients/${clientId}`).then(setClient).catch(() => {}); }, [clientId]);
  useEffect(() => {
    const purpose = params.get('purpose');
    if (purpose && templates.length && !templateId) setTemplateId(templates.find((t) => t.purpose === purpose)?.id);
  }, [templates, params, templateId]);
  useEffect(() => { const t = templates.find((x) => x.id === templateId); if (t) setBody(render(t.body, client, params.get('appointmentId'))); }, [templateId, client, templates, params]);

  const send = async () => {
    try {
      const r = await api<any>('/messages', { method: 'POST', body: { clientId, templateId, body, channel } });
      if (channel === 'WHATSAPP') window.open(r.waLink, '_blank');
      message.success('Message logged'); reload();
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader crumb="Clients" title="Send Message" sub="Approved templates only · respects each client’s WhatsApp consent" />
      <Row gutter={16}>
        <Col xs={24} xl={10}>
          <Card title="Compose">
            <div style={{ display: 'grid', gap: 12 }}>
              <ClientSelect value={clientId} onChange={(v) => setClientId(v)} style={{ width: '100%' }} />
              {client && !client.whatsappOptIn && channel === 'WHATSAPP' && <Alert type="warning" showIcon title={`${client.name} has not opted in to WhatsApp messages`} />}
              <Segmented block value={channel} onChange={(v) => setChannel(String(v))} options={[{ value: 'WHATSAPP', label: 'WhatsApp' }, { value: 'SMS', label: 'SMS' }, { value: 'EMAIL', label: 'Email' }]} />
              <Select placeholder="Choose an approved template" value={templateId} onChange={setTemplateId} options={templates.filter((t) => t.active).map((t) => ({ value: t.id, label: `${t.name} · ${humanize(t.purpose)}` }))} />
              <Input.TextArea rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message text" showCount maxLength={1000} />
              <Button type="primary" size="large" icon={channel === 'WHATSAPP' ? <WhatsAppOutlined /> : <SendOutlined />} disabled={!clientId || !body || (channel === 'WHATSAPP' && client && !client.whatsappOptIn)} onClick={send}>
                {channel === 'WHATSAPP' ? 'Open in WhatsApp & log' : 'Send'}
              </Button>
              <span className="muted" style={{ fontSize: 12 }}>WhatsApp Business API can be connected later for automatic reminders; until then messages open in WhatsApp Web with the text pre-filled.</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="Recent messages" styles={{ body: { padding: 0 } }}>
            <Table rowKey="id" size="small" dataSource={log} pagination={{ pageSize: 12 }}
              columns={[
                { title: 'Sent', width: 150, render: (_, r) => fmtDateTime(r.sentAt) },
                { title: 'Client', width: 160, render: (_, r) => r.client ? <Link href={`/clients/${r.client.id}`}>{r.client.name}</Link> : r.to },
                { title: 'Channel', width: 100, render: (_, r) => <Tag color={r.channel === 'WHATSAPP' ? 'green' : 'blue'}>{humanize(r.channel)}</Tag> },
                { title: 'Message', render: (_, r) => <span style={{ fontSize: 12 }}>{r.body}</span> },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default function MessagesPage() {
  return <Suspense><MessagesInner /></Suspense>;
}
