"use client";
import { useState, useEffect, useRef, Children, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
import remarkGfm from 'remark-gfm';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  LineChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';

declare global {
  interface Window {
    LGContainer: any;
    LGButton: any;
    glassControls: Record<string, number>;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.ready === '1') { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { s.dataset.ready = '1'; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const BG = 'linear-gradient(135deg, #edf2f7 0%, #f0ecf7 50%, #f7f0ec 100%)';

type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change?: number;
  changePercent?: number;
};

type ChartData = {
  ticker: string;
  company: string;
  prices: PricePoint[];
};

type FinancialChartData = {
  company: string;
  metrics: Record<string, Record<string, number>>;
  question?: string;
};

type FinancialChartPayload = {
  annual?: FinancialChartData[];
  quarterly?: FinancialChartData[];
};

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'All', days: Infinity },
] as const;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPrice(v: number) {
  return `$${v.toFixed(2)}`;
}

function formatVolume(v: number) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function PriceTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as PricePoint;
  const isUp = (d.change ?? 0) >= 0;
  return (
    <div className="bg-white/90 backdrop-blur-sm border border-black/8 rounded-xl px-4 py-3 shadow-lg text-xs">
      <p className="font-semibold text-black mb-2 tracking-wide">{d.date}</p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1">
        <span className="text-black/40">Open</span>  <span className="text-black font-medium">{formatPrice(d.open)}</span>
        <span className="text-black/40">High</span>  <span className="text-black font-medium">{formatPrice(d.high)}</span>
        <span className="text-black/40">Low</span>   <span className="text-black font-medium">{formatPrice(d.low)}</span>
        <span className="text-black/40">Close</span> <span className="text-black font-medium">{formatPrice(d.close)}</span>
        <span className="text-black/40">Volume</span><span className="text-black font-medium">{formatVolume(d.volume)}</span>
        {d.changePercent !== undefined && (
          <>
            <span className="text-black/40">Chg%</span>
            <span className={isUp ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
              {isUp ? '+' : ''}{d.changePercent.toFixed(2)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const LINE_COLORS = ['#059669', '#6366f1', '#e11d48', '#f59e0b'];

function PriceChart({ data }: { data: ChartData | ChartData[] }) {
  const [range, setRange] = useState<typeof RANGES[number]['label']>('3M');
  const datasets = Array.isArray(data) ? data : [data];
  const isComparison = datasets.length > 1;

  const days = RANGES.find(r => r.label === range)!.days;

  if (!isComparison) {
    const single = datasets[0];
    const allSorted = [...single.prices].reverse();
    const chartPoints = days === Infinity ? allSorted : allSorted.slice(-days);
    const closes = chartPoints.map(p => p.close);
    const minClose = Math.min(...closes);
    const maxClose = Math.max(...closes);
    const first = chartPoints[0]?.close ?? 0;
    const last  = chartPoints[chartPoints.length - 1]?.close ?? 0;
    const overallUp = last >= first;
    const lineColor = overallUp ? '#059669' : '#e11d48';

    return (
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div>
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-black/40">{single.ticker}</span>
            <span className="ml-2 text-[11px] text-black/25 tracking-wide">{single.company}</span>
          </div>
          <div className="flex gap-1">
            {RANGES.map(r => (
              <button key={r.label} onClick={() => setRange(r.label)}
                className={`text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full transition-colors ${
                  range === r.label ? 'bg-black text-white' : 'text-black/35 hover:text-black/60'
                }`}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-2xl font-light tracking-tight text-black">{formatPrice(last)}</span>
          <span className={`text-sm font-medium ${overallUp ? 'text-emerald-600' : 'text-red-500'}`}>
            {overallUp ? '+' : ''}{(last - first).toFixed(2)} ({overallUp ? '+' : ''}{(((last - first) / first) * 100).toFixed(2)}%)
          </span>
          <span className="text-xs text-black/25">over period</span>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
              <YAxis domain={[minClose * 0.99, maxClose * 1.01]} tickFormatter={v => `$${v.toFixed(0)}`} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={48} tickCount={4} />
              <Tooltip content={<PriceTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5} fill="url(#priceGrad)" dot={false} activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="h-14 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartPoints} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Bar dataKey="volume" fill="rgba(0,0,0,0.07)" radius={[1, 1, 0, 0]} maxBarSize={6} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-black/20 tracking-widest uppercase mt-1">Volume</p>
      </div>
    );
  }

  // Multi-company comparison: merge by date, normalize to % change
  const allDates = new Map<string, Record<string, number>>();
  datasets.forEach((ds) => {
    const sorted = [...ds.prices].reverse();
    const sliced = days === Infinity ? sorted : sorted.slice(-days);
    const basePrice = sliced[0]?.close ?? 1;
    sliced.forEach(p => {
      if (!allDates.has(p.date)) allDates.set(p.date, {});
      allDates.get(p.date)![ds.ticker] = ((p.close - basePrice) / basePrice) * 100;
    });
  });
  const mergedData = Array.from(allDates.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex gap-4">
          {datasets.map((ds, i) => (
            <div key={ds.ticker} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
              <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-black/40">{ds.ticker}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r.label)}
              className={`text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full transition-colors ${
                range === r.label ? 'bg-black text-white' : 'text-black/35 hover:text-black/60'
              }`}>{r.label}</button>
          ))}
        </div>
      </div>

      <p className="text-xs text-black/30 mb-6 tracking-wide">% change from start of period</p>

      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
            <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={48} tickCount={5} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [`${(value as number).toFixed(2)}%`, String(name)]}
              labelFormatter={(label: unknown) => formatDate(String(label))}
              contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, fontSize: 12 }}
            />
            {datasets.map((ds, i) => (
              <Line key={ds.ticker} type="monotone" dataKey={ds.ticker} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const METRIC_COLORS = ['#059669', '#6366f1', '#e11d48', '#f59e0b', '#8b5cf6', '#ec4899'];

function findBestMetric(metrics: string[], question: string): string {
  const q = question.toLowerCase();
  const keywords: [string, string[]][] = [
    ['earnings per share', ['earnings per share', 'eps', 'earning per share']],
    ['net income', ['net income', 'profit', 'net profit']],
    ['total net sales', ['revenue', 'sales', 'net sales', 'total sales']],
    ['gross margin', ['gross margin', 'gross profit']],
  ];
  for (const [, terms] of keywords) {
    if (terms.some(t => q.includes(t))) {
      const match = metrics.find(m => terms.some(t => m.toLowerCase().includes(t)));
      if (match) return match;
    }
  }
  return metrics[0] ?? '';
}

interface ClickedPoint {
  company: string;
  metric: string;
  period: string;
  value: number;
  cx: number;
  cy: number;
  chartTop: number;
}

function DataPointPopover({ point, onClose }: { point: ClickedPoint; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleAsk = () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setAnswer('');
    const context = `Answer in 2-3 short sentences, no tables or headers. Regarding ${point.company}'s ${point.metric} in ${point.period} (value: ${formatValue(point.value)}): ${query}`;
    fetch(`${API_URL}/ask?question=${encodeURIComponent(context)}`)
      .then(r => r.json())
      .then(data => {
        setAnswer(data.answer ?? data.error ?? 'No answer found.');
        setLoading(false);
      })
      .catch(() => {
        setAnswer('Server is temporarily unavailable. Please try again in a moment.');
        setLoading(false);
      });
  };

  return (
    <div ref={ref} className="absolute z-50 bg-white rounded-2xl shadow-xl border border-black/10 p-4 w-80"
      style={{ left: Math.min(point.cx, 320), top: point.cy + point.chartTop - 8, transform: 'translate(-50%, -100%)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-black/50">{point.company} · {point.period}</p>
          <p className="text-lg font-bold">{formatValue(point.value)}</p>
        </div>
        <button onClick={onClose} className="text-black/30 hover:text-black/60 text-lg leading-none">×</button>
      </div>
      <p className="text-[10px] text-black/30 uppercase tracking-widest mb-1.5">{point.metric}</p>
      <div className="flex gap-1.5">
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAsk()}
          placeholder="Ask about this data point..."
          className="flex-1 text-xs px-3 py-2 rounded-xl border border-black/10 outline-none focus:border-black/30 bg-black/[0.02]"
          autoFocus
        />
        <button onClick={handleAsk} disabled={loading}
          className="text-[10px] font-semibold tracking-wider uppercase px-3 py-2 rounded-xl bg-black text-white hover:bg-black/80 disabled:opacity-40 transition-colors">
          {loading ? 'Analyzing...' : 'Ask'}
        </button>
      </div>
      {loading && !answer && (
        <p className="mt-3 text-xs text-black/40 italic animate-pulse">Analyzing SEC filings... this may take a moment</p>
      )}
      {answer && (
        <div className="mt-3 text-xs text-black/70 leading-relaxed max-h-48 overflow-y-auto border-t border-black/5 pt-2 prose prose-xs">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function sortTimeKeys(a: string, b: string) {
  const qMatch = /^Q(\d)\s+(\d{4})$/;
  const aM = a.match(qMatch);
  const bM = b.match(qMatch);
  if (aM && bM) {
    const yearDiff = Number(aM[2]) - Number(bM[2]);
    return yearDiff !== 0 ? yearDiff : Number(aM[1]) - Number(bM[1]);
  }
  return a.localeCompare(b);
}

function buildPoints(dataset: FinancialChartData[], metric: string) {
  const allKeys = new Set<string>();
  dataset.forEach(d => {
    const values = d.metrics[metric];
    if (values) Object.keys(values).forEach(k => allKeys.add(k));
  });
  const keys = Array.from(allKeys).sort(sortTimeKeys);
  return keys.map(key => {
    const point: Record<string, string | number> = { year: key };
    dataset.forEach(d => {
      const values = d.metrics[metric];
      if (values && values[key] !== undefined) point[d.company] = values[key];
    });
    return point;
  });
}

function buildGrowth(points: Record<string, string | number>[], companyKey: string) {
  return points.map((point, idx) => {
    const prev = idx > 0 ? (points[idx - 1][companyKey] as number) : null;
    const curr = point[companyKey] as number;
    const growth = prev !== null && prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null;
    return { year: point.year as string, growth };
  }).filter(p => p.growth !== null);
}

const ZOOM_OPTIONS = [{ label: '3Y', annual: 3, quarterly: 12 }, { label: '5Y', annual: 5, quarterly: 20 }, { label: '10Y', annual: 10, quarterly: 40 }];

function formatValue(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  if (Math.abs(v) < 100) return `$${v.toFixed(2)}`;
  return v.toLocaleString();
}

function ValuePanel({ points, datasets, gradId, height = 'h-44', onDotClick }: { points: Record<string, string | number>[]; datasets: FinancialChartData[]; gradId: string; height?: string; onDotClick?: (company: string, period: string, value: number, cx: number, cy: number) => void }) {
  const allValues = points.flatMap(p => Object.entries(p).filter(([k]) => k !== 'year').map(([, v]) => v as number));
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const wrapRef = useRef<HTMLDivElement>(null);
  return (
    <div className={height} ref={wrapRef}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            {datasets.map((d, i) => (
              <linearGradient key={d.company} id={`${gradId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={METRIC_COLORS[i % METRIC_COLORS.length]} stopOpacity={0.2} />
                <stop offset="100%" stopColor={METRIC_COLORS[i % METRIC_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[Math.min(0, minVal * 0.9), maxVal * 1.1]} tickFormatter={formatValue} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={50} tickCount={4} />
          <Tooltip formatter={(value: unknown, name: unknown) => [formatValue(value as number), String(name)]} contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, fontSize: 12 }} />
          {datasets.map((d, i) => (
            <Area key={d.company} type="monotone" dataKey={d.company} stroke={METRIC_COLORS[i % METRIC_COLORS.length]} strokeWidth={2} fill={`url(#${gradId}-${i})`}
              dot={{ r: 2.5, fill: METRIC_COLORS[i % METRIC_COLORS.length], strokeWidth: 0, cursor: onDotClick ? 'pointer' : 'default' }}
              activeDot={{
                r: 6, strokeWidth: 2, stroke: METRIC_COLORS[i % METRIC_COLORS.length], fill: '#fff', cursor: 'pointer',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick: onDotClick ? (e: any, payload: any) => {
                  const period = String(payload?.payload?.year ?? '');
                  const value = (payload?.payload?.[d.company] as number) ?? 0;
                  onDotClick(d.company, period, value, payload?.cx ?? 0, payload?.cy ?? 0);
                } : undefined,
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function GrowthPanel({ points, barSize = 20 }: { points: { year: string; growth: number | null }[]; barSize?: number }) {
  const maxAbs = Math.min(100, Math.max(10, ...points.map(p => Math.abs(p.growth ?? 0))));
  const bound = Math.ceil(maxAbs / 10) * 10;
  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="year" tick={{ fontSize: 9, fill: 'rgba(0,0,0,0.25)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[-bound, bound]} allowDataOverflow tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 9, fill: 'rgba(0,0,0,0.25)', fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={36} tickCount={3} />
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.15)" />
          <Tooltip formatter={(value: unknown) => [`${(value as number).toFixed(1)}%`, 'Growth']} contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, fontSize: 12 }} />
          <Bar dataKey="growth" radius={[3, 3, 0, 0]} maxBarSize={barSize}>
            {points.map((entry, idx) => (
              <Cell key={idx} fill={(entry.growth ?? 0) >= 0 ? '#059669' : '#e11d48'} fillOpacity={0.8} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function FinancialChart({ data }: { data: FinancialChartPayload }) {
  const hasAnnual = !!data.annual?.length;
  const hasQuarterly = !!data.quarterly?.length;
  const annualData = data.annual ?? [];
  const quarterlyData = data.quarterly ?? [];

  const allMetrics = new Set<string>();
  annualData.forEach(d => Object.keys(d.metrics).forEach(m => allMetrics.add(m)));
  quarterlyData.forEach(d => Object.keys(d.metrics).forEach(m => allMetrics.add(m)));
  const metricList = Array.from(allMetrics);
  const question = annualData[0]?.question ?? quarterlyData[0]?.question ?? '';

  const [selectedMetric, setSelectedMetric] = useState(() => findBestMetric(metricList, question));
  const [zoom, setZoom] = useState('10Y');

  const annualPoints = buildPoints(annualData, selectedMetric);
  const quarterlyPoints = buildPoints(quarterlyData, selectedMetric);

  const zoomOption = ZOOM_OPTIONS.find(z => z.label === zoom) ?? ZOOM_OPTIONS[2];
  const visibleAnnual = annualPoints.slice(-zoomOption.annual);
  const visibleQuarterly = quarterlyPoints.slice(-zoomOption.quarterly);

  const annualCompany = annualData[0]?.company ?? '';
  const quarterlyCompany = quarterlyData[0]?.company ?? '';
  const annualForGrowth = annualPoints.slice(-(zoomOption.annual + 1));
  const quarterlyForGrowth = quarterlyPoints.slice(-(zoomOption.quarterly + 1));
  const annualGrowth = buildGrowth(annualForGrowth, annualCompany);
  const quarterlyGrowth = buildGrowth(quarterlyForGrowth, quarterlyCompany);

  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const MAX_VISIBLE_METRICS = 6;
  const sortedMetrics = [selectedMetric, ...metricList.filter(m => m !== selectedMetric)];

  const [clickedPoint, setClickedPoint] = useState<ClickedPoint | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDotClick = (company: string, period: string, value: number, cx: number, cy: number, sectionRef: React.RefObject<HTMLDivElement | null>) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const sectionRect = sectionRef.current?.getBoundingClientRect();
    if (!containerRect || !sectionRect) return;
    setClickedPoint({ company, metric: selectedMetric, period, value, cx, cy, chartTop: sectionRect.top - containerRect.top });
  };

  const annualRef = useRef<HTMLDivElement>(null);
  const quarterlyRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        {metricList.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {(showAllMetrics ? sortedMetrics : sortedMetrics.slice(0, MAX_VISIBLE_METRICS)).map(m => (
              <button key={m} onClick={() => setSelectedMetric(m)}
                className={`text-[10px] font-semibold tracking-wider uppercase px-3 py-1.5 rounded-full transition-colors ${
                  selectedMetric === m ? 'bg-black text-white' : 'text-black/35 hover:text-black/60 border border-black/10'
                }`}>{m}</button>
            ))}
            {!showAllMetrics && sortedMetrics.length > MAX_VISIBLE_METRICS && (
              <button onClick={() => setShowAllMetrics(true)}
                className="text-[10px] font-semibold tracking-wider uppercase px-3 py-1.5 rounded-full transition-colors text-black/35 hover:text-black/60 border border-dashed border-black/20">
                +{sortedMetrics.length - MAX_VISIBLE_METRICS} more
              </button>
            )}
            {showAllMetrics && sortedMetrics.length > MAX_VISIBLE_METRICS && (
              <button onClick={() => setShowAllMetrics(false)}
                className="text-[10px] font-semibold tracking-wider uppercase px-3 py-1.5 rounded-full transition-colors text-black/35 hover:text-black/60 border border-dashed border-black/20">
                show less
              </button>
            )}
          </div>
        )}
        <div className="flex gap-1">
          {ZOOM_OPTIONS.map(z => (
            <button key={z.label} onClick={() => setZoom(z.label)}
              className={`text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full transition-colors ${
                zoom === z.label ? 'bg-black text-white' : 'text-black/30 hover:text-black/50'
              }`}>{z.label}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5">
        {(annualData.length ? annualData : quarterlyData).map((d, i) => (
          <div key={d.company} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: METRIC_COLORS[i % METRIC_COLORS.length] }} />
            <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-black/40">{d.company}</span>
          </div>
        ))}
      </div>

      {clickedPoint && <DataPointPopover point={clickedPoint} onClose={() => setClickedPoint(null)} />}

      {/* Panel 1: Annual */}
      {hasAnnual && visibleAnnual.length > 0 && (
        <div className="mb-6" ref={annualRef}>
          <p className="text-[10px] text-black/40 tracking-widest uppercase font-semibold mb-2">Annual</p>
          <ValuePanel points={visibleAnnual} datasets={annualData} gradId="annGrad" onDotClick={(company, period, value, cx, cy) => handleDotClick(company, period, value, cx, cy, annualRef)} />
          {annualGrowth.length > 1 && (
            <>
              <p className="text-[10px] text-black/25 tracking-widest uppercase mt-3 mb-1">YoY Growth</p>
              <GrowthPanel points={annualGrowth} barSize={24} />
            </>
          )}
        </div>
      )}

      {/* Panel 2: Quarterly */}
      {hasQuarterly && visibleQuarterly.length > 0 && (
        <div className="mb-4" ref={quarterlyRef}>
          <p className="text-[10px] text-black/40 tracking-widest uppercase font-semibold mb-2">Quarterly</p>
          <ValuePanel points={visibleQuarterly} datasets={quarterlyData} gradId="qtrGrad" onDotClick={(company, period, value, cx, cy) => handleDotClick(company, period, value, cx, cy, quarterlyRef)} />
          {quarterlyGrowth.length > 1 && (
            <>
              <p className="text-[10px] text-black/25 tracking-widest uppercase mt-3 mb-1">QoQ Growth</p>
              <GrowthPanel points={quarterlyGrowth} barSize={10} />
            </>
          )}
        </div>
      )}

      <p className="text-[10px] text-black/20 tracking-widest uppercase mt-2">Source: SEC EDGAR 10-K & 10-Q Filings · Split-Adjusted</p>
      <p className="text-[10px] text-black/15 italic mt-1">Q4 unavailable for some years due to stock split adjustments</p>
    </div>
  );
}

export default function Home() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer]     = useState('');
  const [chartData, setChartData] = useState<ChartData | ChartData[] | null>(null);
  const [financialChart, setFinancialChart] = useState<FinancialChartPayload | null>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'summary'>('chart');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [glassReady, setGlassReady] = useState(false);

  const questionRef = useRef('');
  const loadingRef  = useRef(false);
  const glassAskRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleAsk = () => {
    const q = questionRef.current;
    if (!q.trim() || loadingRef.current) return;
    setLoading(true);
    setError('');
    loadingRef.current = true;
    setAnswer('');
    setChartData(null);
    setFinancialChart(null);
    setActiveTab('chart');
    fetch(`${API_URL}/ask?question=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setAnswer(data.answer);
          if (data.chart_data) setChartData(data.chart_data);
          if (data.financial_chart) setFinancialChart(data.financial_chart);
        }
        setLoading(false);
        loadingRef.current = false;
      })
      .catch(err => {
        console.error(err);
        setError('Server is temporarily unavailable. Please try again in a moment.');
        setLoading(false);
        loadingRef.current = false;
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAsk();
  };

  useEffect(() => {
    if (!document.querySelector('link[data-glass]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/lib/lg-glass.css';
      link.dataset.glass = '1';
      document.head.appendChild(link);
    }

    const init = async () => {
      await loadScript('/lib/lg-container.js?v=2');
      await loadScript('/lib/lg-button.js?v=2');

      const GContainer = window.LGContainer;
      const GButton    = window.LGButton;
      if (!GContainer || !GButton) {
        console.error('LGContainer or LGButton not on window after script load');
        return;
      }

      // Reset stale static state from any previous React Strict Mode run
      GContainer.pageSnapshot      = null;
      GContainer.isCapturing       = false;
      GContainer.waitingForSnapshot = [];

      window.glassControls = {
        blurRadius:    8,
        edgeIntensity: 0.9,
        rimIntensity:  1.1,
        baseIntensity: 0.35,
        edgeDistance:  0.22,
        rimDistance:   0.85,
        baseDistance:  0.45,
        cornerBoost:   0.45,
        rippleEffect:  0.35,
      };

      // Glass Ask button
      if (glassAskRef.current && !glassAskRef.current.hasChildNodes()) {
        const ask = new GButton({
          text: 'Ask →',
          size: 13,
          type: 'pill',
          onClick: () => handleAsk(),
        });
        glassAskRef.current.appendChild(ask.element);
      }

      requestAnimationFrame(() => requestAnimationFrame(() => setGlassReady(true)));
    };

    init().catch(console.error);
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>

      {/* Header */}
      <header className="px-10 pt-7 pb-5 flex items-center justify-between border-b border-black/[0.06]">
        <button onClick={() => { setQuestion(''); questionRef.current = ''; setAnswer(''); setChartData(null); setFinancialChart(null); setError(''); }}
          className="text-[11px] font-semibold tracking-[0.25em] text-black uppercase hover:text-black/60 transition-colors">
          FinSight
        </button>
        <span className="text-[11px] text-black/30 tracking-widest tabular-nums">
          {today}
        </span>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-6 pt-8 pb-10">
        <div className="w-full max-w-xl">

          {/* Headline */}
          <div className="mb-8">
            <h1 className="font-serif text-[2.2rem] font-normal italic text-black leading-tight tracking-tight mb-2.5">
              Ask the markets.
            </h1>
            <p className="text-sm text-black/40 tracking-wide">
              AI-powered financial research and analysis.
            </p>
          </div>

          {/* Input */}
          <input
            type="text"
            value={question}
            onChange={(e) => { setQuestion(e.target.value); questionRef.current = e.target.value; }}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to know?"
            className="w-full bg-transparent border-b border-slate-300 focus:border-black pb-3 pt-1 text-black/80 placeholder-slate-300 outline-none text-base tracking-wide transition-colors"
          />

          {/* Ask button row */}
          <div className="mt-5 flex items-center gap-4">
            <div ref={glassAskRef} className={glassReady ? '' : 'hidden'} />

            {!glassReady && (
              <button
                onClick={handleAsk}
                disabled={loading || !question.trim()}
                className="text-[11px] font-semibold tracking-[0.2em] uppercase text-black hover:text-black/60 disabled:text-black/25 disabled:cursor-default transition-colors"
              >
                {loading ? '···' : 'Ask →'}
              </button>
            )}

            {loading && (
              <span className="text-[11px] text-black/40 tracking-widest uppercase animate-pulse">
                Searching···
              </span>
            )}
          </div>

          {/* Example questions */}
          {!answer && !chartData && !financialChart && !loading && (
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "Show me Apple's earnings per share history",
                "Compare Apple and Microsoft stock prices over 5 years",
                "What are Tesla's key risk factors?",
                "What is Nvidia's P/E ratio?",
              ].map(q => (
                <button key={q} onClick={() => { setQuestion(q); questionRef.current = q; }}
                  className="text-[11px] text-black/35 hover:text-black/60 border border-black/10 hover:border-black/25 rounded-full px-3.5 py-1.5 transition-colors tracking-wide">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Tabbed answer panel */}
          {(answer || chartData || financialChart) && !loading && (
            <div className="mt-8 pt-8 border-t border-slate-200">

              {/* Tab bar — only shown when both chart and summary exist */}
              {(chartData || financialChart) && answer && (
                <div className="flex gap-6 mb-5 border-b border-black/8">
                  {(['chart', 'summary'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-3 text-[11px] font-semibold tracking-[0.2em] uppercase transition-colors relative ${
                        activeTab === tab
                          ? 'text-black'
                          : 'text-black/30 hover:text-black/50'
                      }`}
                    >
                      {tab === 'chart' ? 'Chart' : 'Summary'}
                      {activeTab === tab && (
                        <span className="absolute bottom-0 left-0 right-0 h-px bg-black" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Price chart tab */}
              {chartData && (!answer || activeTab === 'chart') && (
                <PriceChart data={chartData} />
              )}

              {/* Financial chart tab */}
              {financialChart && !chartData && (!answer || activeTab === 'chart') && (
                <FinancialChart data={financialChart} />
              )}

              {/* Summary tab */}
              {answer && ((!chartData && !financialChart) || activeTab === 'summary') && (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4 -mx-1">
                        <table className="w-max min-w-full text-sm border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="border-b border-black/15">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="text-left py-2 pr-8 text-[11px] font-semibold tracking-widest uppercase text-black/40 whitespace-nowrap">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="py-2.5 pr-8 text-black/70 border-b border-black/[0.06] align-top whitespace-nowrap">
                        {children}
                      </td>
                    ),
                    tr: ({ children }) => {
                      const cells = Children.toArray(children);
                      const nonEmpty = cells.filter(cell => {
                        if (!isValidElement(cell)) return false;
                        const text = String((cell as any).props?.children ?? '').trim();
                        return text.length > 0;
                      });
                      if (cells.length > 0 && nonEmpty.length < Math.ceil(cells.length * 0.5)) return null;
                      return <tr>{children}</tr>;
                    },
                    p: ({ children }) => (
                      <p className="text-sm text-black/70 leading-[1.85] tracking-wide mb-3 last:mb-0">
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-black">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="mt-3 mb-3 space-y-1.5">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-black/70 leading-relaxed tracking-wide flex gap-2">
                        <span className="text-gold mt-1 shrink-0">—</span>
                        <span>{children}</span>
                      </li>
                    ),
                    h1: ({ children }) => (
                      <h1 className="text-base font-semibold text-black mb-2 mt-4 first:mt-0">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-sm font-semibold text-black mb-2 mt-4 first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-medium text-black mb-1.5 mt-3 first:mt-0">{children}</h3>
                    ),
                  }}
                >
                  {answer.replace(/^(based on (the )?(provided |available )?context[,.]?\s*)/i, '')}
                </ReactMarkdown>
              )}
            </div>
          )}

          {error && !loading && (
            <p className="mt-8 text-sm text-red-400 tracking-wide">{error}</p>
          )}

          {loading && (
            <div className="mt-8 pt-8 border-t border-slate-200 space-y-4">
              <div className="h-1.5 bg-slate-200/80 rounded-full animate-pulse w-3/4" />
              <div className="h-1.5 bg-slate-200/80 rounded-full animate-pulse w-full" />
              <div className="h-1.5 bg-slate-200/80 rounded-full animate-pulse w-5/6" />
              <div className="h-1.5 bg-slate-200/80 rounded-full animate-pulse w-2/3" />
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="px-10 pb-8">
        <div className="max-w-xl mx-auto">
          <p className="text-[10px] text-black/25 tracking-[0.2em] uppercase">
            FinSight
          </p>
        </div>
      </footer>
    </div>
  );
}
