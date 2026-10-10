import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { api, isNetworkError } from '../api';
import { useOffline } from '../offline/OfflineProvider';
import { useAuth } from '../auth';
import Confirm from '../components/Confirm';
import { Val } from '../components/Na';
import Pager from '../components/Pager';
import { useToast } from '../components/toast';

const today = () => new Date().toISOString().slice(0, 10);
const blank = { station_code: '', observed_on: today(), tmax: '', tmin: '', rainfall_mm: '', humidity: '', wind_speed: '', origin: 'station', quality_flag: 'ok' };
const cell = (v, unit = '') => <Val value={v} unit={unit} />;
const ORIGINS = ['station', 'sensor', 'satellite', 'model'];
const FLAGS = ['ok', 'suspect', 'estimated'];
const flagTone = { ok: 'ok', suspect: 'danger', estimated: 'warn' };

/** Add a reading, or edit an existing one (station and date are fixed when editing). */
function ReadingForm({ stations, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(editing
    ? { ...blank, ...editing, station_code: editing.station_code }
    : { ...blank, station_code: stations[0]?.code || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { queueReading } = useOffline();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = editing ? await api.updateReading({ ...form, id: editing.id }) : await api.addReading(form);
      toast.success(editing ? 'Reading updated.' : d.flagged ? `Reading saved and flagged: ${d.flagged}` : 'Reading saved.');
      onSaved();
    } catch (err) {
      if (isNetworkError(err) && !editing) {
        // No connection: keep the reading on this device and send it automatically later
        await queueReading(form);
        toast.info('No connection. Saved on this device and will be sent automatically.');
        onSaved();
        return;
      }
      setError(isNetworkError(err) ? 'Editing needs a connection. Try again when you are online.' : err.message);
      setBusy(false);
    }
  };

  const num = (id, label, step = '0.1') => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type="number" step={step} value={form[id] ?? ''} onChange={set(id)} />
    </div>
  );

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{editing ? 'Edit reading' : 'Add a reading'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="station_code">Station</label>
            <select id="station_code" className="input" value={form.station_code} onChange={set('station_code')} required disabled={!!editing}>
              {stations.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="observed_on">Date</label>
            <input id="observed_on" className="input" type="date" max={today()} value={form.observed_on} onChange={set('observed_on')} required disabled={!!editing} />
          </div>
          {num('tmax', 'Max temp (°C)')}
          {num('tmin', 'Min temp (°C)')}
          {num('rainfall_mm', 'Rainfall (mm)')}
          {num('humidity', 'Humidity (%)', '1')}
          {num('wind_speed', 'Wind (m/s)')}
          <div className="field">
            <label htmlFor="origin">Data origin</label>
            <select id="origin" className="input" value={form.origin} onChange={set('origin')}>
              {ORIGINS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="quality_flag">Quality flag</label>
            <select id="quality_flag" className="input" value={form.quality_flag} onChange={set('quality_flag')}>
              {FLAGS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          {editing ? 'Changes are recorded in the audit log.' : 'Saving a reading for a station and date that already exists replaces it.'}
        </p>
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save reading'}</button>
      </form>
    </div>
  );
}

export default function Data() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can('write_readings');
  const [stations, setStations] = useState([]);
  const [filters, setFilters] = useState({ station: '', from: '', to: '', origin: '', flag: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // null | 'new' | row
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.readings({ ...filters, page, per: pageSize }).then(setResult).catch((e) => setError(e.message));
  }, [filters, page, pageSize]);

  useEffect(() => { api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);
  useEffect(load, [load]);

  const setFilter = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.deleteReading(removing.id);
      toast.success('Reading deleted. It is retained for audit.');
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Climate data</h1>
          <p>Browse, filter, add and import daily station observations.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a className="btn ghost" href={api.exportUrl(filters)}><Download size={16} /> Export CSV</a>
          {canEdit && (
            <>
              <Link className="btn ghost" to="/app/import"><Upload size={16} /> Import data</Link>
              <button className="btn" onClick={() => setForm('new')}><Plus size={16} /> Add reading</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card glow">
        <div className="toolbar">
          <div className="field">
            <label htmlFor="f-station">Station</label>
            <select id="f-station" className="input" value={filters.station} onChange={setFilter('station')}>
              <option value="">All stations</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-from">From</label>
            <input id="f-from" className="input" type="date" value={filters.from} onChange={setFilter('from')} />
          </div>
          <div className="field">
            <label htmlFor="f-to">To</label>
            <input id="f-to" className="input" type="date" value={filters.to} onChange={setFilter('to')} />
          </div>
          <div className="field">
            <label htmlFor="f-origin">Origin</label>
            <select id="f-origin" className="input" value={filters.origin} onChange={setFilter('origin')}>
              <option value="">Any</option>{ORIGINS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-flag">Quality</label>
            <select id="f-flag" className="input" value={filters.flag} onChange={setFilter('flag')}>
              <option value="">Any</option>{FLAGS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {!result ? (
          <div className="empty"><span className="spinner" /></div>
        ) : result.rows.length === 0 ? (
          <div className="empty">No readings match these filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Station</th><th className="num">Max</th><th className="num">Min</th>
                  <th className="num">Rain</th><th className="num">Humidity</th><th className="num">Wind</th>
                  <th>Origin</th><th>Quality</th><th>Source</th>{canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.observed_on}</td>
                    <td>{r.station}</td>
                    <td className="num">{cell(r.tmax, '°C')}</td>
                    <td className="num">{cell(r.tmin, '°C')}</td>
                    <td className="num">{cell(r.rainfall_mm, ' mm')}</td>
                    <td className="num">{cell(r.humidity, '%')}</td>
                    <td className="num">{cell(r.wind_speed, ' m/s')}</td>
                    <td>{r.origin}</td>
                    <td><span className={`badge ${flagTone[r.quality_flag]} ${r.qc_note ? 'tip-qc' : ''}`} title={r.qc_note || undefined}>{r.quality_flag}</span></td>
                    <td><span className={`badge ${r.source === 'sample' ? 'warn' : r.source === 'import' ? 'info' : 'ok'}`}>{r.source}</span></td>
                    {canEdit && (
                      <td className="row-actions">
                        <button className="icon-btn" onClick={() => setForm(r)} aria-label="Edit reading"><Pencil size={16} /></button>
                        <button className="icon-btn danger" onClick={() => setRemoving(r)} aria-label="Delete reading"><Trash2 size={16} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && (
          <Pager total={result.total} page={page} pageSize={pageSize} label="readings" sizes={[10, 25, 50, 100]}
            onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        )}
      </div>

      {form && (
        <ReadingForm stations={stations} editing={form === 'new' ? null : form} onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }} />
      )}
      {removing && (
        <Confirm title="Delete this reading?" confirmLabel="Delete" danger busy={busy} onConfirm={confirmDelete} onCancel={() => setRemoving(null)}>
          {removing.station} on {removing.observed_on} will be hidden from the dashboard, analysis and exports. The record is kept in the
          database and the deletion is logged.
        </Confirm>
      )}
    </>
  );
}
