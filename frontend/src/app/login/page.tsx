'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Form, Input } from 'antd';
import { CalendarOutlined, CheckCircleFilled, LoadingOutlined, LockOutlined, MailOutlined, PieChartOutlined, SafetyCertificateOutlined, ShopOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/nav';
import { ESPRESSO } from '@/lib/theme';

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_PASSWORD = 'walnut@123';
const DEMO_USERS = [
  { email: 'salha@walnut.local', label: 'Manager', sub: 'Everything — scheduling, billing, reports, settings', initials: 'SA', bg: '#FBF1D9', fg: '#8A6410' },
  { email: 'reception@walnut.local', label: 'Reception', sub: 'Registration, bookings and invoicing', initials: 'NO', bg: '#E6F0FA', fg: '#2A5F92' },
  { email: 'accounts@walnut.local', label: 'Accountant', sub: 'Invoices, payments and finance reports', initials: 'RA', bg: '#ECE8FA', fg: '#5B4BB0' },
  { email: 'mariegold@walnut.local', label: 'Therapist', sub: 'Today’s sessions and treatment delivery', initials: 'MG', bg: '#E4F4EC', fg: '#1D7A4F' },
];

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const router = useRouter();
  const [form] = Form.useForm();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string>();

  useEffect(() => { if (ready && user) router.replace(homeFor(user.role)); }, [ready, user, router]);

  const onFinish = async (v: { tenantSlug: string; email: string; password: string }) => {
    setLoading(true); setErr('');
    try {
      const u = await login(v.tenantSlug.trim().toLowerCase(), v.email.trim(), v.password);
      router.replace(homeFor(u.role));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Login failed'); } finally { setLoading(false); }
  };

  // One-click sign in for client demos.
  const demoLogin = async (email: string) => {
    setDemoLoading(email); setErr('');
    try {
      const u = await login('walnut', email, DEMO_PASSWORD);
      router.replace(homeFor(u.role));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Login failed'); } finally { setDemoLoading(undefined); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F5F4F0' }}>
      <div style={{ flex: '1 1 50%', background: `radial-gradient(circle at 30% 20%, #3A3122 0%, ${ESPRESSO} 60%)`, color: '#EDE6D6', padding: '56px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="login-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Walnut" style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', padding: 3 }} />
          <div>
            <div style={{ color: '#F0C45C', fontWeight: 700, letterSpacing: '.12em', fontSize: 20 }}>WALNUT</div>
            <div style={{ fontSize: 13, color: '#B9B09C' }}>Smart Center Management System</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 650, margin: '0 0 16px', color: '#fff', letterSpacing: '-0.02em' }}>The complete operating system for slimming & body-shaping centres.</h1>
          <div style={{ display: 'grid', gap: 12, fontSize: 15, maxWidth: 520 }}>
            {[
              [<CalendarOutlined key="a" />, 'Clash-free scheduling of therapists, machines and rooms'],
              [<CheckCircleFilled key="b" />, 'Package & session balances for single and mixed programmes'],
              [<SafetyCertificateOutlined key="c" />, 'Body composition tracking with automated 15-day reviews'],
              [<PieChartOutlined key="d" />, 'UAE VAT invoicing, collections and live management analytics'],
            ].map(([icon, text], i) => <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ color: '#F0C45C', fontSize: 18 }}>{icon}</span>{text}</div>)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#8E8676' }}>© {new Date().getFullYear()} Walnut Slimming & Body Shaping Center · Dubai, UAE</div>
      </div>
      <div style={{ flex: '1 1 50%', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h2 style={{ fontSize: 26, fontWeight: 650, margin: 0 }}>Sign in</h2>
          <p className="muted" style={{ marginTop: 6 }}>Use your individual staff login.</p>
          {err && <Alert type="error" title={err} showIcon style={{ marginBottom: 16 }} />}
          <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ tenantSlug: 'walnut' }} requiredMark={false} size="large">
            <Form.Item name="tenantSlug" label="Centre ID" rules={[{ required: true }]}><Input prefix={<ShopOutlined className="muted" />} /></Form.Item>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input prefix={<MailOutlined className="muted" />} placeholder="you@walnut.local" autoComplete="username" /></Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}><Input.Password prefix={<LockOutlined className="muted" />} autoComplete="current-password" /></Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Sign in</Button>
          </Form>
          {DEMO && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #E8E5DD' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Explore the demo as…</div>
              <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Each role sees different menus and dashboards. Sample data only. Password for any account: <b>{DEMO_PASSWORD}</b></div>
              <div className="demo-roles">
                {DEMO_USERS.map((d) => (
                  <button key={d.email} type="button" className="demo-role" disabled={!!demoLoading} onClick={() => demoLogin(d.email)}>
                    <span style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: d.bg, color: d.fg, fontSize: 13, fontWeight: 600 }}>
                      {demoLoading === d.email ? <LoadingOutlined /> : d.initials}
                    </span>
                    <span style={{ minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: '#1F1A12' }}>{d.label}</span>
                      <span className="muted" style={{ display: 'block', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .login-brand { display: none !important; } }
        .demo-roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .demo-role { display: flex; align-items: center; gap: 12px; padding: 12px; background: #fff; border: 1px solid #ECEAE4; border-radius: 12px; cursor: pointer; font: inherit; transition: border-color .15s, box-shadow .15s; }
        .demo-role:hover:not(:disabled) { border-color: #D9C48F; box-shadow: 0 2px 8px rgba(60, 45, 20, .08); }
        .demo-role:disabled { cursor: wait; opacity: .7; }
        @media (max-width: 420px) { .demo-roles { grid-template-columns: 1fr; } }`}</style>
    </div>
  );
}
