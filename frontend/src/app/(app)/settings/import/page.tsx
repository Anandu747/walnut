'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, App, Button, Card, Col, Input, Row, Segmented, Space, Steps, Table, Tabs, Tag, Upload } from 'antd';
import { CloudDownloadOutlined, DownloadOutlined, FileExcelOutlined, GoogleOutlined, InboxOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { exportCsv } from '@/lib/export';
import { Field, mapHeaders, readSpreadsheet } from '@/lib/sheet';
import { PageHeader, StatTile } from '@/components/ui';

const YES_NO = 'Yes / No';
const TEMPLATES: Record<'clients' | 'leads', { label: string; fields: Field[]; done: string }> = {
  clients: {
    label: 'Clients', done: '/clients',
    fields: [
      { key: 'title', label: 'Title', example: 'Ms.' },
      { key: 'firstName', label: 'First Name', required: true, example: 'Aisha' },
      { key: 'middleName', label: 'Middle Name', example: '' },
      { key: 'lastName', label: 'Last Name', required: true, example: 'Al Mansoori', aliases: ['Surname'] },
      { key: 'mobile', label: 'Mobile', required: true, example: '0501234567', aliases: ['Phone', 'Mobile Number', 'Phone Number', 'Contact'] },
      { key: 'altPhone', label: 'Alternate Phone', example: '' },
      { key: 'email', label: 'Email', example: 'aisha@example.com', aliases: ['Email Address'] },
      { key: 'gender', label: 'Gender', example: 'Female' },
      { key: 'dob', label: 'Date of Birth (DD-MM-YYYY)', example: '15-03-1990', aliases: ['DOB', 'Birth Date'] },
      { key: 'nationality', label: 'Nationality', example: 'UAE' },
      { key: 'emiratesId', label: 'Emirates ID', example: '784-1990-1234567-1', aliases: ['EID', 'Passport'] },
      { key: 'address', label: 'Address', example: 'Jumeirah, Dubai', aliases: ['Area'] },
      { key: 'occupation', label: 'Occupation', example: '' },
      { key: 'source', label: 'Source', example: 'Instagram', aliases: ['Lead Source'] },
      { key: 'referredBy', label: 'Referred By', example: '' },
      { key: 'offer', label: 'Marketing Offer', example: 'Ramadan Glow 3+1', aliases: ['Offer', 'Campaign'] },
      { key: 'goal', label: 'Goal', example: 'Reduce abdominal fat' },
      { key: 'conditions', label: 'Medical Conditions', example: '' },
      { key: 'allergies', label: 'Allergies', example: '' },
      { key: 'medications', label: 'Medications', example: '' },
      { key: 'medicalNotes', label: 'Notes', example: '' },
      { key: 'whatsappOptIn', label: `WhatsApp Opt-in (${YES_NO})`, example: 'Yes', aliases: ['WhatsApp'] },
      { key: 'marketingOptIn', label: `Marketing Opt-in (${YES_NO})`, example: 'No' },
      { key: 'vip', label: `VIP (${YES_NO})`, example: 'No' },
    ],
  },
  leads: {
    label: 'Leads & enquiries', done: '/leads',
    fields: [
      { key: 'name', label: 'Name', required: true, example: 'Sara Ahmed', aliases: ['Full Name', 'Client Name'] },
      { key: 'mobile', label: 'Mobile', required: true, example: '0559876543', aliases: ['Phone', 'Mobile Number', 'Phone Number', 'Contact'] },
      { key: 'email', label: 'Email', example: '' },
      { key: 'gender', label: 'Gender', example: 'Female' },
      { key: 'source', label: 'Source', example: 'Instagram', aliases: ['Lead Source', 'Platform'] },
      { key: 'interest', label: 'Interested In', example: 'Emsculpt for abdomen', aliases: ['Interest', 'Treatment'] },
      { key: 'offer', label: 'Marketing Offer', example: 'Free Body Analysis + 1st Session 50% Off', aliases: ['Offer', 'Campaign'] },
      { key: 'status', label: 'Stage', example: 'New', aliases: ['Status'] },
      { key: 'nextActionAt', label: 'Next Action Date (DD-MM-YYYY)', example: '', aliases: ['Follow-up Date', 'Next Action'] },
      { key: 'notes', label: 'Notes', example: '' },
    ],
  },
};

type Result = { row: number; status: 'ok' | 'duplicate' | 'error'; message?: string; name?: string };
type Check = { valid: number; duplicates: number; errors: number; imported: number; results: Result[] };

function ImportInner() {
  const params = useSearchParams();
  const { message } = App.useApp();
  const [type, setType] = useState<'clients' | 'leads'>(params.get('type') === 'leads' ? 'leads' : 'clients');
  const [sheet, setSheet] = useState<{ name: string; rows: string[][] } | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [done, setDone] = useState<Check | null>(null);
  const tpl = TEMPLATES[type];

  // Header row → field mapping, then one object per data row keyed by field.
  const parsed = useMemo(() => {
    if (!sheet?.rows.length) return null;
    const [headers, ...data] = sheet.rows;
    const { index, unknown } = mapHeaders(headers, tpl.fields);
    // A single "Name" column is accepted for clients and split into first / last name.
    const splitName = type === 'clients' && index.firstName === undefined && index.lastName === undefined ? headers.findIndex((h) => /^\s*(full\s*)?(client\s*)?name\s*$/i.test(h)) : -1;
    const missing = tpl.fields.filter((f) => f.required && index[f.key] === undefined && !(splitName >= 0 && ['firstName', 'lastName'].includes(f.key)));
    const rows = data.map((r) => {
      const o: Record<string, string> = {};
      for (const [k, i] of Object.entries(index)) o[k] = r[i] ?? '';
      if (splitName >= 0) { const w = (r[splitName] ?? '').trim().split(/\s+/); o.firstName = w[0] ?? ''; o.lastName = w.slice(1).join(' '); }
      // Excel stores 0501234567 as the number 501234567 — put the leading zero back.
      if (/^5\d{8}$/.test(o.mobile ?? '')) o.mobile = `0${o.mobile}`;
      return o;
    });
    return { rows, missing, unknown, mapped: Object.keys(index).length + (splitName >= 0 ? 1 : 0) };
  }, [sheet, tpl, type]);

  const load = (name: string, rows: string[][]) => {
    if (rows.length < 2) { message.error('The sheet has no data rows under the header row'); return; }
    setSheet({ name, rows }); setCheck(null); setDone(null);
  };
  const onFile = async (file: File) => {
    try { load(file.name, await readSpreadsheet(file)); } catch (e) { message.error((e as Error).message); }
    return false; // handled locally, never uploaded as-is
  };
  const fetchSheet = async () => {
    setBusy(true);
    try { load('Google Sheet', (await api<{ rows: string[][] }>('/import/google-sheet', { method: 'POST', body: { url: link.trim() } })).rows); } catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
  };
  const run = async (dryRun: boolean) => {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await api<Check>(`/import/${type}`, { method: 'POST', body: { rows: parsed.rows, dryRun } });
      if (dryRun) setCheck(r); else { setDone(r); setCheck(null); setSheet(null); message.success(`${r.imported} ${tpl.label.toLowerCase()} imported`); }
    } catch (e) { message.error((e as Error).message); } finally { setBusy(false); }
  };
  const reset = (t: typeof type) => { setType(t); setSheet(null); setCheck(null); setDone(null); };
  const template = () => exportCsv(`walnut-${type}-import-template`, tpl.fields.map((f) => ({ title: f.label, value: () => f.example ?? '' })), [{}]);

  const step = done ? 3 : check ? 2 : sheet ? 1 : 0;
  const byRow = new Map(check?.results.map((r) => [r.row, r]));
  const nameOf = (o: Record<string, string>) => o.name ?? [o.firstName, o.middleName, o.lastName].filter(Boolean).join(' ');

  return (
    <>
      <PageHeader crumb="Administration" title="Data Import" sub="Bring existing clients or enquiries in from Excel or Google Sheets using the standard template"
        extra={<Segmented value={type} onChange={(v) => reset(v as typeof type)} options={[{ value: 'clients', label: 'Clients' }, { value: 'leads', label: 'Leads & enquiries' }]} />} />
      <Steps current={step} size="small" style={{ marginBottom: 20 }} items={[{ title: 'Get the template' }, { title: 'Upload sheet' }, { title: 'Check rows' }, { title: 'Imported' }]} />
      <Row gutter={16}>
        <Col xs={24} xl={9}>
          <Card title="1 · Template" size="small" style={{ marginBottom: 16 }}>
            <p style={{ marginTop: 0 }}>Fill one {type === 'clients' ? 'client' : 'enquiry'} per row under the header row. Required columns are marked <Tag color="red">required</Tag>. Column order does not matter.</p>
            <Space wrap style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<DownloadOutlined />} onClick={template}>Download template</Button>
            </Space>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Opens in Excel. For Google Sheets: <i>File → Import → Upload</i> the template, fill it in, then paste the sheet link on the right.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tpl.fields.map((f) => <Tag key={f.key} color={f.required ? 'red' : undefined}>{f.label}{f.required ? ' *' : ''}</Tag>)}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={15}>
          <Card title="2 · Upload" size="small" style={{ marginBottom: 16 }}>
            <Tabs items={[
              {
                key: 'file', label: <span><FileExcelOutlined /> Excel / CSV file</span>, children: (
                  <Upload.Dragger accept=".xlsx,.csv" maxCount={1} showUploadList={false} beforeUpload={onFile}>
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p>Click or drag an .xlsx or .csv file here</p>
                    <p className="muted" style={{ fontSize: 12 }}>The first sheet is read; up to 1,000 rows per import</p>
                  </Upload.Dragger>
                ),
              },
              {
                key: 'gsheet', label: <span><GoogleOutlined /> Google Sheets link</span>, children: (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input placeholder="https://docs.google.com/spreadsheets/d/…" value={link} onChange={(e) => setLink(e.target.value)} onPressEnter={fetchSheet} />
                      <Button type="primary" icon={<CloudDownloadOutlined />} loading={busy} disabled={!link.trim()} onClick={fetchSheet}>Fetch</Button>
                    </Space.Compact>
                    <span className="muted" style={{ fontSize: 12 }}>In Google Sheets: Share → General access → “Anyone with the link” (Viewer). The tab open in the link is the one imported.</span>
                  </div>
                ),
              },
            ]} />
            {sheet && parsed && (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <Alert type={parsed.missing.length ? 'error' : 'success'} showIcon
                  title={parsed.missing.length ? `Missing required column(s): ${parsed.missing.map((f) => f.label).join(', ')}` : `${sheet.name}: ${parsed.rows.length} row(s), ${parsed.mapped} column(s) recognised`}
                  description={parsed.missing.length ? 'Add the column(s) to the header row, or start from the template.' : undefined} />
                {parsed.unknown.length > 0 && <Alert type="warning" showIcon title={`Ignored column(s): ${parsed.unknown.join(', ')}`} description="These headers are not in the template, so their data will not be imported." />}
                <Space>
                  <Button type="primary" loading={busy} disabled={!!parsed.missing.length} onClick={() => run(true)}>Check rows</Button>
                  <Button onClick={() => { setSheet(null); setCheck(null); }}>Clear</Button>
                </Space>
              </div>
            )}
            {done && (
              <Alert style={{ marginTop: 12 }} type="success" showIcon title={`${done.imported} ${tpl.label.toLowerCase()} imported`}
                description={`${done.duplicates} duplicate(s) skipped · ${done.errors} row(s) with errors skipped`}
                action={<Link href={tpl.done}><Button size="small">Open {tpl.label.toLowerCase()}</Button></Link>} />
            )}
          </Card>
        </Col>
      </Row>

      {check && parsed && (
        <Card title="3 · Check rows" size="small"
          extra={<Button type="primary" loading={busy} disabled={!check.valid} onClick={() => run(false)}>Import {check.valid} valid row(s)</Button>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
            <StatTile label="Ready to import" value={<span style={{ color: '#2E8B57' }}>{check.valid}</span>} />
            <StatTile label="Duplicates (skipped)" value={check.duplicates} sub="mobile already registered" />
            <StatTile label="Errors (skipped)" value={<span style={{ color: check.errors ? '#C8372D' : undefined }}>{check.errors}</span>} sub="fix in the sheet and re-upload" />
          </div>
          <Table size="small" rowKey="row" pagination={{ pageSize: 25 }} scroll={{ x: 800 }}
            dataSource={parsed.rows.map((o, i) => ({ ...o, row: i + 2 }))}
            columns={[
              { title: 'Row', dataIndex: 'row', width: 60 },
              { title: 'Name', render: (_, o: any) => nameOf(o) || <span className="muted">—</span> },
              { title: 'Mobile', dataIndex: 'mobile' },
              ...(type === 'clients' ? [{ title: 'Gender', dataIndex: 'gender' }] : [{ title: 'Source', dataIndex: 'source' }]),
              { title: 'Offer', dataIndex: 'offer', render: (v: string) => v || <span className="muted">—</span> },
              {
                title: 'Status', width: 320,
                filters: [{ text: 'Ready', value: 'ok' }, { text: 'Duplicate', value: 'duplicate' }, { text: 'Error', value: 'error' }],
                onFilter: (v, o: any) => byRow.get(o.row)?.status === v,
                render: (_, o: any) => {
                  const r = byRow.get(o.row);
                  if (!r) return null;
                  return r.status === 'ok' ? <Tag color="green">Ready</Tag> : <span><Tag color={r.status === 'error' ? 'red' : 'orange'}>{r.status === 'error' ? 'Error' : 'Duplicate'}</Tag><span style={{ fontSize: 12 }}>{r.message}</span></span>;
                },
              },
            ]} />
        </Card>
      )}
    </>
  );
}

export default function ImportPage() {
  return <Suspense><ImportInner /></Suspense>;
}
