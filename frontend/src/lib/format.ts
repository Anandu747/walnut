import dayjs from 'dayjs';

export const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  SCHEDULED: { label: 'Booked', color: 'gold', dot: '#E0A800' },
  CONFIRMED: { label: 'Confirmed', color: 'cyan', dot: '#13A8A8' },
  CHECKED_IN: { label: 'Arrived', color: 'blue', dot: '#2a78d6' },
  IN_PROGRESS: { label: 'In treatment', color: 'purple', dot: '#6250d6' },
  COMPLETED: { label: 'Completed', color: 'green', dot: '#2E8B57' },
  CANCELLED: { label: 'Cancelled', color: 'default', dot: '#A8A49B' },
  NO_SHOW: { label: 'No-show', color: 'red', dot: '#C8372D' },
};
export const statusColor: Record<string, string> = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.color]));

export const INVOICE_STATUS: Record<string, string> = { DRAFT: 'default', ISSUED: 'orange', PARTIALLY_PAID: 'gold', PAID: 'green', VOID: 'default' };
export const PACKAGE_STATUS: Record<string, string> = { ACTIVE: 'green', EXPIRED: 'red', COMPLETED: 'blue', CANCELLED: 'default' };
export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', MANAGER: 'Centre Manager', DOCTOR: 'Consultant / Doctor', RECEPTION: 'Front Desk', THERAPIST: 'Therapist', ACCOUNTANT: 'Accountant',
};
export const PAY_METHODS = [
  { value: 'CARD', label: 'Card' }, { value: 'CASH', label: 'Cash' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'TABBY', label: 'Tabby (BNPL)' }, { value: 'TAMARA', label: 'Tamara (BNPL)' }, { value: 'CHEQUE', label: 'Cheque' },
];
export const SOURCES = ['Instagram', 'Google', 'Referral', 'Walk-in', 'TikTok', 'Website', 'Facebook', 'Other'];

export const fmtDate = (d?: string | Date | null) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const fmtDateTime = (d?: string | Date | null) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—');
export const fmtTime = (d?: string | Date | null) => (d ? dayjs(d).format('HH:mm') : '—');
export const humanize = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

const aed = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aed0 = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });
// Non-breaking space keeps 'AED 1,234.00' on one line inside narrow table cells.
export const money = (n?: number | string | null, decimals = true) => (n == null ? '—' : `AED\u00A0${(decimals ? aed : aed0).format(Number(n))}`);
export const num = (n?: number | string | null) => (n == null ? '—' : aed0.format(Number(n)));
/** Compact figures for tiles and axes: 1,284 / 12.9K / 1.2M. */
export const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : aed0.format(n));
export const age = (dob?: string | null) => (dob ? dayjs().diff(dayjs(dob), 'year') : null);
export const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const initials = (name: string) => name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
/** Converts dayjs values in a form payload to ISO strings. */
export const isoDates = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dayjs.isDayjs(v) ? v.toISOString() : v]));
export const qs = (o: Record<string, unknown>) => new URLSearchParams(Object.entries(clean(o)).map(([k, v]) => [k, dayjs.isDayjs(v) ? v.toISOString() : String(v)])).toString();
