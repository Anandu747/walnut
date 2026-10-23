'use client';
import { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Button, Form, Space } from 'antd';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import ClientForm, { fromForm } from '@/components/ClientForm';

// A lead only has one name field; prefill first name + last name from it (surname = last word, keeping 'Al …' together).
function splitName(full: string | null) {
  const w = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return { firstName: w[0] };
  const cut = w.length > 2 && ['Al', 'El', 'Bin', 'Bint', 'Abu'].includes(w[w.length - 2]) ? w.length - 2 : w.length - 1;
  return { firstName: w[0], middleName: w.slice(1, cut).join(' ') || undefined, lastName: w.slice(cut).join(' ') };
}

function NewClientInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<{ message: string; clientId: string } | null>(null);
  const next = useRef<'profile' | 'book' | 'bill'>('profile');

  const submit = async (v: any) => {
    setSaving(true); setDup(null);
    try {
      const c = await api<any>('/clients', { method: 'POST', body: { ...fromForm(v), leadId: params.get('leadId') ?? undefined } });
      message.success(`Client ${c.clientNo} registered`);
      router.push(next.current === 'book' ? `/clients/${c.id}?tab=appointments&book=1` : next.current === 'bill' ? `/billing/new?clientId=${c.id}` : `/clients/${c.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDup({ message: e.message, clientId: (e.details as any)?.clientId });
      else message.error((e as Error).message);
    } finally { setSaving(false); }
  };
  const go = (n: typeof next.current) => { next.current = n; form.submit(); };

  return (
    <>
      <PageHeader crumb="Clients" title="Client Registration" sub="A client ID is generated automatically on save" />
      {dup && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} title="Possible duplicate" description={dup.message}
          action={<Link href={`/clients/${dup.clientId}`}><Button size="small">Open existing client</Button></Link>} />
      )}
      <ClientForm form={form} onFinish={submit} initialValues={{ ...splitName(params.get('name')), mobile: params.get('mobile') ?? undefined, gender: params.get('gender') ?? undefined, source: params.get('source') ?? undefined }} />
      <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #ECEAE4', padding: '12px 16px', margin: '0 -24px -24px', display: 'flex', justifyContent: 'flex-end', zIndex: 5 }}>
        <Space>
          <Button onClick={() => router.back()}>Discard</Button>
          <Button loading={saving} onClick={() => go('profile')}>Register</Button>
          <Button loading={saving} onClick={() => go('book')}>Register &amp; Book</Button>
          <Button type="primary" loading={saving} onClick={() => go('bill')}>Register &amp; Bill</Button>
        </Space>
      </div>
    </>
  );
}

export default function NewClientPage() {
  return <Suspense><NewClientInner /></Suspense>;
}
