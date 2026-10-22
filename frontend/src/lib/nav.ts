// Single source of truth for navigation: sidebar, the "Modules / Reports" launcher and route permissions.
export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'DOCTOR' | 'RECEPTION' | 'THERAPIST' | 'ACCOUNTANT';
export type NavItem = { path: string; label: string; roles: Role[]; badge?: 'followups' | 'new'; hidden?: boolean };
export type NavGroup = { key: string; label: string; icon: string; items: NavItem[] };

const ALL: Role[] = ['SUPER_ADMIN', 'MANAGER', 'DOCTOR', 'RECEPTION', 'THERAPIST', 'ACCOUNTANT'];
const FRONT: Role[] = ['SUPER_ADMIN', 'MANAGER', 'DOCTOR', 'RECEPTION'];
const CLINICAL: Role[] = ['SUPER_ADMIN', 'MANAGER', 'DOCTOR', 'RECEPTION', 'THERAPIST'];
const FINANCE: Role[] = ['SUPER_ADMIN', 'MANAGER', 'RECEPTION', 'ACCOUNTANT'];
const MGMT: Role[] = ['SUPER_ADMIN', 'MANAGER'];
const REPORTS: Role[] = ['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT'];

export const NAV: NavGroup[] = [
  {
    key: 'home', label: 'Overview', icon: 'dashboard', items: [
      { path: '/dashboard', label: 'Dashboard', roles: ALL },
      { path: '/front-desk', label: 'Front Desk Today', roles: CLINICAL },
    ],
  },
  {
    key: 'scheduler', label: 'Scheduler', icon: 'calendar', items: [
      { path: '/scheduler', label: 'Resource Calendar', roles: CLINICAL },
      { path: '/appointments', label: 'Search Appointments', roles: CLINICAL },
      { path: '/resources/downtime', label: 'Resource Availability', roles: [...MGMT, 'RECEPTION'] },
    ],
  },
  {
    key: 'clients', label: 'Clients', icon: 'team', items: [
      { path: '/clients/new', label: 'Client Registration', roles: FRONT },
      { path: '/clients', label: 'Client Register', roles: CLINICAL },
      { path: '/followups', label: 'Follow-ups & Reviews', roles: FRONT, badge: 'followups' },
      { path: '/leads', label: 'Leads & Enquiries', roles: FRONT },
      { path: '/messages', label: 'Send Message', roles: FRONT },
    ],
  },
  {
    key: 'packages', label: 'Packages', icon: 'gift', items: [
      { path: '/packages', label: 'Package Catalogue', roles: [...FRONT, 'ACCOUNTANT'] },
      { path: '/packages/sold', label: 'Client Packages & Balances', roles: [...FRONT, 'ACCOUNTANT'] },
    ],
  },
  {
    key: 'billing', label: 'Billing', icon: 'wallet', items: [
      { path: '/billing/new', label: 'New Invoice', roles: FINANCE },
      { path: '/billing', label: 'Search Bills', roles: FINANCE },
      { path: '/billing/receipts', label: 'Receipts & Refunds', roles: FINANCE },
      { path: '/billing/day-book', label: 'Day Book (Cash-up)', roles: FINANCE },
    ],
  },
  {
    key: 'resources', label: 'Resources', icon: 'tool', items: [
      { path: '/resources/machines', label: 'Machines & Equipment', roles: [...MGMT, 'RECEPTION'] },
      { path: '/resources/rooms', label: 'Treatment Rooms', roles: MGMT },
      { path: '/resources/treatments', label: 'Treatments & Services', roles: [...MGMT, 'RECEPTION', 'ACCOUNTANT'] },
      { path: '/staff', label: 'Staff & Qualifications', roles: MGMT },
    ],
  },
  {
    key: 'reports', label: 'Analytics', icon: 'chart', items: [
      { path: '/reports', label: 'Reports Centre', roles: REPORTS },
    ],
  },
  {
    key: 'admin', label: 'Administration', icon: 'setting', items: [
      { path: '/settings', label: 'Centre Settings', roles: MGMT },
      { path: '/settings/audit', label: 'Audit Log', roles: MGMT },
    ],
  },
];

export type ReportDef = { key: string; label: string; group: string; frequency: string; roles: Role[]; description: string };
export const REPORT_LIST: ReportDef[] = [
  { key: 'daily-appointments', label: 'Daily appointment & treatment report', group: 'Operations', frequency: 'Daily', roles: [...REPORTS, 'RECEPTION'], description: 'Every appointment of a day with therapist, machine, room and status' },
  { key: 'therapist-sessions', label: 'Therapist-wise completed sessions', group: 'Operations', frequency: 'Daily / Weekly / Monthly', roles: REPORTS, description: 'Sessions, minutes, delivered value, no-shows and commission per therapist' },
  { key: 'machine-utilisation', label: 'Machine utilisation & idle hours', group: 'Operations', frequency: 'Daily / Weekly / Monthly', roles: REPORTS, description: 'Actual vs booked utilisation after deducting downtime' },
  { key: 'followups', label: 'Doctor follow-up due / overdue', group: 'Operations', frequency: 'Daily', roles: [...REPORTS, 'RECEPTION', 'DOCTOR'], description: 'Open review and follow-up tasks due today or overdue' },
  { key: 'package-liability', label: 'Active packages & pending sessions', group: 'Packages', frequency: 'Real time', roles: REPORTS, description: 'Unfulfilled session value (deferred revenue) per active package' },
  { key: 'package-expiry', label: 'Package expiry & renewals due', group: 'Packages', frequency: 'Daily / Weekly', roles: [...REPORTS, 'RECEPTION'], description: 'Packages expiring soon with sessions still unused' },
  { key: 'sales-by-treatment', label: 'Sales by treatment & package', group: 'Finance', frequency: 'Weekly / Monthly / Yearly', roles: REPORTS, description: 'Quantity, gross, discount, net and VAT per item sold' },
  { key: 'collections', label: 'Collections, outstanding & refunds', group: 'Finance', frequency: 'Daily / Monthly', roles: REPORTS, description: 'Money received by method, refunds and ageing of unpaid invoices' },
  { key: 'vat', label: 'VAT sales & tax summary', group: 'Finance', frequency: 'Tax period', roles: REPORTS, description: 'Standard, zero-rated and exempt supplies with output VAT' },
  { key: 'new-vs-returning', label: 'New vs returning clients', group: 'Growth', frequency: 'Monthly', roles: REPORTS, description: 'Client acquisition and retention month by month' },
  { key: 'yoy', label: 'Monthly sales vs same month last year', group: 'Growth', frequency: 'Monthly / Yearly', roles: REPORTS, description: 'Sales, collections and delivered value, year on year' },
];

const flat = NAV.flatMap((g) => g.items);

/** Longest matching route prefix decides access; unknown routes are super-admin only. */
export function canAccessRoute(role: string, path: string): boolean {
  if (path.startsWith('/reports/')) {
    const r = REPORT_LIST.find((x) => path === `/reports/${x.key}`);
    return !!r && r.roles.includes(role as Role);
  }
  const rule = flat.filter((i) => path === i.path || path.startsWith(i.path + '/')).sort((a, b) => b.path.length - a.path.length)[0];
  if (!rule) return role === 'SUPER_ADMIN';
  return rule.roles.includes(role as Role);
}

export const visibleNav = (role: string) =>
  NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden && i.roles.includes(role as Role)) })).filter((g) => g.items.length);

export const homeFor = (role: string) => (role === 'THERAPIST' ? '/front-desk' : '/dashboard');
