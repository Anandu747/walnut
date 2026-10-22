'use client';
import Link from 'next/link';
import { Card, Col, Row, Tag } from 'antd';
import { BarChartOutlined, DollarOutlined, GiftOutlined, RiseOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { REPORT_LIST } from '@/lib/nav';
import { PageHeader } from '@/components/ui';

const ICON: Record<string, React.ReactNode> = { Operations: <BarChartOutlined />, Packages: <GiftOutlined />, Finance: <DollarOutlined />, Growth: <RiseOutlined /> };

export default function ReportsHome() {
  const { user } = useAuth();
  const list = REPORT_LIST.filter((r) => user && r.roles.includes(user.role as never));
  return (
    <>
      <PageHeader crumb="Analytics" title="Reports Centre" sub="Every report has date-range filters, drill-down to records and Excel/PDF export" />
      {[...new Set(list.map((r) => r.group))].map((g) => (
        <div key={g} style={{ marginBottom: 20 }}>
          <div className="section-title">{ICON[g]} {g}</div>
          <Row gutter={[16, 16]}>
            {list.filter((r) => r.group === g).map((r) => (
              <Col xs={24} md={12} xl={8} key={r.key}>
                <Link href={`/reports/${r.key}`}>
                  <Card hoverable size="small" style={{ height: '100%' }}>
                    <b style={{ color: '#1F1D1A' }}>{r.label}</b>
                    <div className="muted" style={{ fontSize: 13, margin: '6px 0 8px' }}>{r.description}</div>
                    <Tag>{r.frequency}</Tag>
                  </Card>
                </Link>
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </>
  );
}
