'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Empty, Input, InputRef, Modal, Segmented } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { REPORT_LIST, visibleNav } from '@/lib/nav';
import { GOLD } from '@/lib/theme';

/** The "Modules / Reports" launcher: every screen the user may open, grouped, with a filter box. */
export default function ModulesMenu({ open, onClose, role, due }: { open: boolean; onClose: () => void; role: string; due: number }) {
  const [tab, setTab] = useState<'Modules' | 'Reports'>('Modules');
  const [q, setQ] = useState('');
  const input = useRef<InputRef>(null);
  useEffect(() => { if (open) { setQ(''); setTimeout(() => input.current?.focus(), 50); } }, [open]);

  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const groups = tab === 'Modules'
    ? visibleNav(role).map((g) => ({ key: g.key, label: g.label, items: g.items.filter((i) => match(i.label) || match(g.label)).map((i) => ({ href: i.path, label: i.label, badge: i.badge === 'followups' ? due : 0 })) }))
    : [...new Set(REPORT_LIST.map((r) => r.group))].map((grp) => ({
      key: grp, label: grp,
      items: REPORT_LIST.filter((r) => r.group === grp && r.roles.includes(role as never) && (match(r.label) || match(grp))).map((r) => ({ href: `/reports/${r.key}`, label: r.label, badge: 0 })),
    }));
  const shown = groups.filter((g) => g.items.length);

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1080} style={{ top: 64 }} closable={false} destroyOnHidden>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <Segmented size="large" options={['Modules', 'Reports']} value={tab} onChange={(v) => setTab(v as 'Modules' | 'Reports')} />
        <Input ref={input} size="large" prefix={<SearchOutlined className="muted" />} placeholder="search menu" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} allowClear />
      </div>
      {shown.length === 0 ? <Empty description="Nothing matches" /> : (
        <div style={{ columnWidth: 300, columnGap: 28 }}>
          {shown.map((g) => (
            <div key={g.key} className="modules-col" style={{ breakInside: 'avoid', marginBottom: 18 }}>
              <h4>{g.label}</h4>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} onClick={onClose}>
                  {i.label}
                  {i.badge > 0 && <Badge count={i.badge} color={GOLD} />}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
