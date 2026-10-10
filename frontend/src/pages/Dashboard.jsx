import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, CalendarDays, CloudRain, Database, Download, Droplets, Flame, Thermometer, Wind } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import ActiveAlerts from '../components/ActiveAlerts';
import LiveWeather from '../components/LiveWeather';
import Na from '../components/Na';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' });
const dateLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' });
const tipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 };

function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className={`card stat kpi ${tone}`}>
      <div className="ico-chip"><Icon size={18} /></div>
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Horizontal bar scaled against the largest value in the column. */
function CellBar({ value, max, tone, text }) {
  const pct = value != null && max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <span className="cell-bar">
      <span className="track"><span className={`fill ${tone}`} style={{ width: `${pct}%` }} /></span>
      <span>{text}</span>
    </span>
  );
}

/** Legend chips with coloured dots, aligned to the top right of a chart card. */
function Legend({ items }) {
  return (
    <div className="legend">
      {items.map(({ color, label, bar }) => (
        <span className="chip" key={label}>
          <i className={bar ? 'dot bar' : 'dot'} style={{ background: color }} /> {label}
        </span>
      ))}
    </div>
  );
}

/** One tooltip for both charts: shows max, min and rainfall for the hovered month together. */
function MonthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="tip">
      <strong>{m.full}</strong>
      <div><i className="dot" style={{ background: 'var(--chart-2)' }} /> Avg max <b>{m.avg_tmax}°C</b></div>
      <div><i className="dot" style={{ background: 'var(--chart-3)' }} /> Avg min <b>{m.avg_tmin}°C</b></div>
      <div><i className="dot bar" style={{ background: 'var(--chart-1)' }} /> Rainfall <b>{m.rainfall} mm</b></div>
    </div>
  );
}

function exportMonthly(rows, name) {
  const header = 'month,avg_tmax_c,avg_tmin_c,avg_temp_c,rainfall_mm';
  const body = rows.map((r) => [r.month, r.avg_tmax, r.avg_tmin, r.avg_temp, r.rainfall].join(','));
  const url = URL.createObjectURL(new Blob([[header, ...body].join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `cdims-monthly-${name}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [station, setStation] = useState(user.preferences?.default_station ? String(user.preferences.default_station) : '');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.dashboard({ station }).then(setData).catch((e) => setError(e.message));
  }, [station]);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="splash" style={{ minHeight: 300 }}><span className="spinner" /></div>;

  const { totals, kpis, monthly, stations, alerts } = data;
  const chart = monthly.map((m) => ({
    ...m,
    label: monthLabel(m.month),
    full: new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' }),
  }));
  const scope = station ? stations.find((s) => String(s.id) === String(station))?.name : 'All stations';
  const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false };
  const margin = { top: 8, right: 8, left: -12, bottom: 0 };

  const maxTemp = Math.max(...stations.map((s) => Number(s.avg_temp) || 0));
  const maxRain = Math.max(...stations.map((s) => Number(s.rainfall) || 0));
  const rainRank = [...stations].filter((s) => s.rainfall != null).sort((a, b) => b.rainfall - a.rainfall).map((s) => s.id);

  return (
    <>
      <div className="welcome">
        <div>
          <h1>{greeting()}, {user.full_name.split(' ')[0]}</h1>
          <p>
            Here is the climate picture for Zambia
            {totals.latest ? `, based on observations up to ${dateLabel(totals.latest)} ${totals.latest.slice(0, 4)}.` : '.'}
          </p>
        </div>
        <div className="welcome-chips">
          <span className="wchip"><CalendarDays size={15} /> {new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span className="wchip"><Database size={15} /> {totals.readings.toLocaleString()} readings</span>
          {alerts.length > 0 && <span className="wchip"><AlertTriangle size={15} /> {alerts.length} alert{alerts.length > 1 ? 's' : ''}</span>}
        </div>
      </div>

      <ActiveAlerts />
      <LiveWeather stationId={station || null} />

      {totals.sample_share > 0 && (
        <div className="alert info">
          {Math.round(totals.sample_share * 100)}% of the readings are generated sample data for demonstration.
          Replace them by importing real observations from the Climate data page.
        </div>
      )}

      {!totals.latest ? (
        <div className="card empty">No climate readings have been recorded yet.</div>
      ) : (
        <>
          <div className="grid stats">
            <Stat tone="temp" icon={Thermometer} label="Avg temperature" sub="Last 30 days" value={kpis.avg_temp != null ? `${kpis.avg_temp}°C` : null} />
            <Stat tone="rain" icon={CloudRain} label="Avg rainfall per station" sub="Last 30 days" value={kpis.rainfall != null ? `${kpis.rainfall} mm` : null} />
            <Stat tone="hum" icon={Droplets} label="Avg humidity" sub="Last 30 days" value={kpis.humidity != null ? `${kpis.humidity}%` : null} />
            <Stat tone="wind" icon={Wind} label="Avg wind speed" sub="Last 30 days" value={kpis.wind != null ? `${kpis.wind} m/s` : null} />
            <Stat tone="data" icon={Database} label="Total readings" value={totals.readings.toLocaleString()} sub={`${totals.stations} stations`} />
          </div>

          <div className="grid two">
            <div className="card glow">
              <div className="card-head">
                <h3>Last 12 months · {scope}</h3>
                <div className="card-actions">
                  <select className="input compact" aria-label="Station" value={station} onChange={(e) => setStation(e.target.value)}>
                    <option value="">All stations</option>
                    {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn ghost compact" onClick={() => exportMonthly(monthly, station || 'all')} disabled={!monthly.length}>
                    <Download size={15} /> CSV
                  </button>
                </div>
              </div>

              <div className="chart-block">
                <div className="chart-title">
                  <span>Temperature</span>
                  <Legend items={[{ color: 'var(--chart-2)', label: 'Avg max (°C)' }, { color: 'var(--chart-3)', label: 'Avg min (°C)' }]} />
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={chart} syncId="months" margin={margin}>
                    <defs>
                      <linearGradient id="gMax" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gMin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" {...axis} minTickGap={16} />
                    <YAxis {...axis} unit="°" domain={['auto', 'auto']} />
                    <Tooltip content={<MonthTooltip />} cursor={{ stroke: 'var(--border)' }} />
                    <Area dataKey="avg_tmax" type="monotone" stroke="var(--chart-2)" strokeWidth={2.5} fill="url(#gMax)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Area dataKey="avg_tmin" type="monotone" stroke="var(--chart-3)" strokeWidth={2.5} fill="url(#gMin)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-block">
                <div className="chart-title">
                  <span>Rainfall</span>
                  <Legend items={[{ color: 'var(--chart-1)', label: 'Monthly total (mm)', bar: true }]} />
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chart} syncId="months" margin={margin}>
                    <defs>
                      <linearGradient id="gRain" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" {...axis} minTickGap={16} />
                    <YAxis {...axis} unit="mm" />
                    <Tooltip content={<MonthTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                    <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 3" />
                    <Bar dataKey="rainfall" fill="url(#gRain)" radius={[4, 4, 0, 0]} minPointSize={2} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="chart-note">A thin bar on the baseline means 0 mm was recorded that month.</p>
              </div>
            </div>

            <div className="card glow warm">
              <h3><AlertTriangle size={15} style={{ verticalAlign: -2 }} /> Alerts, last 7 days</h3>
              {alerts.length === 0 ? (
                <div className="empty">No extreme heat or heavy rainfall recorded.</div>
              ) : (
                <ul className="alert-list">
                  {alerts.map((a, i) => (
                    <li key={i}>
                      <span className={`pill ${a.type === 'Heat' ? 'heat' : 'rain'}`}>
                        {a.type === 'Heat' ? <Flame size={13} /> : <CloudRain size={13} />} {a.type}
                      </span>
                      <span className="alert-station">{a.station}</span>
                      <span className="alert-meta">
                        <b>{a.value}{a.type === 'Heat' ? '°C' : ' mm'}</b>
                        <small>{dateLabel(a.observed_on)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card glow">
            <h3>Stations, last 30 days</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Station</th><th>Province</th><th className="num">Avg temp</th><th className="num">Rainfall</th><th>Last reading</th></tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className={`rank ${rainRank[0] === s.id ? 'top' : ''}`} title="Rainfall rank">{rainRank.indexOf(s.id) + 1 || '–'}</span>
                        <strong>{s.name}</strong> <span className="badge">{s.code}</span>
                      </td>
                      <td>{s.province}</td>
                      <td className="num">{s.avg_temp != null ? <CellBar value={Number(s.avg_temp)} max={maxTemp} tone="warm" text={`${s.avg_temp}°C`} /> : <Na />}</td>
                      <td className="num">{s.rainfall != null ? <CellBar value={Number(s.rainfall)} max={maxRain} tone="cool" text={`${s.rainfall} mm`} /> : <Na />}</td>
                      <td>{s.last_reading ? dateLabel(s.last_reading) : <Na />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
