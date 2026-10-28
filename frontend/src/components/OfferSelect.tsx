'use client';
import { useEffect, useState } from 'react';
import { AutoComplete } from 'antd';
import { api } from '@/lib/api';

/** Marketing offers already in use, shared by every OfferSelect on the page (loaded once). */
let cache: Promise<{ offer: string; leads: number; clients: number }[]> | null = null;
export const loadOffers = (fresh = false) => (cache = !cache || fresh ? api<any[]>('/offers').catch(() => []) : cache);

/** Pick an existing marketing offer or type a new one (offers are free text, so a new campaign needs no setup). */
export default function OfferSelect({ id, value, onChange, style }: { id?: string; value?: string | null; onChange?: (v: string | null) => void; style?: React.CSSProperties }) {
  const [offers, setOffers] = useState<string[]>([]);
  useEffect(() => { loadOffers().then((o) => setOffers(o.map((x) => x.offer))); }, []);
  return (
    <AutoComplete
      id={id} value={value ?? undefined} onChange={(v) => onChange?.(v || null)} allowClear style={style} placeholder="Select or type an offer / campaign"
      options={offers.map((value) => ({ value }))}
      showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }}
    />
  );
}
