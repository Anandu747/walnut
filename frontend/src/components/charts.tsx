'use client';
import { useEffect, useRef, useState } from 'react';
import { compact } from '@/lib/format';
import { INK } from '@/lib/theme';

/*
 * Small dependency-free SVG charts following the dataviz spec:
 * thin marks (bars <= 24px, 4px rounded data-end, square at baseline), 2px lines, >= 8px markers with a surface ring,
 * hairline solid gridlines, one y-axis, hover tooltips, legend only for >= 2 series. Text always uses ink tokens.
 */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

type Tip = { x: number; y: number; title: string; rows: { label: string; value: string; color: string }[] } | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), width - 190);
  return (
    <div style={{ position: 'absolute', left, top: Math.max(0, tip.y - 10), pointerEvents: 'none', background: '#1F1D1A', color: '#fff', padding: '8px 10px', borderRadius: 8, fontSize: 12, minWidth: 150, boxShadow: '0 4px 14px rgba(0,0,0,.2)', zIndex: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />{r.label}</span>
          <b className="tabular">{r.value}</b>
        </div>
      ))}
    </div>
  );
}

const roundTop = (x: number, y: number, w: number, h: number, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export type Series = { key: string; label: string; color: string };

/** Column chart; one or two series side by side on a shared y-axis. */
export function ColumnChart({ data, x, series, height = 240, format = (v: number) => compact(v), xFormat = (s: string) => s, labelEvery }: {
  data: Record<string, any>[]; x: string; series: Series[]; height?: number; format?: (v: number) => string; xFormat?: (s: string) => string; labelEvery?: number;
}) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const ih = height - pad.t - pad.b, iw = w - pad.l - pad.r;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))));
  const band = iw / Math.max(1, data.length);
  const gap = 2;
  const bw = Math.min(24, Math.max(3, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const group = bw * series.length + gap * (series.length - 1);
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 56))));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setTip(null)}>
      <svg width={w} height={height} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} by ${x}`}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize={11} fill={INK.muted} className="tabular">{compact(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const gx = pad.l + i * band + (band - group) / 2;
          return (
            <g key={i}>
              {series.map((s, k) => {
                const v = Number(d[s.key]) || 0;
                const h = (Math.max(0, v) / max) * ih;
                return <path key={s.key} d={roundTop(gx + k * (bw + gap), pad.t + ih - h, bw, h)} fill={s.color} />;
              })}
              {i % every === 0 && <text x={pad.l + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize={11} fill={INK.muted}>{xFormat(d[x])}</text>}
              <rect
                x={pad.l + i * band} y={pad.t} width={band} height={ih} fill="transparent"
                onMouseMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title: xFormat(d[x]), rows: series.map((s) => ({ label: s.label, value: format(Number(d[s.key]) || 0), color: s.color })) });
                }}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  );
}

/** Single-series line with markers and a crosshair tooltip — used for body-composition progress. */
export function LineChart({ data, x, y, color, height = 200, format = (v: number) => String(v), xFormat = (s: string) => s, target }: {
  data: Record<string, any>[]; x: string; y: string; color: string; height?: number; format?: (v: number) => string; xFormat?: (s: string) => string; target?: number | null;
}) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = data.filter((d) => d[y] != null);
  const pad = { l: 40, r: 14, t: 12, b: 24 };
  const ih = height - pad.t - pad.b, iw = w - pad.l - pad.r;
  const vals = pts.map((d) => Number(d[y]));
  if (target != null) vals.push(target);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  const span = Math.max(1, hi - lo);
  lo = Math.floor(lo - span * 0.15); hi = Math.ceil(hi + span * 0.15);
  const sx = (i: number) => pad.l + (pts.length <= 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const sy = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = [0, 0.5, 1].map((f) => lo + f * (hi - lo));
  const path = pts.map((d, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(Number(d[y]))}`).join('');
  const every = Math.max(1, Math.ceil(pts.length / Math.max(1, Math.floor(iw / 70))));
  const h = hover != null ? pts[hover] : null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height}
        onMouseMove={(e) => {
          if (!pts.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (pts.length - 1));
          setHover(Math.min(pts.length - 1, Math.max(0, i)));
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} stroke={INK.grid} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill={INK.muted} className="tabular">{format(Math.round(t * 10) / 10)}</text>
          </g>
        ))}
        {target != null && (
          <g>
            <line x1={pad.l} x2={w - pad.r} y1={sy(target)} y2={sy(target)} stroke={INK.secondary} strokeWidth={1} />
            <text x={w - pad.r} y={sy(target) - 4} textAnchor="end" fontSize={11} fill={INK.secondary}>Target {format(target)}</text>
          </g>
        )}
        {pts.map((d, i) => i % every === 0 && <text key={i} x={sx(i)} y={height - 6} textAnchor={pts.length > 1 && i === 0 ? 'start' : i === pts.length - 1 && pts.length > 1 ? 'end' : 'middle'} fontSize={11} fill={INK.muted}>{xFormat(d[x])}</text>)}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={pad.t + ih} stroke={INK.axis} />}
        {pts.map((d, i) => <circle key={i} cx={sx(i)} cy={sy(Number(d[y]))} r={hover === i ? 5.5 : 4} fill={color} stroke="#fff" strokeWidth={2} />)}
        {pts.length > 0 && (
          <text x={sx(pts.length - 1)} y={sy(Number(pts[pts.length - 1][y])) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill={INK.primary}>{format(Number(pts[pts.length - 1][y]))}</text>
        )}
      </svg>
      {h && <Tooltip width={w} tip={{ x: sx(hover!), y: sy(Number(h[y])), title: xFormat(h[x]), rows: [{ label: y, value: format(Number(h[y])), color }] }} />}
    </div>
  );
}

/** Horizontal meter list (utilisation, workload share). Track is a light step of the same hue. */
export function MeterList({ rows, color, max = 100, format = (v: number) => `${v}%`, warnAt }: {
  rows: { label: React.ReactNode; value: number; note?: string }[]; color: string; max?: number; format?: (v: number) => string; warnAt?: number;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((r, i) => {
        const warn = warnAt != null && r.value >= warnAt;
        return (
          <div key={i} title={r.note}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{r.label}</span>
              <b className="tabular">{format(r.value)}{warn && <span style={{ color: '#B25E09', fontWeight: 500, marginLeft: 6, fontSize: 12 }}>▲ near capacity</span>}</b>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: `${color}22` }}>
              <div style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, height: 8, borderRadius: 4, background: warn ? '#D48806' : color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
