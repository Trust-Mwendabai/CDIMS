import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardPaste, Download, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { api, isNetworkError } from '../api';
import Pager, { usePaged } from '../components/Pager';
import { useToast } from '../components/toast';

const FIELDS = [
  ['station_code', 'Station code'], ['date', 'Date'], ['tmax', 'Max temperature'], ['tmin', 'Min temperature'],
  ['rainfall_mm', 'Rainfall'], ['humidity', 'Humidity'], ['wind_speed', 'Wind speed'],
];
const ORIGINS = ['station', 'sensor', 'satellite', 'model'];
const STEPS = ['Source', 'Check', 'Done'];
const cell = (v, u = '') => (v == null ? '·' : `${v}${u}`);

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Turn the first sheet of an Excel file into CSV text so the server handles every format the same way. */
async function excelToCsv(file) {
  const { default: readXlsxFile } = await import('read-excel-file');
  const rows = await readXlsxFile(file);
  return rows.map((r) => r.map((c) => csvCell(c instanceof Date ? isoDate(c) : c)).join(',')).join('\n');
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export default function ImportWizard() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState('file'); // 'file' | 'paste'
  const [file, setFile] = useState(null);
  const [paste, setPaste] = useState('');
  const [origin, setOrigin] = useState('station');
  const [units, setUnits] = useState({ temp_unit: 'c', wind_unit: 'ms', rain_unit: 'mm' });
  const [mapping, setMapping] = useState({});
  const [blob, setBlob] = useState(null);
  const [dry, setDry] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState(null);
  const drop = useRef(null);
  const { slice: errSlice, pagerProps: errPager } = usePaged(dry?.error_rows || [], 10);

  const hasInput = source === 'file' ? !!file : paste.trim().length > 20;

  // Build the data to send (Excel is converted in the browser)
  const prepare = async () => {
    if (source === 'paste') return new Blob([paste], { type: 'text/plain' });
    if (/\.xlsx$/i.test(file.name)) return new Blob([await excelToCsv(file)], { type: 'text/csv' });
    if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files are not supported. Save the sheet as .xlsx or CSV and try again.');
    return file;
  };

  const validate = async (data, map = mapping) => {
    setBusy(true);
    setError('');
    try {
      const d = await api.importReadings(data, origin, units, { dryRun: true, mapping: map });
      setDry(d);
      setAck(false);
      return d;
    } catch (e) {
      setError(isNetworkError(e) ? 'Importing needs a connection. For observations at a station without one, use Field entry.' : e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await prepare();
      setBlob(data);
      setMapping({});
      setStep(2);
      await validate(data, {});
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  // Re-check whenever mapping, units or origin change on the check step
  useEffect(() => {
    if (step !== 2 || !blob) return undefined;
    const t = setTimeout(() => validate(blob, mapping), 250);
    return () => clearTimeout(t);
  }, [mapping, units, origin]); // eslint-disable-line react-hooks/exhaustive-deps

  const runImport = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.importReadings(blob, origin, units, { mapping });
      setResult(r);
      setStep(3);
      toast.success(`Imported ${r.saved} reading${r.saved === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setStep(1); setFile(null); setPaste(''); setBlob(null); setDry(null); setMapping({}); setResult(null); setError(''); setAck(false); };

  const columns = dry?.columns;
  const canImport = dry && !dry.needs_mapping && dry.saved > 0 && (dry.would_replace === 0 || ack) && !busy;
  const chosenFor = (h) => (mapping[h] !== undefined ? mapping[h] : (columns && FIELDS.some(([f]) => f === columns.mapped[columns.file.indexOf(h)]) ? columns.mapped[columns.file.indexOf(h)] : '_ignore'));

  const errorCsv = () => download('cdims-import-errors.csv', ['line,problem', ...(dry?.error_rows || []).map((e) => `${e.line},${csvCell(e.message)}`)].join('\n'));

  const onDrop = (e) => {
    e.preventDefault();
    drop.current?.classList.remove('over');
    const f = e.dataTransfer.files?.[0];
    if (f) { setSource('file'); setFile(f); }
  };

  const stepper = useMemo(() => STEPS.map((s, i) => (
    <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
      <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span> {s}
    </li>
  )), [step]);

  return (
    <>
      <div className="page-head">
        <div><h1>Import data</h1><p>Bring in readings from CSV, Excel or a pasted spreadsheet. Nothing is saved until you have reviewed the check.</p></div>
        <a className="btn ghost" href={api.templateUrl}><Download size={16} /> CSV template</a>
      </div>

      <ol className="stepper" aria-label="Import steps">{stepper}</ol>
      {error && <div className="alert error" role="alert">{error}</div>}

      {step === 1 && (
        <div className="card glow">
          <div className="role-tabs" role="tablist" aria-label="Where is your data?">
            <button role="tab" aria-selected={source === 'file'} className={source === 'file' ? 'on' : ''} onClick={() => setSource('file')}><FileSpreadsheet size={15} /> Upload a file</button>
            <button role="tab" aria-selected={source === 'paste'} className={source === 'paste' ? 'on' : ''} onClick={() => setSource('paste')}><ClipboardPaste size={15} /> Paste from a spreadsheet</button>
          </div>

          {source === 'file' ? (
            <label ref={drop} className="dropzone" onDragOver={(e) => { e.preventDefault(); drop.current?.classList.add('over'); }}
              onDragLeave={() => drop.current?.classList.remove('over')} onDrop={onDrop}>
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} />
              <UploadCloud size={30} />
              {file ? <><b>{file.name}</b><small>{(file.size / 1024).toFixed(1)} KB. Click to choose a different file.</small></> : <><b>Drop a file here, or click to choose</b><small>CSV, TSV or Excel (.xlsx, first sheet). Up to 5 MB.</small></>}
            </label>
          ) : (
            <div className="field">
              <label htmlFor="paste">Rows copied from your spreadsheet, including the header row</label>
              <textarea id="paste" className="input mono" rows={9} value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder={'Station\tDate\tMax Temp\tMin Temp\tRain\nLUS\t03/09/2025\t31.2\t15.4\t0'} />
            </div>
          )}

          <div className="two-col three" style={{ marginTop: 16 }}>
            <div className="field"><label htmlFor="w-origin">Where did this data come from?</label>
              <select id="w-origin" className="input" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                {ORIGINS.map((o) => <option key={o}>{o}</option>)}
              </select></div>
            <div className="field"><label htmlFor="w-t">Temperature is in</label>
              <select id="w-t" className="input" value={units.temp_unit} onChange={(e) => setUnits({ ...units, temp_unit: e.target.value })}>
                <option value="c">Celsius (°C)</option><option value="f">Fahrenheit (°F)</option><option value="k">Kelvin (K)</option></select></div>
            <div className="field"><label htmlFor="w-w">Wind speed is in</label>
              <select id="w-w" className="input" value={units.wind_unit} onChange={(e) => setUnits({ ...units, wind_unit: e.target.value })}>
                <option value="ms">Metres per second</option><option value="kmh">Kilometres per hour</option><option value="kn">Knots</option><option value="mph">Miles per hour</option></select></div>
          </div>
          <div className="field" style={{ maxWidth: 260 }}><label htmlFor="w-r">Rainfall is in</label>
            <select id="w-r" className="input" value={units.rain_unit} onChange={(e) => setUnits({ ...units, rain_unit: e.target.value })}>
              <option value="mm">Millimetres</option><option value="in">Inches</option></select></div>

          <p className="sec-text">Dates can be YYYY-MM-DD or day-first (DD/MM/YYYY). Decimal commas and markers such as NA are understood. Column names are matched automatically (for example "Max Temp", "Rain", "RH"), and you can map any others in the next step.</p>
          <button className="btn lg" onClick={check} disabled={!hasInput || busy}>{busy ? <><Loader2 size={18} className="spin" /> Reading…</> : <>Check my data <ArrowRight size={18} /></>}</button>
        </div>
      )}

      {step === 2 && (
        <>
          {busy && !dry && <div className="card empty"><span className="spinner" /> <p>Checking every row…</p></div>}

          {dry?.needs_mapping && (
            <div className="alert info">
              <b>Some columns were not recognised.</b> Tell CDIMS which of your columns holds
              {dry.missing.length ? ` the ${dry.missing.map((m) => FIELDS.find(([f]) => f === m)?.[1].toLowerCase()).join(' and ')}` : ' at least one measurement'}.
            </div>
          )}

          {columns && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Your columns</h3>
              <div className="map-grid">
                {columns.file.map((h, i) => (
                  <div key={`${h}-${i}`} className="map-row">
                    <code>{h || '(blank)'}</code><ArrowRight size={14} />
                    <select className="input compact" value={chosenFor(h)} aria-label={`Meaning of column ${h}`}
                      onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                      <option value="_ignore">Ignore this column</option>
                      {FIELDS.map(([f, label]) => <option key={f} value={f}>{label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dry && !dry.needs_mapping && (
            <>
              <div className="grid stats">
                <div className="card stat kpi hum"><div className="ico-chip"><CheckCircle2 size={18} /></div><div className="label">Ready to import</div><div className="value">{dry.saved}</div><div className="sub">{dry.would_create} new</div></div>
                <div className="card stat kpi rain"><div className="label">Will replace</div><div className="value">{dry.would_replace}</div><div className="sub">existing readings</div></div>
                <div className="card stat kpi temp"><div className="ico-chip"><AlertTriangle size={18} /></div><div className="label">Flagged as unusual</div><div className="value">{dry.flagged}</div><div className="sub">imported, marked suspect</div></div>
                <div className="card stat kpi data"><div className="label">Rejected</div><div className="value">{dry.skipped}</div><div className="sub">will be skipped</div></div>
              </div>

              <div className="card glow" style={{ marginBottom: 16 }}>
                <div className="card-head">
                  <h3>Preview</h3>
                  <small className="muted">{dry.range ? `${dry.range.from} to ${dry.range.to}` : ''}{dry.stations.length ? ` · ${dry.stations.map((s) => `${s.code} ${s.rows}`).join(', ')}` : ''}</small>
                </div>
                {dry.preview.length === 0 ? <p className="sec-text">No rows can be imported yet. Fix the problems listed below.</p> : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Line</th><th>Station</th><th>Date</th><th className="num">Max</th><th className="num">Min</th><th className="num">Rain</th><th className="num">RH</th><th className="num">Wind</th><th>Result</th></tr></thead>
                      <tbody>
                        {dry.preview.map((r) => (
                          <tr key={r.line}>
                            <td>{r.line}</td><td>{r.station}</td><td>{r.observed_on}</td>
                            <td className="num">{cell(r.tmax, '°')}</td><td className="num">{cell(r.tmin, '°')}</td>
                            <td className="num">{cell(r.rainfall_mm, ' mm')}</td><td className="num">{cell(r.humidity, '%')}</td><td className="num">{cell(r.wind_speed, ' m/s')}</td>
                            <td>
                              <span className={`badge ${r.replaces ? 'warn' : 'ok'}`}>{r.replaces ? 'replaces' : 'new'}</span>{' '}
                              {r.flag !== 'ok' && <span className="badge danger tip-qc" title={r.note || ''}>suspect</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {dry.saved > dry.preview.length && <p className="chart-note">Showing the first {dry.preview.length} of {dry.saved} rows. All {dry.saved} will be imported.</p>}
                <p className="chart-note">Values are shown after conversion to °C, m/s and mm. A dot means that value was not provided.</p>
              </div>

              {dry.error_rows.length > 0 && (
                <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--danger)' }}>
                  <div className="card-head">
                    <h3><AlertTriangle size={16} style={{ verticalAlign: -3 }} /> {dry.skipped} row{dry.skipped === 1 ? '' : 's'} will be skipped</h3>
                    <button className="btn ghost compact" onClick={errorCsv}><Download size={15} /> Error report (CSV)</button>
                  </div>
                  <ul className="queue">
                    {errSlice.map((e) => <li key={e.line}><div><b>Line {e.line}</b><small>{e.message}</small></div></li>)}
                  </ul>
                  <Pager {...errPager} label="problems" sizes={[10, 25, 50]} />
                </div>
              )}

              {dry.would_replace > 0 && (
                <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  I understand that {dry.would_replace} existing reading{dry.would_replace === 1 ? '' : 's'} for the same station and day will be replaced.</label>
              )}
            </>
          )}

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn ghost lg" onClick={() => { setStep(1); setDry(null); }}><ArrowLeft size={18} /> Back</button>
            <button className="btn lg" onClick={runImport} disabled={!canImport}>
              {busy ? <><Loader2 size={18} className="spin" /> Working…</> : <>Import {dry && !dry.needs_mapping ? dry.saved : ''} reading{dry?.saved === 1 ? '' : 's'}</>}
            </button>
            {busy && dry && <small className="muted">Re-checking…</small>}
          </div>
        </>
      )}

      {step === 3 && result && (
        <div className="card glow done-card">
          <CheckCircle2 size={44} />
          <h2>Import complete</h2>
          <p><b>{result.saved}</b> reading{result.saved === 1 ? '' : 's'} saved{result.flagged ? `, ${result.flagged} flagged for review` : ''}{result.skipped ? `, ${result.skipped} skipped` : ''}.</p>
          <div className="form-actions" style={{ justifyContent: 'center' }}>
            <Link className="btn" to="/app/data">View climate data</Link>
            <button className="btn ghost" onClick={reset}>Import another file</button>
          </div>
        </div>
      )}
    </>
  );
}
