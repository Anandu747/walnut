'use client';
import { useState } from 'react';
import { Button, Card, Col, DatePicker, Row, Table } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useApi } from '@/lib/useApi';
import { fmtTime, humanize, money } from '@/lib/format';
import { PageHeader, StatTile } from '@/components/ui';

export default function DayBook() {
  const [date, setDate] = useState<Dayjs>(dayjs());
  const { data, loading } = useApi<any>(`/day-book?date=${date.format('YYYY-MM-DD')}`);
  const methods = Object.entries(data?.byMethod ?? {}) as [string, number][];
  return (
    <>
      <PageHeader crumb="Billing" title="Day Book" sub="End-of-day cash-up by payment method"
        extra={<><DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} format="ddd, DD MMM YYYY" /><Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button></>} />
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><StatTile label="Invoiced (incl. VAT)" value={money(data?.invoiced ?? 0)} /></Col>
        <Col xs={12} lg={6}><StatTile label="VAT on invoices" value={money(data?.vat ?? 0)} /></Col>
        <Col xs={24} lg={12}><StatTile label="Net collected" value={money(data?.collected ?? 0)} sub={methods.map(([m, v]) => `${humanize(m)} ${money(v, false)}`).join(' · ') || 'No collections'} /></Col>
        <Col span={24}>
          <Card size="small" title="Transactions">
            <Table rowKey="id" size="small" loading={loading} dataSource={data?.payments} pagination={false}
              columns={[
                { title: 'Time', render: (_, r: any) => fmtTime(r.paidAt) }, { title: 'Receipt', dataIndex: 'receiptNo' },
                { title: 'Client', render: (_, r: any) => r.invoice.client.name }, { title: 'Invoice', render: (_, r: any) => r.invoice.number },
                { title: 'Method', render: (_, r: any) => humanize(r.method) },
                { title: 'Amount', align: 'right', render: (_, r: any) => <b style={{ color: r.kind === 'REFUND' ? '#C8372D' : undefined }}>{r.kind === 'REFUND' ? '−' : ''}{money(r.amount)}</b> },
              ]}
              summary={(rows) => (rows.length ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5}><b>Total</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><b>{money(data?.collected)}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null)} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
