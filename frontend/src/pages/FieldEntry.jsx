import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, CloudOff, Pencil, RefreshCw, Save, Trash2, Wifi } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useOffline } from '../offline/OfflineProvider';
import { useToast } from '../components/toast';

const today = () => new Date().toISOString().slice(0, 10);
const LAST_STATION = 'cdims-field-station';
const RANGES = { tmax: [-20, 55, 'Maximum temperature'], tmin: [-20, 45, 'Minimum temperature'], rainfall_mm: [0, 500, 'Rainfall'], humidity: [0, 100, 'Humidity'], wind_speed: [0, 150, 'Wind speed'] };

/** Same rules the server applies, so a mistake is caught while the person is still standing at the instrument. */
function check(form) {
  if (!form.station_code) return 'Choose the station.';
  if (!form.observed_on) return 'Enter the date of the observation.';
  if (form.observed_on > today()) return 'The date cannot be in the future.';
  let count = 0;
  for (const [k, [min, max, name]] of Object.entries(RANGES)) {
    const v = form[k];
    if (v === '' || v == null) continue;
    if (Number.isNaN(Number(v)) || Number(v) < min || Number(v) > max) return `${name} must be between ${min} and ${max}.`;
    count += 1;
  }
  if (form.tmax !== '' && form.tmin !== '' && Number(form.tmin) > Number(form.tmax)) return 'Minimum temperature cannot exceed maximum temperature.';
  if (count < 2) return 'Enter at least two measurements.';
  return '';
}

const blank = (station) => ({ station_code: station, observed_on: today(), tmax: '', tmin: '', rainfall_mm: '', humidity: '', wind_speed: '' });
const val = (v, u = '') => (v === '' || v == null ? '·' : `${v}${u}`);
const when = (t) => new Date(t).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function FieldEntry() {
  const { user, offlineSession } = useAuth();
  const { online, items, pending, failed, syncing, recent, lastSync, queueReading, syncNow, discard, updateItem } = useOffline();
  const toast = useToast();
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState(blank(''));
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState({ worker: false, stations: false });

  useEffect(() => {
    api.stations().then((d) => {
      const list = d.stations.filter((s) => s.status !== 'inactive');
      setStations(list);
      let last = '';
      try { last = localStorage.getItem(LAST_STATION) || ''; } catch { /* storage unavailable */ }
      setForm((f) => (f.station_code ? f : blank(list.some((s) => s.code === last) ? last : list[0]?.code || '')));
      setReady((r) => ({ ...r, stations: true }));
    }).catch(() => {});
    setReady((r) => ({ ...r, worker: 'serviceWorker' in navigator && !!navigator.serviceWorker.controller }));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const nameOf = (code) => stations.find((s) => s.code === code)?.name || code;

  const save = async (e) => {
    e.preventDefault();
    const problem = check(form);
    if (problem) { setError(problem); return; }
    setError('');
    const payload = { ...form, origin: 'station' };
    try {
      if (editing) { await updateItem(editing, payload); toast.success('Entry updated and queued.'); setEditing(null); }
      else {
        await queueReading(payload);
        toast.success(online ? 'Saved. Sending now…' : 'Saved on this device. It will send when you are back online.');
      }
      try { localStorage.setItem(LAST_STATION, form.station_code); } catch { /* storage unavailable */ }
      setForm(blank(form.station_code));
    } catch (err) {
      setError(`Could not save on this device: ${err.message}`);
    }
  };

  const edit = (item) => { setEditing(item.id); setForm({ ...blank(''), ...item.payload }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const waiting = useMemo(() => items.filter((i) => i.status === 'pending'), [items]);
  const rejected = useMemo(() => items.filter((i) => i.status === 'failed'), [items]);

  const num = (id, label, step = '0.1', unit = '') => (
    <div className="field">
      <label htmlFor={`fe-${id}`}>{label}{unit && <span className="unit"> ({unit})</span>}</label>
      <input id={`fe-${id}`} className="input big" type="number" inputMode="decimal" step={step} value={form[id]} onChange={set(id)} />
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Field entry</h1><p>Record daily observations at the station. Entries are saved on this device first, so this works without a connection.</p></div>
      </div>

      <div className={`card sync-card ${online ? 'on' : 'off'}`}>
        <div className="sync-row">
          <span className="sync-state">{online ? <Wifi size={20} /> : <CloudOff size={20} />} <b>{online ? 'Online' : 'Offline'}</b></span>
          <span className="sync-counts">
            <span><b>{pending}</b> waiting to send</span>
            {failed > 0 && <span className="bad"><b>{failed}</b> need attention</span>}
            {lastSync && <span className="muted">Last sent {when(lastSync)}</span>}
          </span>
          <button className="btn" onClick={syncNow} disabled={!online || syncing || pending === 0}>
            <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Sending…' : 'Send now'}
          </button>
        </div>
        <div className="ready-row">
          <span className={ready.worker ? 'ok' : ''}>{ready.worker ? <CheckCircle2 size={14} /> : <Clock size={14} />} App {ready.worker ? 'ready' : 'preparing'} for offline use</span>
          <span className={ready.stations ? 'ok' : ''}>{ready.stations ? <CheckCircle2 size={14} /> : <Clock size={14} />} Station list {ready.stations ? 'saved on this device' : 'not saved yet'}</span>
          {offlineSession && <span className="warn"><AlertTriangle size={14} /> Using your saved sign-in. Entries send when you reconnect.</span>}
        </div>
        {!ready.worker && <p className="sec-text" style={{ margin: '10px 0 0' }}>To work offline later, keep this page open once while online until both items above are ticked.</p>}
      </div>

      <form className="card glow" onSubmit={save} style={{ marginTop: 16 }}>
        <h3>{editing ? 'Edit queued entry' : 'New observation'}</h3>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="two-col">
          <div className="field"><label htmlFor="fe-station">Station</label>
            <select id="fe-station" className="input big" value={form.station_code} onChange={set('station_code')} required>
              {stations.length === 0 && <option value="">No stations available</option>}
              {stations.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="fe-date">Date observed</label>
            <input id="fe-date" className="input big" type="date" max={today()} value={form.observed_on} onChange={set('observed_on')} required /></div>
        </div>
        <div className="entry-grid">
          {num('tmax', 'Max temp', '0.1', '°C')}
          {num('tmin', 'Min temp', '0.1', '°C')}
          {num('rainfall_mm', 'Rainfall', '0.1', 'mm')}
          {num('humidity', 'Humidity', '1', '%')}
          {num('wind_speed', 'Wind', '0.1', 'm/s')}
        </div>
        <div className="form-actions">
          <button className="btn lg"><Save size={18} /> {editing ? 'Save changes' : 'Save observation'}</button>
          {editing && <button type="button" className="btn ghost lg" onClick={() => { setEditing(null); setForm(blank(form.station_code)); }}>Cancel</button>}
        </div>
        <p className="sec-text" style={{ margin: '12px 0 0' }}>
          Leave a box empty if it was not measured. An empty box is stored as "no data", never as zero. Values far from the station's normal range are flagged for review.
        </p>
      </form>

      {rejected.length > 0 && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--danger)' }}>
          <h3><AlertTriangle size={16} style={{ verticalAlign: -3 }} /> Needs attention ({rejected.length})</h3>
          <p className="sec-text">The server rejected these entries. Fix them or discard them. Nothing was lost.</p>
          <ul className="queue">
            {rejected.map((i) => (
              <li key={i.id}>
                <div><b>{nameOf(i.payload.station_code)}</b> · {i.payload.observed_on}<small className="bad">{i.error}</small></div>
                <span className="q-actions">
                  <button className="icon-btn" onClick={() => edit(i)} aria-label="Fix entry"><Pencil size={16} /></button>
                  <button className="icon-btn danger" onClick={() => discard(i.id)} aria-label="Discard entry"><Trash2 size={16} /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3><Clock size={16} style={{ verticalAlign: -3 }} /> Waiting to send ({waiting.length})</h3>
        {waiting.length === 0 ? <p className="sec-text" style={{ margin: 0 }}>Nothing is waiting. Everything you saved has been sent.</p> : (
          <ul className="queue">
            {waiting.map((i) => (
              <li key={i.id}>
                <div>
                  <b>{nameOf(i.payload.station_code)}</b> · {i.payload.observed_on}
                  <small>Max {val(i.payload.tmax, '°')} · Min {val(i.payload.tmin, '°')} · Rain {val(i.payload.rainfall_mm, ' mm')} · RH {val(i.payload.humidity, '%')} · Wind {val(i.payload.wind_speed, ' m/s')}</small>
                  <small className="muted">Saved {when(i.createdAt)}</small>
                </div>
                <span className="q-actions">
                  <button className="icon-btn" onClick={() => edit(i)} aria-label="Edit entry"><Pencil size={16} /></button>
                  <button className="icon-btn danger" onClick={() => discard(i.id)} aria-label="Discard entry"><Trash2 size={16} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3><CheckCircle2 size={16} style={{ verticalAlign: -3, color: 'var(--ok)' }} /> Sent this session</h3>
          <ul className="queue">
            {recent.map((i) => (
              <li key={i.id}>
                <div><b>{nameOf(i.payload.station_code)}</b> · {i.payload.observed_on}
                  {i.flagged && <small className="warn">Flagged for review: {i.flagged}</small>}</div>
                <small className="muted">{when(i.syncedAt)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted-note" style={{ marginTop: 16 }}>Signed in as {user.full_name}. Use <Link to="/app/data">Climate data</Link> to review sent readings.</p>
    </>
  );
}
