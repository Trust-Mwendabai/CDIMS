import { useEffect, useState } from 'react';
import { CheckCircle2, Download, HardDrive, RefreshCw, TriangleAlert, XCircle } from 'lucide-react';
import { api } from '../api';

const ICON = { ok: CheckCircle2, warn: TriangleAlert, fail: XCircle };
const EXPORT_LABEL = {
  readings: 'Climate readings', stations: 'Stations', users: 'Users (no passwords)', audit: 'Audit log', alerts: 'Alerts', bulletins: 'Bulletins',
};
const COUNT_LABEL = {
  readings: 'Readings', stations: 'Stations', users: 'Users', active_sessions: 'Signed-in sessions', published_alerts: 'Published alerts',
  draft_alerts: 'Draft alerts', published_bulletins: 'Published bulletins', audit_entries: 'Audit entries',
};

export default function SystemPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    setError('');
    api.systemHealth().then(setData).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(load, []);

  const problems = data ? data.checks.filter((c) => c.status !== 'ok').length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>System</h1>
          <p>Health of this installation, and downloadable backups of your data.</p>
        </div>
        <button className="btn ghost" onClick={load} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''} /> Check again</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!data ? (
        !error && <div className="empty"><span className="spinner" /></div>
      ) : (
        <>
          <div className={`alert ${problems ? 'info' : 'ok'}`} role="status">
            {problems ? `${problems} item${problems > 1 ? 's' : ''} need${problems > 1 ? '' : 's'} attention.` : 'Everything looks healthy.'}
          </div>

          <div className="card glow">
            <h3>Health checks</h3>
            <ul className="health-list">
              {data.checks.map((c) => {
                const Icon = ICON[c.status];
                return (
                  <li key={c.name}>
                    <Icon size={18} className={`health-${c.status}`} aria-label={c.status} />
                    <div><strong>{c.name}</strong><small>{c.detail}</small></div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid two">
            <div className="card glow">
              <h3>What is stored</h3>
              <dl className="detail sys-counts">
                {Object.entries(data.counts).map(([k, v]) => (
                  <div key={k}><dt>{COUNT_LABEL[k] || k}</dt><dd>{v.toLocaleString()}</dd></div>
                ))}
                <div><dt>Latest reading</dt><dd>{data.latest_reading || 'None yet'}</dd></div>
                <div><dt>Database size</dt><dd>{data.database_mb} MB</dd></div>
                <div><dt>Free disk space</dt><dd>{data.disk_free_mb == null ? 'Unknown' : `${data.disk_free_mb.toLocaleString()} MB`}</dd></div>
                <div><dt>PHP</dt><dd>{data.php}</dd></div>
                <div><dt>Time zone</dt><dd>{data.timezone}</dd></div>
              </dl>
            </div>

            <div className="card glow">
              <h3><HardDrive size={18} style={{ verticalAlign: -3 }} /> Backups</h3>
              <p className="muted">Download a table as a CSV file you can open in Excel. Keep copies off the server. For a complete backup also use your hosting control panel's database backup (see the deployment guide).</p>
              <ul className="backup-list">
                {data.exports.map((t) => (
                  <li key={t}>
                    <span>{EXPORT_LABEL[t] || t}</span>
                    <a className="btn ghost" href={api.systemExportUrl(t)}><Download size={14} /> CSV</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  );
}
