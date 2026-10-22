'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { canAccessRoute } from './nav';

export type User = { id: string; name: string; role: string; designation?: string | null };
export type Tenant = { name: string; slug: string };
type Ctx = {
  user: User | null;
  tenant: Tenant | null;
  ready: boolean;
  login: (tenantSlug: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  canAccess: (path: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
};

export { canAccessRoute };

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const u = localStorage.getItem('walnut_user');
      if (u && localStorage.getItem('walnut_token')) {
        setUser(JSON.parse(u));
        setTenant(JSON.parse(localStorage.getItem('walnut_tenant') ?? 'null'));
      }
    } catch {}
    setReady(true);
  }, []);

  const login = useCallback(async (tenantSlug: string, email: string, password: string) => {
    const r = await api<{ token: string; user: User; tenant: Tenant }>('/auth/login', { method: 'POST', body: { tenantSlug, email, password } });
    localStorage.setItem('walnut_token', r.token);
    localStorage.setItem('walnut_user', JSON.stringify(r.user));
    localStorage.setItem('walnut_tenant', JSON.stringify(r.tenant));
    setUser(r.user);
    setTenant(r.tenant);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    ['walnut_token', 'walnut_user', 'walnut_tenant'].forEach((k) => localStorage.removeItem(k));
    setUser(null);
    router.replace('/login');
  }, [router]);

  const canAccess = useCallback((path: string) => !!user && canAccessRoute(user.role, path), [user]);
  // SUPER_ADMIN passes every role check, mirroring the API's requireRole.
  const hasRole = useCallback((...roles: string[]) => !!user && (user.role === 'SUPER_ADMIN' || roles.includes(user.role)), [user]);

  return <AuthCtx.Provider value={{ user, tenant, ready, login, logout, canAccess, hasRole }}>{children}</AuthCtx.Provider>;
}
