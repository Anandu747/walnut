'use client';
import { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Space, Table, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtDateTime, qs } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { PageHeader } from '@/components/ui';

const ENTITIES = ['Client', 'Appointment', 'Invoice', 'ClientPackage', 'Consultation', 'Measurement', 'Document', 'Machine', 'User', 'Treatment', 'PackageTemplate', 'ResourceBlock', 'FollowUp', 'Lead', 'Tenant'];

export default function AuditPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [entity, setEntity] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [action, setAction] = useState('');
  const [staff, setStaff] = useState<any[]>([]);
  useEffect(() => { api<any[]>('/staff').then(setStaff).catch(() => {}); }, []);
  const { data = [], loading } = useApi<any[]>(`/audit?${qs({ from: range[0].startOf('day'), to: range[1].endOf('day'), entity, userId, action })}`, []);

  return (
    <>
      <PageHeader crumb="Administration" title="Audit Log" sub="Every change to clients, sessions, packages, invoices and settings — who, what and when"
        extra={<Button icon={<DownloadOutlined />} onClick={() => exportCsv('audit-log', [
          { title: 'When', value: (r: any) => r.createdAt }, { title: 'User', value: (r: any) => r.user }, { title: 'Action', value: (r: any) => r.action },
          { title: 'Entity', value: (r: any) => r.entity }, { title: 'Record', value: (r: any) => r.entityId }, { title: 'Details', value: (r: any) => JSON.stringify(r.details ?? {}) },
        ], data)}>Export</Button>} />
      <Card styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 12, borderBottom: '1px solid #ECEAE4', width: '100%' }}>
          <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} allowClear={false} format="DD MMM YYYY" />
          <Select allowClear placeholder="Record type" style={{ width: 170 }} value={entity} onChange={setEntity} options={ENTITIES.map((value) => ({ value }))} />
          <Select allowClear placeholder="User" style={{ width: 170 }} value={userId} onChange={setUserId} options={staff.map((s) => ({ value: s.id, label: s.name }))} />
          <Input.Search placeholder="Action contains…" allowClear onSearch={setAction} style={{ width: 200 }} />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={data} size="small" pagination={{ pageSize: 30 }}
          columns={[
            { title: 'When', width: 170, render: (_, r) => fmtDateTime(r.createdAt) },
            { title: 'User', width: 160, dataIndex: 'user' },
            { title: 'Action', width: 200, render: (_, r) => <Tag color={r.action.includes('void') || r.action.includes('delete') || r.action.includes('credit') ? 'red' : r.action.includes('create') ? 'green' : 'blue'}>{r.action}</Tag> },
            { title: 'Record', width: 140, render: (_, r) => r.entity },
            { title: 'Details', render: (_, r) => <code style={{ fontSize: 11, color: '#5C5953', wordBreak: 'break-all' }}>{r.details ? JSON.stringify(r.details) : ''}</code> },
          ]} />
      </Card>
    </>
  );
}
