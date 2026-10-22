'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AutoComplete, Avatar, Badge, Button, Dropdown, Layout, Menu, Result, Spin, Tooltip } from 'antd';
import {
  AppstoreOutlined, BarChartOutlined, BellOutlined, CalendarOutlined, DashboardOutlined, GiftOutlined, LogoutOutlined, MenuFoldOutlined,
  MenuUnfoldOutlined, PlusOutlined, SearchOutlined, SettingOutlined, TeamOutlined, ToolOutlined, WalletOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/lib/auth';
import { canAccessRoute, homeFor, visibleNav } from '@/lib/nav';
import { api } from '@/lib/api';
import { initials, ROLE_LABEL } from '@/lib/format';
import { GOLD } from '@/lib/theme';
import ModulesMenu from './ModulesMenu';

const { Sider, Header, Content } = Layout;
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <DashboardOutlined />, calendar: <CalendarOutlined />, team: <TeamOutlined />, gift: <GiftOutlined />,
  wallet: <WalletOutlined />, tool: <ToolOutlined />, chart: <BarChartOutlined />, setting: <SettingOutlined />,
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, tenant, ready, logout, hasRole } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [modules, setModules] = useState(false);
  const [due, setDue] = useState(0);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ clients: any[]; invoices: any[] }>({ clients: [], invoices: [] });

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  useEffect(() => {
    if (!user) return;
    api<any[]>('/reports/followups').then((r) => setDue(r.length)).catch(() => {});
  }, [user, path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setModules(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) { setResults({ clients: [], invoices: [] }); return; }
    const h = setTimeout(() => api(`/search?q=${encodeURIComponent(search.trim())}`).then(setResults).catch(() => {}), 200);
    return () => clearTimeout(h);
  }, [search]);

  const nav = useMemo(() => (user ? visibleNav(user.role) : []), [user]);
  if (!ready || !user) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><Spin size="large" /></div>;

  const allowed = canAccessRoute(user.role, path);
  const allItems = nav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.key })));
  const selected = allItems.filter((i) => path === i.path || path.startsWith(i.path + '/')).sort((a, b) => b.path.length - a.path.length)[0];

  const menuItems = nav.map((g) => ({
    key: g.key, icon: ICONS[g.icon], label: g.label,
    children: g.items.map((i) => ({
      key: i.path,
      label: i.badge === 'followups' && due ? <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{i.label}<Badge count={due} size="small" color={GOLD} /></span> : i.label,
    })),
  }));

  const quick = [
    hasRole('RECEPTION', 'MANAGER', 'DOCTOR') && { key: '/clients/new', label: 'Register client' },
    hasRole('RECEPTION', 'MANAGER', 'DOCTOR') && { key: '/scheduler?book=1', label: 'Book appointment' },
    hasRole('RECEPTION', 'MANAGER', 'ACCOUNTANT') && { key: '/billing/new', label: 'New invoice / sell package' },
    hasRole('RECEPTION', 'MANAGER', 'DOCTOR') && { key: '/leads?new=1', label: 'Add enquiry (lead)' },
  ].filter(Boolean) as { key: string; label: string }[];

  const searchOptions = [
    ...(results.clients.length ? [{ label: 'Clients', options: results.clients.map((c) => ({ value: `/clients/${c.id}`, label: <span><b>{c.name}</b> <span className="muted">· {c.clientNo} · {c.mobile}</span></span> })) }] : []),
    ...(results.invoices.length ? [{ label: 'Invoices', options: results.invoices.map((i) => ({ value: `/billing/${i.id}`, label: <span><b>{i.number}</b> <span className="muted">· {i.client.name}</span></span> })) }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} trigger={null} width={252} collapsedWidth={72} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
        <Link href={homeFor(user.role)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '16px 14px' : '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Walnut" style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', padding: 2, flexShrink: 0 }} />
          {!collapsed && (
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ color: '#F0C45C', fontWeight: 700, letterSpacing: '.08em', fontSize: 15 }}>WALNUT</div>
              <div style={{ color: '#9A9383', fontSize: 11 }}>Smart Center ERP</div>
            </div>
          )}
        </Link>
        <Menu
          theme="dark" mode="inline" items={menuItems} selectedKeys={selected ? [selected.path] : []}
          defaultOpenKeys={selected ? [selected.group] : []} onClick={(e) => router.push(e.key)} style={{ borderInlineEnd: 0, padding: '8px 0 24px' }}
        />
      </Sider>
      <Layout>
        <Header className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #ECEAE4', position: 'sticky', top: 0, zIndex: 20 }}>
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" />
          <Tooltip title="All modules & reports (Ctrl+K)">
            <Button icon={<AppstoreOutlined />} onClick={() => setModules(true)}>Modules</Button>
          </Tooltip>
          <AutoComplete
            style={{ flex: 1, maxWidth: 460 }} options={searchOptions} value={search} onChange={setSearch} allowClear
            prefix={<SearchOutlined className="muted" />} placeholder="Search client name, mobile, client ID or invoice no."
            onSelect={(v) => { setSearch(''); router.push(String(v)); }}
          />
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dayjs().format('ddd, DD MMM YYYY')}</span>
          {quick.length > 0 && (
            <Dropdown menu={{ items: quick, onClick: (e) => router.push(e.key) }} placement="bottomRight">
              <Button type="primary" icon={<PlusOutlined />}>New</Button>
            </Dropdown>
          )}
          <Tooltip title={`${due} follow-up(s) due or overdue`}>
            <Badge count={due} size="small" offset={[-4, 4]}>
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} onClick={() => router.push(canAccessRoute(user.role, '/followups') ? '/followups' : '/reports/followups')} aria-label="Follow-ups" />
            </Badge>
          </Tooltip>
          <Dropdown
            placement="bottomRight"
            menu={{
              items: [
                { key: 'who', disabled: true, label: <div style={{ lineHeight: 1.4 }}><b>{user.name}</b><br /><span className="muted">{ROLE_LABEL[user.role]} · {tenant?.name ?? 'Walnut'}</span></div> },
                { type: 'divider' },
                { key: 'out', icon: <LogoutOutlined />, label: 'Sign out', onClick: logout },
              ],
            }}
          >
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar style={{ background: GOLD }}>{initials(user.name)}</Avatar>
              <span style={{ lineHeight: 1.15, display: 'flex', flexDirection: 'column' }}>
                <b style={{ fontSize: 13 }}>{user.name}</b>
                <span className="muted" style={{ fontSize: 11 }}>{ROLE_LABEL[user.role]}</span>
              </span>
            </span>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, minWidth: 0 }}>
          {allowed ? children : (
            <Result status="403" title="Access restricted" subTitle={`Your role (${ROLE_LABEL[user.role]}) does not have permission to view this page.`}
              extra={<Button type="primary" onClick={() => router.push(homeFor(user.role))}>Go to my home page</Button>} />
          )}
        </Content>
      </Layout>
      <ModulesMenu open={modules} onClose={() => setModules(false)} role={user.role} due={due} />
    </Layout>
  );
}
