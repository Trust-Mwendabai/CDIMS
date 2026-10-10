import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardCopy, CloudSun, Download, FileDown, Printer, Rss, Share2 } from 'lucide-react';
import { api } from '../api';
const AlertMap = lazy(() => import('../components/AlertMap'));
import { AdviceList, AlertCard, DemoBanner, EmergencyContacts, SeverityBadge, SeverityScale, fmtLong } from '../components/alerts';
import Pager from '../components/Pager';
import ThemeToggle from '../components/ThemeToggle';
import { useToast } from '../components/toast';
import { useAuth } from '../auth';

const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const n = (v, u = '') => (v == null ? <span className="na">n/a</span> : `${v}${u}`);

/** Public pages share a light header and footer; no sign-in is needed. */
function PublicShell({ children, org }) {
  const { user } = useAuth();
  return (
    <div className="pub">
      <header className="pub-head">
        <div className="pub-head-in">
          <Link to="/" className="lp-brand"><span className="lp-logo"><CloudSun size={20} /></span> CDIMS</Link>
          <nav aria-label="Public pages">
            <Link to="/bulletins">Bulletins and alerts</Link>
            <a href={api.feedUrl} target="_blank" rel="noreferrer"><Rss size={14} /> RSS</a>
          </nav>
          <div className="pub-actions">
            <ThemeToggle />
            <Link className="btn" to={user ? '/app' : '/login'}>{user ? 'Open app' : 'Staff sign in'}</Link>
          </div>
        </div>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-foot">
        <p>Issued by {org || 'the Zambia Meteorology Department'}. Observations are provisional and forecasts come from the Open-Meteo model. For emergencies follow the instructions of local authorities.</p>
        <p><a href={api.feedUrl}>RSS feed</a> · Alerts are also published as CAP 1.2 for partner systems.</p>
      </footer>
    </div>
  );
}

export function PublicIndex() {
  const [alerts, setAlerts] = useState(null);
  const [list, setList] = useState(null);
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { api.publicAlerts().then(setAlerts).catch((e) => setError(e.message)); }, []);
  useEffect(() => { api.publicBulletins({ kind, page, per: 8 }).then(setList).catch((e) => setError(e.message)); }, [kind, page]);

  const org = alerts?.org || list?.org;

  return (
    <PublicShell org={org}>
      <section className="pub-hero">
        <span className="lp-eyebrow">Public information</span>
        <h1>Weather bulletins and alerts</h1>
        <p>Daily weather bulletins, weekly climate summaries and warnings for hazardous weather in Zambia.</p>
      </section>

      <DemoBanner show={alerts?.demo || list?.demo} />
      {error && <div className="alert error">{error}</div>}

      <section aria-labelledby="active-alerts">
        <h2 id="active-alerts" className="pub-h2">Alerts in force</h2>
        {!alerts ? <div className="empty"><span className="spinner" /></div> : alerts.alerts.length === 0 ? (
          <div className="card quiet"><CheckCircle2 size={22} /> <div><b>No weather alerts are in force.</b><p>Check back later, or subscribe to the RSS feed to be told when one is issued.</p></div></div>
        ) : (
          <div className="alert-list">{alerts.alerts.map((a) => <AlertCard key={a.id} alert={a} compact onOpen={() => navigate(`/alerts/${a.id}`)} />)}</div>
        )}
      </section>

      <section aria-labelledby="latest">
        <h2 id="latest" className="pub-h2">Latest bulletins</h2>
        <div className="role-tabs" role="tablist" aria-label="Bulletin type">
          {[['', 'All'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([k, l]) => (
            <button key={k || 'all'} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setPage(1); }}>{l}</button>
          ))}
        </div>
        {!list ? <div className="empty"><span className="spinner" /></div> : list.items.length === 0 ? (
          <div className="card empty">No bulletins have been published yet.</div>
        ) : (
          <div className="bulletin-grid">
            {list.items.map((b) => (
              <Link key={b.id} to={`/bulletins/${b.id}`} className="card bulletin-card">
                <span className={`badge ${b.kind === 'daily' ? 'info' : 'ok'}`}>{b.kind === 'daily' ? 'Daily bulletin' : 'Weekly summary'}</span>
                <h3>{b.title}</h3>
                <p>{b.summary.length > 190 ? `${b.summary.slice(0, 190)}…` : b.summary}</p>
                <small><CalendarDays size={13} /> Issued {fmtLong(b.published_at)}</small>
              </Link>
            ))}
          </div>
        )}
        {list && <Pager total={list.total} page={page} pageSize={list.per} onPage={setPage} sizes={[8]} label="bulletins" />}
      </section>

      {alerts?.recent?.length > 0 && (
        <section aria-labelledby="past">
          <h2 id="past" className="pub-h2">Recent past alerts</h2>
          <div className="alert-list">{alerts.recent.map((a) => <AlertCard key={a.id} alert={a} compact onOpen={() => navigate(`/alerts/${a.id}`)} />)}</div>
        </section>
      )}
    </PublicShell>
  );
}

/** Actions shared by bulletin and alert pages: PDF, print, copy for press, share. */
function ShareBar({ onPdf, onCopy, busy, capId }) {
  return (
    <div className="share-bar no-print">
      <button className="btn" onClick={onPdf} disabled={busy}><FileDown size={16} /> {busy ? 'Preparing…' : 'Download PDF'}</button>
      <button className="btn ghost" onClick={() => window.print()}><Printer size={16} /> Print</button>
      <button className="btn ghost" onClick={onCopy}><ClipboardCopy size={16} /> Copy text for press</button>
      {capId && <a className="btn ghost" href={api.capUrl(capId)} target="_blank" rel="noreferrer"><Share2 size={16} /> CAP (XML)</a>}
    </div>
  );
}

export function PublicBulletin({ staffPreview = false }) {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (staffPreview ? api.bulletinAdmin(id) : api.publicBulletin(id)).then(setData).catch((e) => setError(e.message));
  }, [id, staffPreview]);

  const b = data?.bulletin;
  const meta = { org: data?.org || 'Zambia Meteorology Department', demo: data?.demo };

  const pdf = async () => {
    setBusy(true);
    try {
      const { downloadBulletinPdf } = await import('../pdf');
      await downloadBulletinPdf(b, meta);
    } catch (e) { toast.error(`Could not create the PDF: ${e.message}`); } finally { setBusy(false); }
  };
  const copy = async () => {
    const { pressText } = await import('../pdf');
    try { await navigator.clipboard.writeText(pressText(b, 'bulletin', meta)); toast.success('Copied. Paste it into your story or message.'); } catch { toast.error('Copying is not available in this browser.'); }
  };

  const body = (
    <>
      <Link to={staffPreview ? '/app/bulletins' : '/bulletins'} className="back-link no-print"><ArrowLeft size={15} /> {staffPreview ? 'Back to bulletins' : 'All bulletins'}</Link>
      {error && <div className="alert error">{error}</div>}
      {!b && !error && <div className="empty"><span className="spinner" /></div>}
      {b && (
        <>
          <DemoBanner show={data.demo} />
          {b.status === 'draft' && <div className="alert info">Draft preview. This bulletin has not been published and the public cannot see it.</div>}
          <article className="doc">
            <span className={`badge ${b.kind === 'daily' ? 'info' : 'ok'}`}>{b.kind === 'daily' ? 'Daily weather bulletin' : 'Weekly climate summary'}</span>
            <h1>{b.title}</h1>
            <p className="doc-meta">{b.published_at ? `Issued ${fmtLong(b.published_at)} by ${meta.org}` : 'Not yet issued'}</p>
            <ShareBar onPdf={pdf} onCopy={copy} busy={busy} />

            <p className="doc-summary">{b.summary}</p>
            {b.notes && <p className="doc-notes">{b.notes}</p>}

            {b.content.alerts?.length > 0 && (
              <section><h2>Weather alerts in force</h2>
                <div className="alert-list">{b.content.alerts.map((a) => (
                  <Link key={a.id} to={staffPreview ? '/app/bulletins' : `/alerts/${a.id}`} className={`alert-line sev-${a.severity}`}>
                    <SeverityBadge severity={a.severity} /> <span>{a.title}</span>
                  </Link>))}
                </div>
              </section>
            )}

            {b.kind === 'daily' ? <DailyTables c={b.content} /> : <WeeklyTables c={b.content} />}
            <p className="doc-fine">Observations come from ZMD stations and are provisional until quality control is complete. Outlook figures come from the Open-Meteo forecast model.</p>
          </article>
        </>
      )}
    </>
  );
  return staffPreview ? body : <PublicShell org={meta.org}>{body}</PublicShell>;
}

function DailyTables({ c }) {
  return (
    <>
      <section>
        <h2>Observations, {new Date(`${c.observed_on}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Station</th><th>Province</th><th className="num">Max °C</th><th className="num">Min °C</th><th className="num">Rain mm</th><th className="num">Humidity %</th><th className="num">Wind m/s</th></tr></thead>
          <tbody>{c.observed.map((r) => (
            <tr key={r.code}><td><strong>{r.name}</strong></td><td>{r.province}</td><td className="num">{n(r.tmax)}</td><td className="num">{n(r.tmin)}</td><td className="num">{n(r.rain)}</td><td className="num">{n(r.humidity)}</td><td className="num">{n(r.wind)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
      {c.outlook?.length > 0 && (
        <section>
          <h2>Outlook, next three days</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Station</th>{c.outlook[0].days.map((d) => <th key={d.date} className="num">{fmtDay(d.date)}</th>)}</tr></thead>
            <tbody>{c.outlook.map((s) => (
              <tr key={s.code}><td><strong>{s.name}</strong></td>{s.days.map((d) => (
                <td key={d.date} className="num"><b>{Math.round(d.max)}°</b> / {Math.round(d.min)}°<br /><small className="muted">{d.rain_mm ?? 0} mm · {d.rain_chance ?? 0}%</small></td>
              ))}</tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

function WeeklyTables({ c }) {
  return (
    <>
      <section>
        <h2>The week at each station</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Station</th><th className="num">Avg max</th><th className="num">vs normal</th><th className="num">Avg min</th><th className="num">Rain mm</th><th className="num">% normal</th><th className="num">Rain days</th></tr></thead>
          <tbody>{c.stations.map((r) => (
            <tr key={r.code}><td><strong>{r.name}</strong></td><td className="num">{n(r.tmax, '°')}</td>
              <td className="num">{r.tmax_anomaly == null ? <span className="na">n/a</span> : <span className={r.tmax_anomaly > 0.5 ? 'warm' : r.tmax_anomaly < -0.5 ? 'cool' : ''}>{r.tmax_anomaly > 0 ? '+' : ''}{r.tmax_anomaly}°</span>}</td>
              <td className="num">{n(r.tmin, '°')}</td><td className="num">{n(r.rain)}</td><td className="num">{r.rain_pct_normal == null ? <span className="na">n/a</span> : `${r.rain_pct_normal}%`}</td><td className="num">{r.rain_days}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="chart-note">"Normal" is the average for the same dates in earlier years of the record. n/a means there is not enough history to compare.</p>
      </section>
      {c.outlook?.length > 0 && (
        <section><h2>Outlook, next seven days</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Station</th><th>Province</th><th className="num">Expected rain</th><th className="num">Avg max</th></tr></thead>
            <tbody>{c.outlook.map((s) => <tr key={s.code}><td><strong>{s.name}</strong></td><td>{s.province}</td><td className="num">{s.rain_mm} mm</td><td className="num">{n(s.avg_max, '°')}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

export function PublicAlert() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.publicAlert(id).then(setData).catch((e) => setError(e.message)); }, [id]);

  const a = data?.alert;
  const meta = { org: data?.org || 'Zambia Meteorology Department', demo: data?.demo, capUrl: `${window.location.origin}${api.capUrl(id)}` };
  const pdf = async () => {
    setBusy(true);
    try { const { downloadAlertPdf } = await import('../pdf'); await downloadAlertPdf(a, meta); } catch (e) { toast.error(`Could not create the PDF: ${e.message}`); } finally { setBusy(false); }
  };
  const copy = async () => {
    const { pressText } = await import('../pdf');
    try { await navigator.clipboard.writeText(pressText(a, 'alert', meta)); toast.success('Copied. Paste it into your story or message.'); } catch { toast.error('Copying is not available in this browser.'); }
  };

  return (
    <PublicShell org={meta.org}>
      <Link to="/bulletins" className="back-link no-print"><ArrowLeft size={15} /> All bulletins and alerts</Link>
      {error && <div className="alert error">{error}</div>}
      {!a && !error && <div className="empty"><span className="spinner" /></div>}
      {a && (
        <>
          <DemoBanner show={data.demo} />
          <AlertCard alert={a} hideAdvice />
          <SeverityScale severity={a.severity} />
          <Suspense fallback={null}><AlertMap areas={a.areas} severity={a.severity} /></Suspense>
          <AdviceList advice={a.advice} />
          <EmergencyContacts contacts={data.contacts} />
          <ShareBar onPdf={pdf} onCopy={copy} busy={busy} capId={a.id} />
          {a.status === 'cancelled' && <div className="alert error"><b>This alert has been cancelled.</b> {a.cancel_reason}</div>}
          <dl className="facts">
            <div><dt>Issued</dt><dd>{fmtLong(a.published_at)}</dd></div>
            <div><dt>Valid from</dt><dd>{fmtLong(a.starts_at)}</dd></div>
            <div><dt>Expires</dt><dd>{fmtLong(a.expires_at)}</dd></div>
            <div><dt>Basis</dt><dd>{a.basis === 'forecast' ? 'Forecast' : a.basis === 'observed' ? 'Observations' : 'Forecaster assessment'}</dd></div>
          </dl>
          <p className="doc-fine">Reference CDIMS-{a.id}. Alerts are checked by a forecaster before they are published.</p>
        </>
      )}
    </PublicShell>
  );
}
