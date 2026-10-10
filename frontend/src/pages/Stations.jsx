import { useEffect, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Pager, { usePaged } from '../components/Pager';
import { useToast } from '../components/toast';

const blank = { code: '', name: '', province: '', latitude: '', longitude: '', elevation_m: '', established_year: '', status: 'active', notes: '', instruments: '' };
const PROVINCES = ['Central', 'Copperbelt', 'Eastern', 'Luapula', 'Lusaka', 'Muchinga', 'Northern', 'North-Western', 'Southern', 'Western'];

function StationForm({ station, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(station ? {
    ...blank, ...station, elevation_m: station.elevation_m ?? '', established_year: station.established_year ?? '', notes: station.notes ?? '',
    instruments: station.instruments ?? '',
  } : blank);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (station) api.stationHistory(station.code).then((d) => setHistory(d.history)).catch(() => setHistory([]));
  }, [station]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (station) await api.updateStation({ ...form, id: station.id });
      else await api.createStation(form);
      toast.success(station ? 'Station updated.' : 'Station added.');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{station ? `Edit ${station.name}` : 'Add a station'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="two-col">
          <div className="field"><label htmlFor="s-code">Code</label>
            <input id="s-code" className="input" required maxLength={10} value={form.code} onChange={set('code')} style={{ textTransform: 'uppercase' }} /></div>
          <div className="field"><label htmlFor="s-name">Name</label>
            <input id="s-name" className="input" required maxLength={100} value={form.name} onChange={set('name')} /></div>
        </div>
        <div className="two-col">
          <div className="field"><label htmlFor="s-prov">Province</label>
            <input id="s-prov" className="input" required list="provinces" value={form.province} onChange={set('province')} />
            <datalist id="provinces">{PROVINCES.map((p) => <option key={p} value={p} />)}</datalist></div>
          <div className="field"><label htmlFor="s-status">Status</label>
            <select id="s-status" className="input" value={form.status} onChange={set('status')}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select></div>
        </div>
        <div className="two-col">
          <div className="field"><label htmlFor="s-lat">Latitude</label>
            <input id="s-lat" className="input" type="number" step="any" required min={-90} max={90} value={form.latitude} onChange={set('latitude')} /></div>
          <div className="field"><label htmlFor="s-lng">Longitude</label>
            <input id="s-lng" className="input" type="number" step="any" required min={-180} max={180} value={form.longitude} onChange={set('longitude')} /></div>
        </div>
        <div className="two-col">
          <div className="field"><label htmlFor="s-elev">Elevation (m)</label>
            <input id="s-elev" className="input" type="number" value={form.elevation_m} onChange={set('elevation_m')} /></div>
          <div className="field"><label htmlFor="s-year">Established (year)</label>
            <input id="s-year" className="input" type="number" min={1800} max={new Date().getFullYear()} value={form.established_year} onChange={set('established_year')} /></div>
        </div>
        <div className="field"><label htmlFor="s-inst">Instruments and procedures</label>
          <input id="s-inst" className="input" maxLength={255} value={form.instruments} onChange={set('instruments')}
            placeholder="e.g. Stevenson screen, rain gauge (200 mm), cup anemometer at 10 m" /></div>
        <div className="field"><label htmlFor="s-notes">Notes (exposure, relocation, site changes)</label>
          <input id="s-notes" className="input" maxLength={255} value={form.notes} onChange={set('notes')} /></div>
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : station ? 'Save changes' : 'Add station'}</button>
        {station && history && history.length > 0 && (
          <>
            <h4 className="stat-title" style={{ marginTop: 18 }}>Change history</h4>
            <ul className="history">
              {history.map((h, i) => (
                <li key={i}><b>{h.action}</b> by {h.username || 'unknown'} · {new Date(h.created_at.replace(' ', 'T')).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</li>
              ))}
            </ul>
          </>
        )}
      </form>
    </div>
  );
}

export default function Stations() {
  const { can } = useAuth();
  const [stations, setStations] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | station
  const canManage = can('manage_stations');
  const { slice, pagerProps } = usePaged(stations || [], 10);

  const load = () => api.stations().then((d) => setStations(d.stations)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stations</h1>
          <p>Observation stations in the network{stations ? ` · ${stations.filter((s) => s.status === 'active').length} active of ${stations.length}` : ''}.</p>
        </div>
        {canManage && <button className="btn" onClick={() => setEditing('new')}><Plus size={16} /> Add station</button>}
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="card glow">
        {!stations ? (
          <div className="empty"><span className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Province</th><th>Status</th><th className="num">Latitude</th>
                  <th className="num">Longitude</th><th className="num">Elevation</th><th className="num">Since</th>
                  <th className="num">Readings</th><th>Last reading</th>{canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {slice.map((s) => (
                  <tr key={s.id} title={[s.instruments, s.notes].filter(Boolean).join(' · ') || undefined}>
                    <td><span className="badge info">{s.code}</span></td>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.province}</td>
                    <td><span className={`badge ${s.status === 'active' ? 'ok' : ''}`}>{s.status}</span></td>
                    <td className="num">{Number(s.latitude).toFixed(4)}</td>
                    <td className="num">{Number(s.longitude).toFixed(4)}</td>
                    <td className="num">{s.elevation_m != null ? `${s.elevation_m} m` : '—'}</td>
                    <td className="num">{s.established_year ?? '—'}</td>
                    <td className="num">{Number(s.readings).toLocaleString()}</td>
                    <td>{s.last_reading || '—'}</td>
                    {canManage && <td><button className="icon-btn" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><Pencil size={16} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...pagerProps} label="stations" sizes={[10, 25, 50]} />
      </div>
      {editing && (
        <StationForm station={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}
