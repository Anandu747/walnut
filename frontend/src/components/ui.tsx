'use client';
import Link from 'next/link';
import { Avatar, Tag, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CrownFilled } from '@ant-design/icons';
import { initials, STATUS } from '@/lib/format';
import { GOLD } from '@/lib/theme';

export function PageHeader({ title, crumb, extra, sub }: { title: React.ReactNode; crumb?: string; extra?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {sub && <div className="muted" style={{ marginTop: 4 }}>{sub}</div>}
      </div>
      {extra && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} className="no-print">{extra}</div>}
    </div>
  );
}

/**
 * Stat tile: label · value · optional delta vs a named period (colour = direction × whether up is good) · optional note.
 * `upIsGood=false` flips the colour for metrics like outstanding balances.
 */
export function StatTile({ label, value, current, previous, vs, sub, upIsGood = true, onClick }: {
  label: string; value: React.ReactNode; current?: number; previous?: number; vs?: string; sub?: React.ReactNode; upIsGood?: boolean; onClick?: () => void;
}) {
  let delta: React.ReactNode = null;
  if (current != null && previous != null) {
    if (previous === 0) delta = current > 0 ? <span className="muted">new vs {vs}</span> : null;
    else {
      const p = ((current - previous) / Math.abs(previous)) * 100;
      const good = p >= 0 === upIsGood;
      delta = (
        <span className={good ? 'delta-up' : 'delta-down'}>
          {p >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(p).toFixed(1)}% <span className="muted" style={{ fontWeight: 400 }}>vs {vs}</span>
        </span>
      );
    }
  }
  return (
    <div className="stat-tile" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {(delta || sub) && <div className="sub">{delta}{delta && sub ? ' · ' : ''}{sub}</div>}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: 'default' };
  return <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag>;
}

export function StatusDot({ status, size = 8 }: { status: string; size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: STATUS[status]?.dot ?? '#ccc' }} />;
}

export function ClientCell({ client, sub }: { client: { id: string; name: string; clientNo?: string; vip?: boolean }; sub?: React.ReactNode }) {
  return (
    <Link href={`/clients/${client.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }} onClick={(e) => e.stopPropagation()}>
      <Avatar size={32} style={{ background: '#F3E9D2', color: '#7A5608', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{initials(client.name)}</Avatar>
      <span style={{ lineHeight: 1.25, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{client.name}</span>
        {client.vip && <Tooltip title="VIP client"><CrownFilled style={{ color: GOLD, marginLeft: 6 }} /></Tooltip>}
        <br />
        <span className="muted" style={{ fontSize: 12 }}>{sub ?? client.clientNo}</span>
      </span>
    </Link>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#5C5953' }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}
