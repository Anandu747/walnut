'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { api } from './api';

/** Loads `path` (re-runs when it changes; null skips). Errors surface as a toast. */
export function useApi<T = any>(path: string | null, initial?: T) {
  const { message } = App.useApp();
  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (mine === seq.current) setData(d);
    } catch (e) {
      if (mine === seq.current) message.error((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path, message]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload, setData };
}
