import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import Pager, { usePaged } from '../components/Pager';

const ENTITIES = ['', 'reading', 'station', 'user'];
const tone = {
  login: 'ok', logout: '', login_failed: 'danger', register: 'info', save: 'info', update: 'warn', delete: 'danger',
  import: 'info', create: 'ok', reset_password: 'danger', update_profile: '', submit: 'info',
};
const label = (a) => a.replace(/_/g, ' ');
const when = (d) => new Date(d.replace(' ', 'T'));

function Detail({ raw }) {
  if (!raw) return <span className="muted">—</span>;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* plain text */ }
  if (!parsed || typeof parsed !== 'object') return <span>{raw}</span>;
  return (
    <dl className="detail">
      {Object.entries(parsed).map(([k, val]) => (
        <div key={k}>
          <dt>{k.replace(/_/g, ' ')}</dt>
          <dd>{val && typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AuditLog() {
  const [entries, setEntries] = useState(null);
  const [entity, setEntity] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    setError('');
    api.audit({ entity, limit: 300 }).then((d) => setEntries(d.entries)).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(load, [entity]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (entries || []).filter((e) =>
    !query || `${e.username} ${e.action} ${e.entity} ${e.entity_id} ${e.detail}`.toLowerCase().includes(query.toLowerCase())), [entries, query]);

  const { slice, pagerProps } = usePaged(shown, 25);

  const exportCsv = () => {
    const rows = [['time', 'user', 'action', 'entity', 'entity_id', 'detail', 'ip'], ...shown.map((e) => [e.created_at, e.username, e.action, e.entity, e.entity_id, e.detail, e.ip_address])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `cdims-audit-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>A permanent record of sign-ins, data changes and administration. Entries cannot be edited or removed.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={load} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''} /> Refresh</button>
          <button className="btn ghost" onClick={exportCsv} disabled={!shown.length}><Download size={16} /> CSV</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="role-tabs" role="tablist" aria-label="Filter by area">
        {ENTITIES.map((e) => (
          <button key={e || 'all'} role="tab" aria-selected={entity === e} className={entity === e ? 'on' : ''} onClick={() => setEntity(e)}>
            {e || 'All activity'}
          </button>
        ))}
      </div>

      <div className="card glow">
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Search user, action or details" aria-label="Search audit log" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {!entries ? (
          <div className="empty"><span className="spinner" /></div>
        ) : shown.length === 0 ? (
          <div className="empty">No activity matches.</div>
        ) : (
          <ul className="timeline">
            {slice.map((e) => (
              <li key={e.id}>
                <button className="tl-row" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                  <span className={`tl-dot ${tone[e.action] || ''}`} />
                  <span className="tl-main">
                    <span><strong>{e.username || 'Someone'}</strong> <span className={`badge ${tone[e.action] || ''}`}>{label(e.action)}</span> {e.entity}{e.entity_id ? <> <code>{e.entity_id}</code></> : null}</span>
                    <small>{when(e.created_at).toLocaleString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {e.ip_address || 'unknown address'}</small>
                  </span>
                  <ChevronDown size={16} className={`tl-chev ${open === e.id ? 'open' : ''}`} />
                </button>
                {open === e.id && <div className="tl-detail"><Detail raw={e.detail} /></div>}
              </li>
            ))}
          </ul>
        )}
        <Pager {...pagerProps} label="entries" sizes={[10, 25, 50, 100]} />
        <p className="origins"><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> The latest 300 entries are loaded. Use the CSV button for what you have filtered.</p>
      </div>
    </>
  );
}
