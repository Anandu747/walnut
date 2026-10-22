'use client';
import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { api } from '@/lib/api';

/** Server-side client search (name, mobile, client ID). Keeps the selected client visible even when not in results. */
export default function ClientSelect({ value, onChange, placeholder = 'Search client by name, mobile or ID', initialLabel, style }: {
  value?: string; onChange?: (v: string, c?: any) => void; placeholder?: string; initialLabel?: string; style?: React.CSSProperties;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const h = setTimeout(async () => {
      setLoading(true);
      try { setRows((await api<{ rows: any[] }>(`/clients?pageSize=20&q=${encodeURIComponent(q)}`)).rows); } catch {} finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    if (value && !rows.some((r) => r.id === value) && selected?.id !== value) api(`/clients/${value}`).then(setSelected).catch(() => {});
  }, [value, rows, selected]);

  const all = [...(selected && !rows.some((r) => r.id === selected.id) ? [selected] : []), ...rows];
  return (
    <Select
      showSearch={{ filterOption: false, onSearch: setQ }} value={value} loading={loading} placeholder={placeholder} style={style}
      notFoundContent={loading ? 'Searching…' : 'No client found'}
      onChange={(v) => { const c = all.find((r) => r.id === v); setSelected(c); onChange?.(v, c); }}
      options={all.map((c) => ({ value: c.id, label: `${c.name} · ${c.clientNo} · ${c.mobile}` }))}
      labelRender={(o) => (o.value === value && !all.length && initialLabel) ? initialLabel : o.label}
    />
  );
}
