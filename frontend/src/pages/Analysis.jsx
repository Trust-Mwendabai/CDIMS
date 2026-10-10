import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, Sigma, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../api';

const ELEMENTS = {
  tmax: { label: 'Maximum temperature', unit: '°C' },
  tmin: { label: 'Minimum temperature', unit: '°C' },
  rainfall_mm: { label: 'Rainfall', unit: 'mm' },
  humidity: { label: 'Humidity', unit: '%' },
  wind_speed: { label: 'Wind speed', unit: 'm/s' },
};

const fmtDate = (d) => new Date(d.length === 7 ? `${d}-01T00:00:00` : `${d}T00:00:00`)
  .toLocaleDateString('en', d.length === 7 ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });

function StatCards({ stats, unit, title, alt = false }) {
  const TrendIcon = stats.trend_per_year >= 0 ? TrendingUp : TrendingDown;
  const cards = [
    { cls: 'mean', icon: Sigma, label: 'Mean', value: `${stats.mean}${unit}`, sub: `${stats.days.toLocaleString()} days${stats.total != null ? ` · total ${stats.total} mm` : ''}` },
    { cls: 'hi', icon: ArrowUp, label: 'Highest', value: `${stats.max.value}${unit}`, sub: fmtDate(stats.max.date) },
    { cls: 'lo', icon: ArrowDown, label: 'Lowest', value: `${stats.min.value}${unit}`, sub: fmtDate(stats.min.date) },
    { cls: 'trend', icon: TrendIcon, label: 'Linear trend', value: `${stats.trend_per_year > 0 ? '+' : ''}${stats.trend_per_year}${unit}`, sub: 'per year' },
  ];
  return (
    <>
      {title && <h3 className="stat-title"><span className={`swatch ${alt ? 'alt' : ''}`} /> {title}</h3>}
      <div className="grid stats four">
        {cards.map(({ cls, icon: Icon, label, value, sub }) => (
          <div key={cls} className={`card stat kpi ${cls} ${alt ? 'alt' : ''}`}>
            <div className="ico-chip"><Icon size={18} /></div>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            <div className="sub">{sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const DEFAULT_THRESHOLD = { tmax: [35, 'above'], tmin: [10, 'below'], rainfall_mm: [50, 'above'], humidity: [90, 'above'], wind_speed: [10, 'above'] };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How often does the element cross a threshold? Empirical probability with a seasonal breakdown. */
function Extremes({ filters, element, unit, label }) {
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLD[element][0]));
  const [direction, setDirection] = useState(DEFAULT_THRESHOLD[element][1]);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');

  // New element, new sensible default
  useEffect(() => {
    setThreshold(String(DEFAULT_THRESHOLD[element][0]));
    setDirection(DEFAULT_THRESHOLD[element][1]);
  }, [element]);

  useEffect(() => {
    if (threshold === '' || Number.isNaN(Number(threshold))) return undefined;
    setError('');
    const t = setTimeout(() => {
      api.extremes({ ...filters, element, threshold, direction }).then(setRes).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [filters, element, threshold, direction]);

  const months = (res?.months || []).map((m) => ({ ...m, label: MONTHS[m.month - 1] }));
  const op = direction === 'below' ? 'at or below' : 'at or above';

  return (
    <div className="card glow warm" style={{ marginTop: 16 }}>
      <h3>Extreme events: how often does {label.toLowerCase()} reach a threshold?</h3>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="x-dir">When it is</label>
          <select id="x-dir" className="input" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="above">At or above</option><option value="below">At or below</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="x-th">Threshold ({unit})</label>
          <input id="x-th" className="input" type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {res && !res.enough && <p className="sec-text">At least 30 days of data are needed for a meaningful probability. This selection has {res.total_days}.</p>}
      {res?.enough && (
        <>
          <div className="extreme-grid">
            <div><small>Probability on any day</small><b>{res.probability}%</b></div>
            <div><small>Days {op} {res.threshold}{unit}</small><b>{res.hit_days.toLocaleString()}</b><small>of {res.total_days.toLocaleString()}</small></div>
            <div><small>Typical days per year</small><b>{res.per_year}</b></div>
            <div><small>Roughly once every</small><b>{res.return_days ? `${res.return_days} days` : 'never'}</b></div>
          </div>
          <h4 className="stat-title">Probability by month</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={months} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gX" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l) => l} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Bar dataKey="probability" name="Probability" fill="url(#gX)" radius={[4, 4, 0, 0]} minPointSize={2} />
            </BarChart>
          </ResponsiveContainer>
          {res.short_record && <p className="chart-note">Based on fewer than 30 years of data, so treat these probabilities as indicative.</p>}
        </>
      )}
    </div>
  );
}

export default function Analysis() {
  const [stations, setStations] = useState([]);
  const [f, setF] = useState({ station: '', element: 'tmax', from: '', to: '' });
  const [compare, setCompare] = useState('');
  const [result, setResult] = useState(null);
  const [other, setOther] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);
  useEffect(() => {
    setError('');
    api.analysis(f).then(setResult).catch((e) => setError(e.message));
  }, [f]);
  useEffect(() => {
    if (!compare) { setOther(null); return; }
    api.analysis({ ...f, station: compare === 'all' ? '' : compare }).then(setOther).catch((e) => setError(e.message));
  }, [f, compare]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { label, unit } = ELEMENTS[f.element];
  const stats = result?.stats;
  const name = (id) => (id ? stations.find((s) => String(s.id) === String(id))?.name : 'National average');

  // Merge both series on date so they share one x-axis
  const merged = useMemo(() => {
    if (!result) return [];
    const map = new Map(result.series.map((p) => [p.date, { date: p.date, a: p.value }]));
    if (other) other.series.forEach((p) => map.set(p.date, { ...(map.get(p.date) || { date: p.date }), b: p.value }));
    return [...map.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
  }, [result, other]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analysis</h1>
          <p>Trends and extremes for any element. Leave the station empty to analyse the national average.</p>
        </div>
      </div>

      <div className="card glow filters-card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field">
            <label htmlFor="a-el">Element</label>
            <select id="a-el" className="input" value={f.element} onChange={set('element')}>
              {Object.entries(ELEMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="a-st">Station</label>
            <select id="a-st" className="input" value={f.station} onChange={set('station')}>
              <option value="">All stations (average)</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="a-cmp">Compare with</label>
            <select id="a-cmp" className="input" value={compare} onChange={(e) => setCompare(e.target.value)}>
              <option value="">None</option>
              <option value="all">National average</option>
              {stations.filter((s) => String(s.id) !== String(f.station)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="a-f">From</label><input id="a-f" className="input" type="date" value={f.from} onChange={set('from')} /></div>
          <div className="field"><label htmlFor="a-t">To</label><input id="a-t" className="input" type="date" value={f.to} onChange={set('to')} /></div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!result && !error && <div className="empty"><span className="spinner" /></div>}
      {result && !stats && <div className="card empty">Not enough data for this selection.</div>}

      {stats && (
        <>
          <StatCards stats={stats} unit={unit} title={other?.stats ? name(f.station) : null} />
          {other?.stats && <StatCards alt stats={other.stats} unit={unit} title={compare === 'all' ? 'National average' : name(compare)} />}

          <div className="card glow">
            <h3>{label}{result.granularity === 'month' ? ' · monthly average' : ' · daily'}</h3>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={merged} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="aA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="aB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} tickLine={false} minTickGap={48} tickFormatter={fmtDate} />
                <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} unit={unit} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={fmtDate} formatter={(v) => `${v}${unit}`}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                {other && <Legend />}
                <Area dataKey="a" name={name(f.station)} type="monotone" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#aA)" dot={false} connectNulls />
                {other && <Area dataKey="b" name={compare === 'all' ? 'National average' : name(compare)} type="monotone" stroke="var(--chart-2)" strokeWidth={2.5} fill="url(#aB)" dot={false} connectNulls />}
              </AreaChart>
            </ResponsiveContainer>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 0 }}>
              Trends from short records (under 30 years, per WMO guidance) are indicative only.
            </p>
          </div>
          <Extremes filters={f} element={f.element} unit={unit} label={label} />
        </>
      )}
    </>
  );
}
