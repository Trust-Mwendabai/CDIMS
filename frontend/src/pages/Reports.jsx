import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileDown, Printer, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
import Na, { Val } from '../components/Na';
import Pager, { usePaged } from '../components/Pager';
import { useToast } from '../components/toast';
import { downloadComparePdf, downloadHeatPdf, downloadQualityPdf, downloadSummaryPdf } from '../pdf';
import { MONTHS, daysIn, monthKeysOf, monthLabel, possibleDays } from '../reportUtil';

const v = (x, u = '') => <Val value={x} unit={u} />;
const monthName = monthLabel;

function download(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

/** Tiny inline chart of a monthly series: bars for rainfall, a line for temperature. Gaps stay empty. */
function Spark({ values, kind = 'line', colour, label }) {
  const W = 120;
  const H = 34;
  const nums = values.filter((x) => x != null && !Number.isNaN(Number(x))).map(Number);
  if (!nums.length) return <span className="na">No data</span>;
  const lo = kind === 'bar' ? 0 : Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const step = W / values.length;
  const y = (n) => H - 3 - ((Number(n) - lo) / span) * (H - 8);
  let d = '';
  let pen = false;
  values.forEach((n, i) => {
    if (n == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${(i * step + step / 2).toFixed(1)},${y(n).toFixed(1)} `;
    pen = true;
  });
  return (
    <svg className="rspark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {kind === 'bar'
        ? values.map((n, i) => (n == null
          ? <rect key={i} x={i * step + 1} y={H - 5} width={step - 2} height="2" rx="1" className="gap" />
          : <rect key={i} x={i * step + 1} y={y(n)} width={step - 2} height={Math.max(1.5, H - 3 - y(n))} rx="1.5" fill={colour} />))
        : (
          <>
            <path d={d} fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {values.map((n, i) => (n == null ? <circle key={i} cx={i * step + step / 2} cy={H - 4} r="1.6" className="gapdot" /> : null))}
          </>
        )}
    </svg>
  );
}

/** Days-reported cell: green when (almost) complete, amber when partial, red when nothing was reported. */
function DaysCell({ days, possible }) {
  const tone = !days ? 'bad' : days >= possible * 0.9 ? 'good' : 'part';
  return <span className={`days ${tone}`} title={`${days} of ${possible} days reported`}>{days} / {possible}</span>;
}

function Summary({ ctx }) {
  const toast = useToast();
  const [stations, setStations] = useState([]);
  const [mode, setMode] = useState('year'); // 'year' | 'range'
  const [year, setYear] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [station, setStation] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { slice, pagerProps } = usePaged(data?.stations || [], 0); // default: show every station
  const shown = printing ? data.stations : slice;

  useEffect(() => { api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);
  useEffect(() => {
    if (mode === 'range' && !(range.from && range.to)) return;
    setError('');
    const params = mode === 'range' ? { from: range.from, to: range.to, station } : { year, station };
    api.report(params).then((d) => { setData(d); if (!year) setYear(String(d.year)); }).catch((e) => { setError(e.message); setData(null); });
  }, [mode, year, range, station]);

  const scope = `${station ? stations.find((s) => String(s.id) === String(station))?.name : `All stations (${stations.length})`}`;
  const period = data ? (data.range ? `${data.range.from} to ${data.range.to}` : `year ${data.year}`) : '';
  const monthKeys = useMemo(() => (data ? monthKeysOf(data) : []), [data]);
  const possible = (k) => possibleDays(data, k);

  const exportCsv = () => {
    const rows = [['station', 'month', 'avg_tmax_c', 'avg_tmin_c', 'rainfall_mm', 'rain_days', 'hottest_c', 'coldest_c', 'days_reported']];
    // (months with no data are simply absent from the CSV; a blank is not a measured zero)
    data.stations.forEach((s) => {
      Object.entries(s.months).forEach(([m, x]) => rows.push([s.name, data.range ? m : `${data.year}-${String(m).padStart(2, '0')}`, x.tmax, x.tmin, x.rain, x.rain_days, x.hottest, x.coldest, x.days]));
      rows.push([s.name, 'total', s.year.tmax, s.year.tmin, s.year.rain, s.year.rain_days, s.year.hottest, s.year.coldest, s.year.days]);
    });
    download(`cdims-climate-summary-${data.range ? `${data.range.from}_${data.range.to}` : data.year}.csv`, rows);
  };

  const pdf = async () => {
    setPdfBusy(true);
    try {
      await downloadSummaryPdf(data, { ...ctx, scope });
      toast.success('PDF downloaded.');
    } catch (e) {
      toast.error(`Could not create the PDF: ${e.message}`);
    } finally {
      setPdfBusy(false);
    }
  };
  const print = () => { setPrinting(true); setTimeout(() => { window.print(); setPrinting(false); }, 150); };
  const ready = !!data?.stations.length;

  return (
    <>
      <div className="card filters-card glow no-print" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: '0 1 190px' }}>
            <label htmlFor="r-mode">Period</label>
            <select id="r-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="year">Calendar year</option><option value="range">Custom date range</option>
            </select>
          </div>
          {mode === 'year' ? (
            <div className="field"><label htmlFor="r-year">Year</label>
              <select id="r-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>
                {(data?.years || [Number(year) || new Date().getFullYear()]).map((y) => <option key={y}>{y}</option>)}
              </select></div>
          ) : (
            <>
              <div className="field"><label htmlFor="r-from">From</label>
                <input id="r-from" className="input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
              <div className="field"><label htmlFor="r-to">To</label>
                <input id="r-to" className="input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
            </>
          )}
          <div className="field"><label htmlFor="r-st">Station</label>
            <select id="r-st" className="input" value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="">All stations</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
        </div>
        <div className="export-bar">
          <span className="export-scope">
            <b>Exports include</b> {ready ? `all ${data.stations.length} station${data.stations.length > 1 ? 's' : ''} for ${period}` : 'the selection above'}
            {' '}({scope}), not only the page you are viewing.
          </span>
          <span className="export-btns">
            <button className="btn" onClick={pdf} disabled={!ready || pdfBusy}><FileDown size={16} /> {pdfBusy ? 'Preparing…' : 'Download PDF'}</button>
            <button className="btn ghost" onClick={exportCsv} disabled={!ready}><Download size={16} /> CSV</button>
            <button className="btn ghost" onClick={print} disabled={!ready}><Printer size={16} /> Print</button>
          </span>
        </div>
      </div>

      {mode === 'range' && !(range.from && range.to) && <div className="card empty">Choose a start and end date to build the report.</div>}
      {error && <div className="alert error">{error}</div>}
      {!data && !error && !(mode === 'range' && !(range.from && range.to)) && <div className="empty"><span className="spinner" /></div>}
      {data && data.stations.length === 0 && <div className="card empty">No readings recorded for {period}.</div>}

      {ready && data.stations.length > 1 && <div className="no-print"><Pager {...pagerProps} label="stations" sizes={[3, 5, 10, 0]} /></div>}

      {shown.map((s) => {
        const series = (key) => monthKeys.map((k) => (s.months[k] ? s.months[k][key] : null));
        return (
          <div className="card glow report-card" key={s.id}>
            <div className="card-head">
              <h3>{s.name} <span className="badge">{s.code}</span> · {period}</h3>
            </div>
            <div className="report-kpis">
              <div><small>Avg max</small><b>{v(s.year.tmax, '°C')}</b><Spark values={series('tmax')} colour="var(--chart-2)" label="Average maximum temperature by month" /></div>
              <div><small>Avg min</small><b>{v(s.year.tmin, '°C')}</b><Spark values={series('tmin')} colour="var(--chart-3)" label="Average minimum temperature by month" /></div>
              <div><small>Rainfall</small><b>{v(s.year.rain, ' mm')}</b><Spark values={series('rain')} kind="bar" colour="var(--chart-1)" label="Rainfall by month" /></div>
              <div><small>Rain days</small><b>{s.year.rain_days}</b><Spark values={series('rain_days')} kind="bar" colour="#38bdf8" label="Rain days by month" /></div>
              <div><small>Hottest</small><b>{v(s.year.hottest, '°C')}</b><Spark values={series('hottest')} colour="#ef4444" label="Hottest day by month" /></div>
              <div><small>Coldest</small><b>{v(s.year.coldest, '°C')}</b><Spark values={series('coldest')} colour="#6366f1" label="Coldest night by month" /></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Month</th><th className="num">Avg max</th><th className="num">Avg min</th><th className="num">Rainfall</th><th className="num">Rain days</th><th className="num">Days reported</th></tr>
                </thead>
                <tbody>
                  {monthKeys.map((k) => {
                    const x = s.months[k];
                    if (!x && possible(k) === null) {
                      return (
                        <tr key={k} className="future-row">
                          <td>{monthName(k)}</td>
                          <td colSpan={4}><span className="na future">Not reached yet</span></td>
                          <td className="num"><span className="muted">n/a</span></td>
                        </tr>
                      );
                    }
                    return x ? (
                      <tr key={k}>
                        <td>{monthName(k)}</td>
                        <td className="num">{v(x.tmax, '°C')}</td>
                        <td className="num">{v(x.tmin, '°C')}</td>
                        <td className="num">{v(x.rain, ' mm')}</td>
                        <td className="num">{x.rain_days}</td>
                        <td className="num"><DaysCell days={x.days} possible={possible(k) ?? x.days} /></td>
                      </tr>
                    ) : (
                      <tr key={k} className="no-data-row">
                        <td>{monthName(k)}</td>
                        <td colSpan={4}><Na label="No data reported this month" /></td>
                        <td className="num"><DaysCell days={0} possible={possible(k)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="chart-note">
              <Na label="No data" /> means nothing was reported. A value of 0 mm means rain was measured and none fell.
              Months after {data.as_of || 'the latest reading'} are not counted as missing. Days reported: <span className="days good">90%+</span> <span className="days part">incomplete</span> <span className="days bad">none</span>
            </p>
          </div>
        );
      })}
      <p className="print-only">Generated by CDIMS on {new Date().toLocaleString()}. Rain day = 1 mm or more.</p>
    </>
  );
}

function Compare({ ctx }) {
  const toast = useToast();
  const [stations, setStations] = useState([]);
  const [station, setStation] = useState('');
  const [years, setYears] = useState([]);
  const [span, setSpan] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);
  useEffect(() => {
    setError('');
    api.compare({ station, from_year: span.from, to_year: span.to }).then((d) => {
      setData(d);
      setYears(d.years);
      if (!span.from && d.years.length) setSpan({ from: String(d.years[d.years.length - 1]), to: String(d.years[0]) });
    }).catch((e) => setError(e.message));
  }, [station, span.from, span.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const scope = station ? stations.find((s) => String(s.id) === String(station))?.name : 'National average of all stations';
  const rows = (data?.rows || []).map((r) => ({ ...r, perStation: Math.round(r.readings / Math.max(1, r.stations)) }));

  const pdf = async () => {
    setBusy(true);
    try { await downloadComparePdf(data, { ...ctx, scope }); toast.success('PDF downloaded.'); } catch (e) { toast.error(`Could not create the PDF: ${e.message}`); } finally { setBusy(false); }
  };
  const csv = () => download('cdims-year-comparison.csv', [['year', 'avg_tmax_c', 'avg_tmin_c', 'rainfall_mm', 'rain_days', 'hottest_c', 'coldest_c', 'days_of_data'],
    ...rows.map((r) => [r.year, r.tmax, r.tmin, r.rain, r.rain_days, r.hottest, r.coldest, r.perStation])]);

  return (
    <>
      <div className="card filters-card glow no-print" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field"><label htmlFor="c-st">Station</label>
            <select id="c-st" className="input" value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="">National average</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="c-from">From year</label>
            <select id="c-from" className="input" value={span.from} onChange={(e) => setSpan({ ...span, from: e.target.value, to: Math.max(Number(e.target.value), Number(span.to)).toString() })}>
              {[...years].reverse().map((y) => <option key={y}>{y}</option>)}
            </select></div>
          <div className="field"><label htmlFor="c-to">To year</label>
            <select id="c-to" className="input" value={span.to} onChange={(e) => setSpan({ ...span, to: e.target.value, from: Math.min(Number(e.target.value), Number(span.from)).toString() })}>
              {[...years].reverse().map((y) => <option key={y}>{y}</option>)}
            </select></div>
        </div>
        <div className="export-bar">
          <span className="export-scope"><b>Exports include</b> every year shown below for {scope}.</span>
          <span className="export-btns">
            <button className="btn" onClick={pdf} disabled={!rows.length || busy}><FileDown size={16} /> {busy ? 'Preparing…' : 'Download PDF'}</button>
            <button className="btn ghost" onClick={csv} disabled={!rows.length}><Download size={16} /> CSV</button>
          </span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!data && !error && <div className="empty"><span className="spinner" /></div>}
      {data && rows.length === 0 && <div className="card empty">No readings in these years.</div>}

      {rows.length > 0 && (
        <>
          <div className="card glow" style={{ marginBottom: 16 }}>
            <h3>Rainfall and temperature by year · {scope}</h3>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--muted)" fontSize={12} tickLine={false} />
                <YAxis yAxisId="r" stroke="var(--muted)" fontSize={12} tickLine={false} unit="mm" />
                <YAxis yAxisId="t" orientation="right" stroke="var(--muted)" fontSize={12} tickLine={false} unit="°" domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
                <Bar yAxisId="r" dataKey="rain" name="Rainfall (mm)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="t" dataKey="tmax" name="Avg max (°C)" stroke="var(--chart-2)" strokeWidth={2.5} dot />
                <Line yAxisId="t" dataKey="tmin" name="Avg min (°C)" stroke="var(--chart-3)" strokeWidth={2.5} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="card glow">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Year</th><th className="num">Avg max</th><th className="num">Avg min</th><th className="num">Rainfall</th><th className="num">Rain days</th><th className="num">Hottest</th><th className="num">Coldest</th><th className="num">Days of data</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.year}>
                      <td><strong>{r.year}</strong></td>
                      <td className="num">{v(r.tmax, '°C')}</td><td className="num">{v(r.tmin, '°C')}</td>
                      <td className="num">{v(r.rain, ' mm')}</td><td className="num">{r.rain_days}</td>
                      <td className="num">{v(r.hottest, '°C')}</td><td className="num">{v(r.coldest, '°C')}</td>
                      <td className="num"><span className={`days ${r.perStation >= 300 ? 'good' : 'part'}`} title="Days with data per station">{r.perStation} / {daysIn(r.year, 2) === 29 ? 366 : 365}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="chart-note">Years with an amber days count are incomplete, so their totals are not directly comparable with full years.</p>
          </div>
        </>
      )}
    </>
  );
}

const HEAT = {
  tmax: { label: 'Average maximum temperature', unit: '°C', from: [253, 230, 138], to: [239, 68, 68], key: 'tmax' },
  tmin: { label: 'Average minimum temperature', unit: '°C', from: [186, 230, 253], to: [37, 99, 235], key: 'tmin' },
  rain: { label: 'Rainfall total', unit: 'mm', from: [224, 242, 254], to: [30, 64, 175], key: 'rain' },
};
const mix = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;

/** Station by month matrix for one year, coloured by value (regional heatmap). */
function Heatmap({ ctx }) {
  const toast = useToast();
  const [year, setYear] = useState('');
  const [metric, setMetric] = useState('tmax');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const h = HEAT[metric];

  useEffect(() => {
    setError('');
    api.report({ year }).then((d) => { setData(d); if (!year) setYear(String(d.year)); }).catch((e) => setError(e.message));
  }, [year]);

  const vals = (data?.stations || []).flatMap((s) => Object.values(s.months).map((m) => Number(m[h.key]))).filter((x) => !Number.isNaN(x));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const colour = (x) => mix(h.from, h.to, hi === lo ? 0.5 : (x - lo) / (hi - lo));

  const pdf = async () => {
    setBusy(true);
    try { await downloadHeatPdf(data, h, { ...ctx, scope: `All stations (${data.stations.length})` }); toast.success('PDF downloaded.'); } catch (e) { toast.error(`Could not create the PDF: ${e.message}`); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card filters-card glow no-print" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field"><label htmlFor="h-year">Year</label>
            <select id="h-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              {(data?.years || [Number(year) || new Date().getFullYear()]).map((y) => <option key={y}>{y}</option>)}
            </select></div>
          <div className="field"><label htmlFor="h-metric">Show</label>
            <select id="h-metric" className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {Object.entries(HEAT).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            </select></div>
        </div>
        <div className="export-bar">
          <span className="export-scope"><b>Exports include</b> every station for {year || 'the selected year'}, using the element shown.</span>
          <span className="export-btns"><button className="btn" onClick={pdf} disabled={!data?.stations.length || busy}><FileDown size={16} /> {busy ? 'Preparing…' : 'Download PDF'}</button></span>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!data && !error && <div className="empty"><span className="spinner" /></div>}
      {data && data.stations.length === 0 && <div className="card empty">No readings recorded for {data.year}.</div>}
      {data && data.stations.length > 0 && (
        <div className="card glow">
          <h3>{h.label} by station and month, {data.year}</h3>
          <div className="heat" role="table" aria-label={`${h.label} by station and month`}>
            <div className="heat-row" role="row">
              <span />
              {MONTHS.map((m) => <span key={m} className="heat-head" role="columnheader">{m}</span>)}
            </div>
            {data.stations.map((s) => (
              <div className="heat-row" role="row" key={s.id}>
                <span className="heat-name" role="rowheader">{s.name}</span>
                {MONTHS.map((m, i) => {
                  const x = s.months[i + 1];
                  const val = x ? Number(x[h.key]) : null;
                  return val == null || Number.isNaN(val)
                    ? <span key={m} className="heat-cell empty" role="cell" title={`${s.name}, ${m}: no data`}>no data</span>
                    : <span key={m} className="heat-cell" role="cell" style={{ background: colour(val) }} title={`${s.name}, ${m}: ${val}${h.unit}`}>{Math.round(val)}</span>;
                })}
              </div>
            ))}
          </div>
          <div className="map-legend">
            <span>{Math.round(lo)}{h.unit}</span>
            <i style={{ background: `linear-gradient(90deg, ${mix(h.from, h.to, 0)}, ${mix(h.from, h.to, 1)})` }} />
            <span>{Math.round(hi)}{h.unit}</span>
            <span className="legend-grey"><i className="grey" /> no data</span>
          </div>
        </div>
      )}
    </>
  );
}

/** Tools for the person maintaining the record: anomaly scan and short-gap estimation. */
function QualityTools({ stations, canWrite, onChanged }) {
  const toast = useToast();
  const [station, setStation] = useState('');
  const [gaps, setGaps] = useState(null);
  const [maxGap, setMaxGap] = useState(3);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setGaps(null);
    if (station) api.gaps({ station, days: 365 }).then(setGaps).catch((e) => toast.error(e.message));
  }, [station]); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async () => {
    setBusy('scan');
    try {
      const r = await api.scanQuality();
      toast.success(r.flagged ? `${r.flagged} reading(s) flagged as suspect.` : 'No new outliers found.');
      onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const estimate = async () => {
    setBusy('est');
    try {
      const r = await api.estimateGaps(station, maxGap);
      toast.success(`${r.filled} day(s) estimated${r.skipped_long_gaps ? `, ${r.skipped_long_gaps} longer gap(s) left` : ''}${r.skipped_flagged_neighbours ? `, ${r.skipped_flagged_neighbours} skipped next to flagged data` : ''}.`);
      setGaps(await api.gaps({ station, days: 365 }));
      onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="card glow" style={{ marginBottom: 16 }}>
      <h3>Quality tools</h3>
      <p className="sec-text">
        Readings more than 4 standard deviations from a station's usual value for the month are flagged <b>suspect</b> automatically
        on entry and import. Missing days are listed below. Short gaps can be estimated, but rainfall is never estimated.
      </p>
      <div className="qc-actions">
        {canWrite && <button className="btn ghost" onClick={scan} disabled={busy === 'scan'}>{busy === 'scan' ? 'Scanning…' : 'Scan archive for outliers'}</button>}
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label htmlFor="qt-st">Find missing days for</label>
          <select id="qt-st" className="input" value={station} onChange={(e) => setStation(e.target.value)}>
            <option value="">Choose a station</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {gaps && (
        gaps.runs.length === 0
          ? <p className="sec-text" style={{ marginTop: 12 }}>No missing days in the last 12 months of this station's record.</p>
          : (
            <>
              <ul className="gap-list">
                {gaps.runs.slice(0, 12).map((r) => (
                  <li key={r.from}><span>{r.from}{r.length > 1 ? ` to ${r.to}` : ''}</span><b>{r.length} day{r.length > 1 ? 's' : ''}</b></li>
                ))}
                {gaps.runs.length > 12 && <li className="muted">and {gaps.runs.length - 12} more gaps</li>}
              </ul>
              <p className="sec-text" style={{ marginTop: 10 }}>{gaps.missing} missing day(s) in the last {gaps.span} days.</p>
              {canWrite && (
                <div className="qc-actions">
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="qt-gap">Estimate gaps up to</label>
                    <select id="qt-gap" className="input" value={maxGap} onChange={(e) => setMaxGap(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  <button className="btn" onClick={estimate} disabled={busy === 'est'}>{busy === 'est' ? 'Estimating…' : 'Estimate short gaps'}</button>
                </div>
              )}
            </>
          )
      )}
    </div>
  );
}

function Quality({ ctx }) {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [stations, setStations] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.quality().then(setQ).catch((e) => setError(e.message));
  useEffect(() => { load(); api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!q) return <div className="empty"><span className="spinner" /></div>;
  if (!q.totals) return <div className="card empty">No data to assess yet.</div>;

  const t = q.totals;
  const avg = Math.round(q.stations.reduce((a, s) => a + s.completeness, 0) / (q.stations.length || 1));
  const pdf = async () => {
    setBusy(true);
    try { await downloadQualityPdf(q, { ...ctx, scope: `All stations (${q.stations.length})` }); toast.success('PDF downloaded.'); } catch (e) { toast.error(`Could not create the PDF: ${e.message}`); } finally { setBusy(false); }
  };

  return (
    <>
      <QualityTools stations={stations} canWrite={can('write_readings')} onChanged={load} />
      <div className="grid stats">
        <div className="card stat kpi hum"><div className="ico-chip"><CheckCircle2 size={18} /></div><div className="label">Average completeness</div><div className="value">{avg}%</div><div className="sub">Last 30 days</div></div>
        <div className="card stat kpi data"><div className="ico-chip"><AlertTriangle size={18} /></div><div className="label">Flagged readings</div><div className="value">{Number(t.flagged).toLocaleString()}</div><div className="sub">Suspect or estimated</div></div>
        <div className="card stat kpi wind"><div className="ico-chip"><Trash2 size={18} /></div><div className="label">Retained deletions</div><div className="value">{Number(t.deleted).toLocaleString()}</div><div className="sub">Kept for audit, hidden from views</div></div>
        <div className="card stat kpi rain"><div className="label">Sample data</div><div className="value">{Number(t.sample).toLocaleString()}</div><div className="sub">of {Number(t.readings).toLocaleString()} readings</div></div>
      </div>

      <div className="card glow">
        <div className="card-head">
          <h3>Completeness by station, last 30 days</h3>
          <div className="card-actions"><button className="btn ghost compact" onClick={pdf} disabled={busy}><FileDown size={15} /> {busy ? 'Preparing…' : 'Download PDF'}</button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Station</th><th>Status</th><th>Completeness</th><th className="num">Days reported</th><th className="num">Flagged</th><th>Last reading</th></tr></thead>
            <tbody>
              {q.stations.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong> <span className="badge">{s.code}</span></td>
                  <td><span className={`badge ${s.status === 'active' ? 'ok' : ''}`}>{s.status}</span></td>
                  <td>
                    <span className="cell-bar" style={{ justifyContent: 'flex-start' }}>
                      <span className="track" style={{ minWidth: 120 }}><span className={`fill ${s.completeness >= 90 ? 'good' : s.completeness >= 60 ? 'warm' : 'bad'}`} style={{ width: `${Math.max(3, s.completeness)}%` }} /></span>
                      <b>{s.completeness}%</b>
                    </span>
                  </td>
                  <td className="num"><DaysCell days={Number(s.days_reported)} possible={30} /></td>
                  <td className="num">{Number(s.flagged)}</td>
                  <td>{s.last_reading || <Na />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.origins?.length > 0 && (
          <p className="origins">Data origin: {q.origins.map((o) => `${o.origin} ${Number(o.n).toLocaleString()}`).join(' · ')}</p>
        )}
      </div>
    </>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState('summary');
  const [sampleShare, setSampleShare] = useState(0);
  useEffect(() => {
    api.quality().then((q) => { if (q.totals) setSampleShare(Number(q.totals.sample) / Math.max(1, Number(q.totals.readings))); }).catch(() => {});
  }, []);
  const ctx = { user: user.full_name, sampleShare };

  return (
    <>
      <div className="page-head no-print">
        <div><h1>Reports</h1><p>Climate summaries to download or print, and indicators of data quality.</p></div>
      </div>
      <div className="role-tabs no-print" role="tablist">
        {[['summary', 'Climate summary'], ['compare', 'Year comparison'], ['heat', 'Heatmap'], ['quality', 'Data quality']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'summary' && <Summary ctx={ctx} />}
      {tab === 'compare' && <Compare ctx={ctx} />}
      {tab === 'heat' && <Heatmap ctx={ctx} />}
      {tab === 'quality' && <Quality ctx={ctx} />}
    </>
  );
}
