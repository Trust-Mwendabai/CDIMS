import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, ExternalLink, FilePlus2, Loader2, Megaphone, Pencil, Radar, Save, Send, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { AlertCard, SeverityBadge, fmtWhen } from '../components/alerts';
import Confirm from '../components/Confirm';
import Na from '../components/Na';
import Pager, { usePaged } from '../components/Pager';
import { useToast } from '../components/toast';

const HAZARDS = { heat: 'Extreme heat', cold: 'Cold / frost', heavy_rain: 'Heavy rainfall', flood: 'Flood risk', drought: 'Drought', dry_spell: 'Dry spell', strong_wind: 'Strong winds', other: 'Other hazard' };
const toLocal = (d) => (d ? d.replace(' ', 'T').slice(0, 16) : '');          // "2026-10-10 03:00:00" -> datetime-local value
const fromLocal = (v) => (v ? `${v.replace('T', ' ')}:00` : '');
const nowLocal = (hoursAhead = 0) => { const d = new Date(Date.now() + hoursAhead * 3600000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3 style={{ margin: 0 }}>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function AlertEditor({ alert, stations, onClose, onSaved }) {
  const toast = useToast();
  const creating = !alert;
  const [f, setF] = useState(alert ? {
    hazard: alert.hazard, severity: alert.severity, title: alert.title, message: alert.message, advice: alert.advice || '',
    areas: alert.areas.map((a) => a.code), starts_at: toLocal(alert.starts_at), expires_at: toLocal(alert.expires_at),
  } : { hazard: 'heavy_rain', severity: 'watch', title: '', message: '', advice: '', areas: [], starts_at: nowLocal(0), expires_at: nowLocal(48) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (code) => setF({ ...f, areas: f.areas.includes(code) ? f.areas.filter((c) => c !== code) : [...f.areas, code] });
  const provinces = useMemo(() => [...new Set(stations.map((s) => s.province))].sort(), [stations]);
  const toggleProvince = (p) => {
    const codes = stations.filter((s) => s.province === p).map((s) => s.code);
    const all = codes.every((c) => f.areas.includes(c));
    setF({ ...f, areas: all ? f.areas.filter((c) => !codes.includes(c)) : [...new Set([...f.areas, ...codes])] });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { ...f, starts_at: fromLocal(f.starts_at), expires_at: fromLocal(f.expires_at) };
      if (creating) await api.createAlert(payload); else await api.updateAlert({ ...payload, id: alert.id });
      toast.success(creating ? 'Draft alert created. Review it, then publish.' : 'Alert saved.');
      onSaved();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title={creating ? 'New alert' : `Review alert${alert.status === 'draft' ? ' (draft)' : ''}`} onClose={onClose} wide>
      <form onSubmit={save}>
        {error && <div className="alert error">{error}</div>}
        {alert?.origin === 'auto' && <div className="alert info">Prepared automatically from the rules. Check the facts below, adjust the wording, then publish.</div>}
        <div className="two-col">
          <div className="field"><label htmlFor="al-h">Hazard</label>
            <select id="al-h" className="input" value={f.hazard} onChange={set('hazard')}>{Object.entries(HAZARDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="al-s">Level</label>
            <select id="al-s" className="input" value={f.severity} onChange={set('severity')}>
              <option value="advisory">Advisory (be aware)</option><option value="watch">Watch (be prepared)</option><option value="warning">Warning (take action)</option></select></div>
        </div>
        <div className="field"><label htmlFor="al-t">Headline</label><input id="al-t" className="input" required maxLength={200} value={f.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor="al-m">What is happening</label><textarea id="al-m" className="input" rows={6} required value={f.message} onChange={set('message')} /></div>
        <div className="field"><label htmlFor="al-a">What people should do</label><textarea id="al-a" className="input" rows={3} value={f.advice} onChange={set('advice')} /></div>
        <div className="two-col">
          <div className="field"><label htmlFor="al-from">Starts</label><input id="al-from" className="input" type="datetime-local" required value={f.starts_at} onChange={set('starts_at')} /></div>
          <div className="field"><label htmlFor="al-to">Expires</label><input id="al-to" className="input" type="datetime-local" required value={f.expires_at} onChange={set('expires_at')} /></div>
        </div>
        <fieldset className="pref">
          <legend>Areas affected ({f.areas.length} selected)</legend>
          <div className="chips-row">{provinces.map((p) => <button key={p} type="button" className="chip-btn" onClick={() => toggleProvince(p)}>{p}</button>)}</div>
          <div className="area-grid">{stations.map((s) => (
            <label key={s.code} className={f.areas.includes(s.code) ? 'on' : ''}><input type="checkbox" checked={f.areas.includes(s.code)} onChange={() => toggle(s.code)} /> {s.name}</label>
          ))}</div>
        </fieldset>
        {alert?.evidence?.length > 0 && (
          <details className="evidence"><summary>Evidence the rules used ({alert.evidence.length})</summary>
            <ul>{alert.evidence.map((e, i) => <li key={i}><b>{e.name}</b>: {e.detail} <small className="muted">({e.basis}, {e.date})</small></li>)}</ul></details>
        )}
        <div className="form-actions"><button className="btn" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : creating ? 'Create draft' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}

function AlertsTab({ stations }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('review');
  const [editing, setEditing] = useState(null); // null | 'new' | alert
  const [confirm, setConfirm] = useState(null); // { kind, alert }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => api.alertsAdmin().then((d) => setItems(d.alerts)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (items || []).filter((a) => (filter === 'review' ? a.status === 'draft' : filter === 'active' ? a.active : filter === 'ended' ? a.status === 'cancelled' || a.expired : true)), [items, filter]);
  const { slice, pagerProps } = usePaged(shown, 10);
  const counts = useMemo(() => ({ review: (items || []).filter((a) => a.status === 'draft').length, active: (items || []).filter((a) => a.active).length }), [items]);

  const check = async () => {
    setChecking(true);
    try {
      const r = await api.checkRules();
      toast.success(r.created.length ? `${r.created.length} new draft alert${r.created.length > 1 ? 's' : ''} prepared for review.` : r.notes[0] || 'Checked. Nothing new to report.');
      if (r.notes.length && r.created.length) toast.info(r.notes[0]);
      setFilter('review');
      await load();
    } catch (e) { toast.error(e.message); } finally { setChecking(false); }
  };

  const act = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'publish') { await api.publishAlert(confirm.alert.id); toast.success('Published. It is now visible to the public.'); }
      if (confirm.kind === 'cancel') { await api.cancelAlert(confirm.alert.id, reason); toast.success('Alert cancelled.'); }
      if (confirm.kind === 'delete') { await api.deleteAlert(confirm.alert.id); toast.success('Draft deleted.'); }
      setConfirm(null); setReason('');
      await load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card glow" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3 style={{ margin: 0 }}>Alerts</h3>
            <small className="muted">The system checks observations and the forecast against the rules and prepares drafts. Nothing is public until you publish it.</small>
          </div>
          <div className="card-actions">
            <button className="btn ghost" onClick={check} disabled={checking}>{checking ? <Loader2 size={16} className="spin" /> : <Radar size={16} />} Check conditions now</button>
            <button className="btn" onClick={() => setEditing('new')}><FilePlus2 size={16} /> New alert</button>
          </div>
        </div>
        <div className="role-tabs" role="tablist" style={{ marginTop: 12, marginBottom: 0 }}>
          {[['review', `Needs review (${counts.review})`], ['active', `In force (${counts.active})`], ['ended', 'Ended or cancelled'], ['all', 'All']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!items ? <div className="empty"><span className="spinner" /></div> : shown.length === 0 ? (
        <div className="card empty">{filter === 'review' ? 'No drafts need review. Use "Check conditions now" to look for hazards.' : 'Nothing here.'}</div>
      ) : (
        <div className="stack">
          {slice.map((a) => (
            <div key={a.id} className="card alert-admin">
              <AlertCard alert={a} compact />
              <div className="aa-meta">
                <span className={`badge ${a.status === 'published' ? 'ok' : a.status === 'cancelled' ? 'danger' : 'warn'}`}>{a.status === 'draft' ? 'Draft' : a.status}</span>
                <span className="badge">{a.origin === 'auto' ? 'Prepared by rules' : 'Written by staff'}</span>
                <span className="badge">{a.basis === 'forecast' ? 'Forecast' : a.basis === 'observed' ? 'Observed' : 'Manual'}</span>
                <small className="muted">{fmtWhen(a.starts_at)} to {fmtWhen(a.expires_at)}</small>
              </div>
              <div className="aa-actions">
                <button className="btn ghost compact" onClick={() => setEditing(a)}><Pencil size={14} /> {a.status === 'draft' ? 'Review and edit' : 'Edit'}</button>
                {a.status === 'draft' && <button className="btn compact" onClick={() => setConfirm({ kind: 'publish', alert: a })}><Send size={14} /> Publish</button>}
                {a.status === 'published' && <Link className="btn ghost compact" to={`/alerts/${a.id}`} target="_blank"><ExternalLink size={14} /> Public page</Link>}
                {a.status === 'published' && <button className="btn ghost compact danger-text" onClick={() => setConfirm({ kind: 'cancel', alert: a })}><Ban size={14} /> Cancel</button>}
                {a.status === 'draft' && <button className="icon-btn danger" onClick={() => setConfirm({ kind: 'delete', alert: a })} aria-label="Delete draft"><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
          <Pager {...pagerProps} label="alerts" sizes={[10, 25, 50]} />
        </div>
      )}

      {editing && <AlertEditor alert={editing === 'new' ? null : editing} stations={stations} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {confirm?.kind === 'publish' && (
        <Confirm title="Publish this alert?" confirmLabel="Publish to the public" busy={busy} onConfirm={act} onCancel={() => setConfirm(null)}>
          <b>{confirm.alert.title}</b> will appear on the public bulletins page, in the RSS feed and as a CAP alert straight away. Check the wording and the areas first.
        </Confirm>
      )}
      {confirm?.kind === 'delete' && (
        <Confirm title="Delete this draft?" confirmLabel="Delete" danger busy={busy} onConfirm={act} onCancel={() => setConfirm(null)}>The draft will be removed. It was never public.</Confirm>
      )}
      {confirm?.kind === 'cancel' && (
        <Modal title="Cancel this alert" onClose={() => setConfirm(null)}>
          <p style={{ marginTop: 0, color: 'var(--muted-strong)', fontSize: 14 }}>Cancelling tells the public the alert no longer applies. The reason is shown on the alert page and in the CAP message.</p>
          <div className="field"><label htmlFor="cr">Reason</label><input id="cr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Conditions have eased" autoFocus /></div>
          <button className="btn danger block" onClick={act} disabled={busy || reason.trim().length < 5}>{busy ? 'Working…' : 'Cancel the alert'}</button>
        </Modal>
      )}
    </>
  );
}

function BulletinEditor({ id, onClose, onSaved }) {
  const toast = useToast();
  const [b, setB] = useState(null);
  const [f, setF] = useState({ title: '', summary: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.bulletinAdmin(id).then((d) => { setB(d.bulletin); setF({ title: d.bulletin.title, summary: d.bulletin.summary, notes: d.bulletin.notes || '' }); }).catch((e) => setError(e.message)); }, [id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.updateBulletin({ id, ...f }); toast.success('Bulletin saved.'); onSaved(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Edit bulletin text" onClose={onClose} wide>
      {!b && !error && <div className="empty"><span className="spinner" /></div>}
      {error && <div className="alert error">{error}</div>}
      {b && (
        <form onSubmit={save}>
          <p className="sec-text" style={{ marginTop: 0 }}>The tables are built from the data and cannot be edited here. Change the wording that readers see first.</p>
          <div className="field"><label htmlFor="bt-t">Title</label><input id="bt-t" className="input" required value={f.title} onChange={set('title')} /></div>
          <div className="field"><label htmlFor="bt-s">Summary</label><textarea id="bt-s" className="input" rows={9} required value={f.summary} onChange={set('summary')} /></div>
          <div className="field"><label htmlFor="bt-n">Forecaster's note (optional, shown under the summary)</label><textarea id="bt-n" className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></div>
          <div className="form-actions"><button className="btn" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button></div>
        </form>
      )}
    </Modal>
  );
}

function BulletinsTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.bulletinsAdmin({ page, per: 10, kind }).then(setData).catch((e) => setError(e.message)), [page, kind]);
  useEffect(() => { load(); }, [load]);

  const generate = async (k) => {
    setBusy(k);
    try { const r = await api.generateBulletin(k, date); toast.success(r.replaced ? 'Draft rebuilt from the latest data.' : 'Draft prepared. Review it, then publish.'); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const act = async () => {
    setBusy('act');
    try {
      if (confirm.kind === 'publish') { await api.publishBulletin(confirm.b.id); toast.success('Published.'); }
      if (confirm.kind === 'unpublish') { await api.unpublishBulletin(confirm.b.id); toast.success('Withdrawn. It is a draft again.'); }
      if (confirm.kind === 'delete') { await api.deleteBulletin(confirm.b.id); toast.success('Draft deleted.'); }
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <>
      <div className="card glow" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3 style={{ margin: 0 }}>Bulletins</h3>
            <small className="muted">Built from the quality-controlled record and the forecast. Edit the wording, then publish for the public, press and the RSS feed.</small>
          </div>
        </div>
        <div className="toolbar" style={{ marginBottom: 0, marginTop: 12 }}>
          <div className="field" style={{ flex: '0 1 200px' }}><label htmlFor="bd">Last day to cover</label>
            <input id="bd" className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
            <small className="hint">Leave empty for the latest observations</small></div>
          <button className="btn" onClick={() => generate('daily')} disabled={!!busy}>{busy === 'daily' ? <Loader2 size={16} className="spin" /> : <Megaphone size={16} />} Prepare daily bulletin</button>
          <button className="btn ghost" onClick={() => generate('weekly')} disabled={!!busy}>{busy === 'weekly' ? <Loader2 size={16} className="spin" /> : <Megaphone size={16} />} Prepare weekly summary</button>
        </div>
        <div className="role-tabs" role="tablist" style={{ marginTop: 14, marginBottom: 0 }}>
          {[['', 'All'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([k, l]) => <button key={k || 'a'} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setPage(1); }}>{l}</button>)}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!data ? <div className="empty"><span className="spinner" /></div> : data.items.length === 0 ? <div className="card empty">No bulletins yet. Prepare one above.</div> : (
        <div className="card glow">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bulletin</th><th>Type</th><th>Status</th><th>Issued</th><th /></tr></thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.title}</strong></td>
                    <td><span className={`badge ${b.kind === 'daily' ? 'info' : 'ok'}`}>{b.kind}</span></td>
                    <td><span className={`badge ${b.status === 'published' ? 'ok' : 'warn'}`}>{b.status === 'draft' ? 'Draft' : 'Published'}</span></td>
                    <td>{b.published_at ? fmtWhen(b.published_at) : <Na label="Not issued" />}</td>
                    <td className="row-actions">
                      <Link className="icon-btn" to={`/app/bulletins/${b.id}`} aria-label="Preview"><Eye size={16} /></Link>
                      <button className="icon-btn" onClick={() => setEditing(b.id)} aria-label="Edit text"><Pencil size={16} /></button>
                      {b.status === 'draft'
                        ? <><button className="btn compact" onClick={() => setConfirm({ kind: 'publish', b })}><Send size={14} /> Publish</button><button className="icon-btn danger" onClick={() => setConfirm({ kind: 'delete', b })} aria-label="Delete"><Trash2 size={16} /></button></>
                        : <><Link className="icon-btn" to={`/bulletins/${b.id}`} target="_blank" aria-label="Public page"><ExternalLink size={16} /></Link><button className="icon-btn" onClick={() => setConfirm({ kind: 'unpublish', b })} aria-label="Withdraw"><Undo2 size={16} /></button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} page={page} pageSize={data.per} onPage={setPage} sizes={[10]} label="bulletins" />
        </div>
      )}

      {editing && <BulletinEditor id={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {confirm && (
        <Confirm title={{ publish: 'Publish this bulletin?', unpublish: 'Withdraw this bulletin?', delete: 'Delete this draft?' }[confirm.kind]}
          confirmLabel={{ publish: 'Publish', unpublish: 'Withdraw', delete: 'Delete' }[confirm.kind]} danger={confirm.kind === 'delete'} busy={busy === 'act'} onConfirm={act} onCancel={() => setConfirm(null)}>
          {confirm.kind === 'publish' && <>The public will be able to read and download <b>{confirm.b.title}</b>. The alerts in force are recorded in it at this moment.</>}
          {confirm.kind === 'unpublish' && <>It will disappear from the public pages and the feed and become a draft again.</>}
          {confirm.kind === 'delete' && <>The draft will be removed.</>}
        </Confirm>
      )}
    </>
  );
}

function RulesTab() {
  const { can } = useAuth();
  const toast = useToast();
  const admin = can('manage_users');
  const [data, setData] = useState(null);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.thresholds().then((d) => { setData(d); setVals(d.thresholds); }).catch((e) => setError(e.message)); }, []);

  const set = (h, lv) => (e) => setVals({ ...vals, [h]: { ...vals[h], [lv]: e.target.value } });
  const dirty = data && JSON.stringify(vals) !== JSON.stringify(data.thresholds);
  const save = async () => {
    setBusy(true);
    try { const r = await api.saveThresholds(vals); setData({ ...data, thresholds: r.thresholds }); setVals(r.thresholds); toast.success('Thresholds saved.'); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="empty"><span className="spinner" /></div>;
  return (
    <>
      <div className="card glow" style={{ marginBottom: 16 }}>
        <h3>When an alert is prepared</h3>
        <p className="sec-text">Each time conditions are checked, the system compares the latest observations and the next three days of forecast with these thresholds. A station is flagged at the most severe level it reaches. {admin ? 'You can change the thresholds below.' : 'Only an administrator can change thresholds.'}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Hazard</th><th>Measured as</th><th className="num">Watch</th><th className="num">Warning</th></tr></thead>
            <tbody>
              {Object.keys(data.thresholds).map((h) => (
                <tr key={h}>
                  <td><strong>{data.hazards[h]}</strong></td>
                  <td>{data.units[h]}, {['cold', 'drought'].includes(h) ? 'at or below' : 'at or above'}</td>
                  {['watch', 'warning'].map((lv) => (
                    <td key={lv} className="num">
                      {admin ? <input className="input compact" style={{ width: 90, textAlign: 'right' }} type="number" step="any" value={vals[h]?.[lv] ?? ''} onChange={set(h, lv)} aria-label={`${data.hazards[h]} ${lv}`} /> : data.thresholds[h][lv]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {admin && <div className="form-actions" style={{ marginTop: 14 }}><button className="btn" onClick={save} disabled={!dirty || busy}><Save size={16} /> {busy ? 'Saving…' : 'Save thresholds'}</button></div>}
      </div>
      <div className="card">
        <h3>How it works</h3>
        <ol className="how">
          <li><b>Check.</b> Observations from the climate record (readings flagged suspect are ignored) and the Open-Meteo forecast are compared with the thresholds. Dry spells and drought use the rainy season (November to March, and April for drought) and earlier years as the normal.</li>
          <li><b>Draft.</b> A draft alert is prepared per hazard and level, listing the stations and the evidence. Running a check twice in a day never creates duplicates.</li>
          <li><b>Review.</b> A forecaster edits the wording, areas and times. Alerts are never published automatically.</li>
          <li><b>Publish.</b> The alert appears on the public page, the RSS feed and as a CAP 1.2 message for partner systems. It can be cancelled with a reason.</li>
        </ol>
        <p className="sec-text" style={{ marginBottom: 0 }}>To prepare drafts automatically every morning, schedule <code>cron/generate.php</code> (see the deployment guide).</p>
      </div>
    </>
  );
}

export default function BulletinsAdmin() {
  const [tab, setTab] = useState('alerts');
  const [stations, setStations] = useState([]);
  useEffect(() => { api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);
  return (
    <>
      <div className="page-head">
        <div><h1>Bulletins and alerts</h1><p>Prepare, review and publish public weather information.</p></div>
        <Link className="btn ghost" to="/bulletins" target="_blank"><ExternalLink size={16} /> View public page</Link>
      </div>
      <div className="role-tabs" role="tablist">
        {[['alerts', 'Alerts'], ['bulletins', 'Bulletins'], ['rules', 'Rules']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'alerts' && <AlertsTab stations={stations} />}
      {tab === 'bulletins' && <BulletinsTab />}
      {tab === 'rules' && <RulesTab />}
    </>
  );
}
