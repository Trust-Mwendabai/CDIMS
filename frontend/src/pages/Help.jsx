import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, BookOpen, ChevronRight, ClipboardCheck, ClipboardList, Database, Download, FileText, KeyRound, LayoutDashboard, LineChart,
  List, MapPin, Megaphone, Search, Settings, Smartphone, UploadCloud, Users, X,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

const Elements = () => (
  <div className="table-wrap">
    <table>
      <thead><tr><th>Element</th><th>Standard ID</th><th>CSV column</th><th>Unit</th><th>Accepted range</th></tr></thead>
      <tbody>
        <tr><td>Maximum temperature</td><td>TMAX</td><td><code>tmax</code></td><td>°C</td><td>−20 to 55</td></tr>
        <tr><td>Minimum temperature</td><td>TMIN</td><td><code>tmin</code></td><td>°C</td><td>−20 to 45, not above max</td></tr>
        <tr><td>Rainfall</td><td>PRCP</td><td><code>rainfall_mm</code></td><td>mm</td><td>0 to 500</td></tr>
        <tr><td>Humidity</td><td>RH</td><td><code>humidity</code></td><td>%</td><td>0 to 100</td></tr>
        <tr><td>Wind speed</td><td>WSPD</td><td><code>wind_speed</code></td><td>m/s</td><td>0 to 150</td></tr>
      </tbody>
    </table>
  </div>
);

const SECTIONS = [
  {
    id: 'start', icon: BookOpen, title: 'Getting started', needs: null,
    keywords: 'sign in login role account start theme',
    body: (
      <>
        <p>Sign in with your username or email. New accounts can view the dashboard, stations and analysis. An administrator can grant more access.</p>
        <ul>
          <li><b>Public</b> sees the dashboard, stations and analysis.</li>
          <li><b>Stakeholder</b> also browses and exports readings and opens reports.</li>
          <li><b>Analyst</b> also adds, edits and imports data and manages stations.</li>
          <li><b>Administrator</b> also manages users and reads the audit log.</li>
        </ul>
        <p>If a menu item is missing, your role does not include it. The <b>Users</b> page shows exactly what each role can do.</p>
      </>
    ),
  },
  {
    id: 'dashboard', icon: LayoutDashboard, title: 'Reading the dashboard', needs: null,
    keywords: 'dashboard kpi alerts chart temperature rainfall',
    body: (
      <>
        <ul>
          <li><b>Live conditions</b> at the top show the weather now at every station, refreshed every 10 minutes, with a 7-day forecast. Click a station to see its forecast. These values are modelled by an outside service for each station's location, so they are not ZMD observations and are not saved in the climate record.</li>
          <li>The coloured cards show 30-day averages for temperature, rainfall per station, humidity and wind, relative to the latest reading.</li>
          <li>Temperature (top) and rainfall (bottom) are shown for the last 12 months. Hover a month to see max, min and rainfall together.</li>
          <li>Use the station picker on the chart to focus on one station, or <b>CSV</b> to download the monthly figures.</li>
          <li><b>Alerts</b> list the last 7 days of extreme heat (maximum 35 °C or more) and heavy rain (50 mm or more).</li>
          <li>A thin bar on the rainfall baseline means 0 mm was recorded.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'analysis', icon: LineChart, title: 'Analysing trends', needs: null,
    keywords: 'analysis trend mean highest lowest compare station',
    body: (
      <>
        <p>Choose an element, a station (or the national average) and optionally a date range. You get the mean, highest and lowest values with their dates, and a linear trend per year.</p>
        <ul>
          <li><b>Compare with</b> overlays a second station or the national average on the same chart.</li>
          <li>Long periods are averaged by month so charts stay readable.</li>
          <li>Records shorter than 30 years give only an indication of trend, following WMO guidance.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'data', icon: Database, title: 'Browsing and editing readings', needs: 'Stakeholder and above',
    keywords: 'readings data filter edit delete export soft delete',
    body: (
      <>
        <ul>
          <li>Filter by station, date, data origin and quality flag, then <b>Export CSV</b> to download exactly what you filtered.</li>
          <li>Analysts and administrators can <b>Add reading</b>, <b>edit</b> a row (station and date stay fixed) or <b>delete</b> it.</li>
          <li>Deleting hides a reading everywhere but keeps it in the database, and the action is recorded in the audit log.</li>
          <li>Adding a reading for a station and date that already exists replaces the earlier one.</li>
        </ul>
        <Elements />
      </>
    ),
  },
  {
    id: 'import', icon: UploadCloud, title: 'Importing data from files', needs: 'Analyst and above',
    keywords: 'import csv excel xlsx upload template origin errors preview validate mapping',
    body: (
      <>
        <p>Open <b>Import data</b>. The wizard checks your file <i>before</i> anything is saved.</p>
        <ol>
          <li><b>Choose a file</b>: CSV, or an Excel (.xlsx) workbook. Download the <a href={api.templateUrl}>CSV template</a> if you want a starting point. Set the file's units (for example °F or km/h) and the data origin.</li>
          <li><b>Match columns</b> if the headings are not recognised. Common names such as <code>Date</code>, <code>Station</code>, <code>Rain</code> or <code>Max Temp</code> are matched automatically; you can set any column to be ignored.</li>
          <li><b>Review the preview</b>: how many rows are valid, how many would create new readings, how many would replace existing ones, and every problem with its line number. Nothing has been saved yet.</li>
          <li><b>Import</b> saves the valid rows. Rows with problems are skipped and listed so you can fix them and import again.</li>
        </ol>
        <p>Required columns are the station code and the date (YYYY-MM-DD or DD/MM/YYYY). Files can be up to 5 MB. Station codes are on the Stations page.</p>
      </>
    ),
  },
  {
    id: 'field', icon: ClipboardList, title: 'Field entry and working offline', needs: 'Analyst and above',
    keywords: 'field entry offline sync queue observer remote no signal',
    body: (
      <>
        <p>Use <b>Field entry</b> for quick daily observations, even with no signal.</p>
        <ul>
          <li>Enter the station, date and measurements and press <b>Save</b>. Online, it is saved at once. Offline, it is kept safely on <b>this device</b> and shown as <i>waiting to sync</i>.</li>
          <li>When the connection returns the queue is sent automatically. The status chip at the top shows how many are waiting, and you can press it to sync now.</li>
          <li>Sending is safe to repeat: the same station and day is never duplicated. If a queued reading is rejected, it stays in the list with the reason so you can correct it.</li>
          <li>Pages you have already opened keep working offline, and your sign-in is remembered on the device. Keep the app installed on shared phones only if you trust everyone who uses them.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'warnings', icon: Megaphone, title: 'Bulletins and public alerts', needs: 'Analyst and above',
    keywords: 'bulletin alert warning flood drought heat pdf publish draft cap rss news',
    body: (
      <>
        <p>The <b>Bulletins and alerts</b> page prepares public weather information. Nothing is public until a person publishes it.</p>
        <ul>
          <li><b>Alerts</b>: the system checks observations and the 3-day forecast against thresholds (heat, cold, heavy rain, flood, wind, dry spell, drought) and drafts alerts. Review the wording, edit, then <b>Publish</b>. Cancel an alert with a reason when it no longer applies. The thresholds can be adjusted on the same page.</li>
          <li><b>Bulletins</b>: generate a <b>daily</b> or <b>weekly</b> bulletin from the stored data, add forecaster notes, then publish. A published bulletin stays on record, and you can unpublish it if needed.</li>
          <li><b>PDF</b> for newspapers and radio: every bulletin and alert has a print-ready PDF with the department heading and plain-language advice.</li>
          <li><b>Public pages</b> (no sign-in): <i>/bulletins</i> lists published bulletins and active alerts. An <b>RSS feed</b> and standard <b>CAP</b> alert files are provided for news outlets and other systems.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'quality', icon: ClipboardCheck, title: 'Quality flags and data origin', needs: null,
    keywords: 'quality flag suspect estimated origin sample lineage',
    body: (
      <>
        <ul>
          <li><b>OK</b> is a normal, accepted reading. <b>Suspect</b> needs checking. <b>Estimated</b> was not directly measured.</li>
          <li><b>Origin</b> records where data came from: a manual station observation, an automatic sensor, a satellite product or a model.</li>
          <li>Readings labelled <b>sample</b> are generated demonstration data, not real measurements.</li>
        </ul>
        <p>Values outside the accepted ranges are rejected before they are stored, with a message explaining why.</p>
      </>
    ),
  },
  {
    id: 'stations', icon: MapPin, title: 'Stations and the map', needs: null,
    keywords: 'stations map location coordinates',
    body: (
      <>
        <ul>
          <li>The <b>Stations</b> page lists every station with coordinates, elevation, status and record count.</li>
          <li>The <b>Map</b> colours each station by temperature or rainfall over the last 30 days. Click a marker or a station card for details.</li>
          <li>Analysts and administrators can add stations and edit their details. Mark a closed station <b>inactive</b> instead of removing it.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'reports', icon: FileText, title: 'Reports', needs: 'Stakeholder and above',
    keywords: 'reports summary quality print pdf annual',
    body: (
      <>
        <ul>
          <li><b>Climate summary</b> gives monthly and annual figures per station for a chosen year. A rain day is a day with 1 mm or more.</li>
          <li>Use <b>Print / PDF</b> to share a report, or <b>CSV</b> to take the numbers into a spreadsheet.</li>
          <li><b>Data quality</b> shows completeness over the last 30 days, flagged readings and retained deletions.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'account', icon: Settings, title: 'Your account and preferences', needs: null,
    keywords: 'profile password theme preferences start page sidebar dark',
    body: (
      <>
        <p>Open <b>My account</b> to change your name, email and password, and to set preferences that follow you to any device:</p>
        <ul>
          <li><b>Theme</b>: system, light or dark.</li>
          <li><b>Start page</b>: the page you land on after signing in.</li>
          <li><b>Default dashboard station</b> and the <b>sidebar</b> style on desktop.</li>
          <li><b>Where you are signed in</b>: see every browser or phone signed in to your account and sign out any of them, or all of them at once.</li>
          <li><b>Passwords</b> need at least 10 characters with three kinds of character, and must not be common or contain your name. A strength meter helps you choose.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'admin', icon: Users, title: 'Administration', needs: 'Administrator',
    keywords: 'admin users roles reset password audit system health backup unlock',
    body: (
      <>
        <ul>
          <li><b>Users</b>: add accounts, change roles, disable access and reset a forgotten password.</li>
          <li><b>Audit log</b>: who signed in, changed data, imported files or changed accounts, and when. Entries cannot be edited.</li>
          <li><b>System</b>: health checks (database, storage, scheduled job, live weather service, HTTPS), record counts, and CSV downloads of readings, stations, users, alerts, bulletins and the audit log for backup.</li>
          <li><b>Locked accounts</b>: after repeated wrong passwords an account locks for a while. Open the user and choose <b>Unlock</b>.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'install', icon: Smartphone, title: 'Install the app and offline use', needs: null,
    keywords: 'install pwa offline phone home screen',
    body: (
      <>
        <p>CDIMS can be installed like an app. Use the <b>Install app</b> button, or your browser's “Add to home screen” option.</p>
        <p>The app opens offline, and a banner tells you when you have no connection. Climate figures need a connection so they are always current. To record observations without a connection use <b>Field entry</b>, which queues them and sends them later.</p>
      </>
    ),
  },
  {
    id: 'trouble', icon: KeyRound, title: 'Troubleshooting', needs: null,
    keywords: 'locked out password sign in error problem signed out expired too many requests',
    body: (
      <>
        <ul>
          <li><b>Cannot sign in:</b> check your username or email and password. After five failed attempts the account locks for 15 minutes (longer if it keeps happening); an administrator can unlock it.</li>
          <li><b>Signed out unexpectedly:</b> sessions end after an hour without activity, after 12 hours in total, or when your password or role is changed. Anything saved offline is still on the device.</li>
          <li><b>"Too many requests":</b> wait for the time shown and try again.</li>
          <li><b>Forgot your password:</b> ask an administrator to reset it, then change it under My account.</li>
          <li><b>Import rejected rows:</b> read the line-numbered messages, fix the file and import again.</li>
          <li><b>Something looks out of date:</b> refresh the page. Data is never cached by the app.</li>
        </ul>
      </>
    ),
  },
];

/** Contents overlay: slides over the page instead of taking a permanent column. */
function ContentsDrawer({ open, onClose, query, setQuery, shown }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  // Close first (which unlocks page scrolling), then scroll to the chosen section
  const go = (e, id) => {
    e.preventDefault();
    onClose();
    setTimeout(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="drawer-back" onMouseDown={onClose}>
      <aside className="toc-drawer" role="dialog" aria-modal="true" aria-label="Guide contents" onMouseDown={(e) => e.stopPropagation()}>
        <div className="toc-head">
          <h2>Contents</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close contents"><X size={20} /></button>
        </div>
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Search the guide" aria-label="Search the guide" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <nav className="toc-list" aria-label="Guide sections">
          {shown.length === 0 && <p className="muted" style={{ padding: '8px 4px' }}>No sections match “{query}”.</p>}
          {shown.map(({ id, icon: Icon, title, needs }) => (
            <a key={id} href={`#guide-${id}`} onClick={(e) => go(e, id)}>
              <Icon size={18} />
              <span>{title}{needs && <small>{needs}</small>}</span>
              <ChevronRight size={16} className="chev" />
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}

export default function Help() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const shown = useMemo(() => SECTIONS.filter((s) =>
    !query || `${s.title} ${s.keywords}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <>
      <div className="page-head">
        <div><h1>User guide</h1><p>How to use CDIMS, written for {user.role === 'admin' ? 'administrators' : `${user.role}s`} and everyone else.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setTocOpen(true)}><List size={16} /> Contents</button>
          <a className="btn ghost" href={api.templateUrl}><Download size={16} /> CSV template</a>
        </div>
      </div>

      <div className="guide-body">
        {shown.length === 0 && <div className="card empty">No guide sections match “{query}”.</div>}
        {shown.map(({ id, icon: Icon, title, needs, body }) => (
          <section key={id} id={`guide-${id}`} className="card guide-sec">
            <h2><span className="ico"><Icon size={18} /></span> {title} {needs && <span className="badge info">{needs}</span>}</h2>
            <div className="prose">{body}</div>
          </section>
        ))}
        <p className="muted-note"><BarChart3 size={14} style={{ verticalAlign: -2 }} /> This guide describes the version you are using.</p>
      </div>

      <ContentsDrawer open={tocOpen} onClose={() => setTocOpen(false)} query={query} setQuery={setQuery} shown={shown} />
    </>
  );
}
