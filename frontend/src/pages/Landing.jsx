import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, Check, CheckCircle2, CircleDashed, CloudRain, CloudSun, Database, Download, Droplets,
  FileUp, Flame, Gauge, HeartPulse, KeyRound, LayoutDashboard, LineChart, Lock, MapPin, Minus, Plus, ShieldCheck, Siren,
  Megaphone, Smartphone, Sprout, Thermometer, Users, Waves, Wind, Landmark, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../auth';
import ActiveAlerts from '../components/ActiveAlerts';
import HeroPreview from '../components/HeroPreview';
import ThemeToggle from '../components/ThemeToggle';
import { InstallButton } from '../components/pwa';
import { CountUp, Reveal } from '../components/motion';

const facts = [
  { value: 1932, label: 'First daily rainfall records at ZMD stations' },
  { value: 38, label: 'Meteorological stations across Zambia' },
  { value: 5, label: 'Climate elements per station-day' },
  { value: 4, label: 'Access roles, enforced on the server' },
];

const tour = [
  {
    id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard,
    title: 'The national picture at a glance',
    text: 'Thirty-day averages, a twelve-month temperature and rainfall view, and a live alerts list give decision-makers the current situation in seconds.',
    points: ['30-day temperature, rainfall, humidity and wind', 'Separate temperature and rainfall charts with linked tooltips', 'Filter to a single station and export the chart to CSV', 'Heat and heavy-rain alerts from the last seven days'],
  },
  {
    id: 'analysis', label: 'Analysis', icon: LineChart,
    title: 'Trends, extremes and probabilities',
    text: 'Choose an element, a station or the national average, and a date range. CDIMS charts the record and summarises it.',
    points: ['Mean, highest, lowest and linear trend per year', 'Overlay a second station or the national average', 'Probability that a threshold is reached, by month', 'Guidance on short-record limits (WMO 30-year rule)'],
  },
  {
    id: 'data', label: 'Climate data', icon: Database,
    title: 'A validated, searchable record',
    text: 'Browse every observation, filter by station and date, and add or import new data with validation that explains every rejection.',
    points: ['Import CSV or Excel with a validation preview before saving',
      'Record observations offline in the field; they sync when signal returns', 'Filter by station, date, origin and quality flag', 'Export exactly what you filtered', 'Deleted readings are retained and logged'],
  },
  {
    id: 'quality', label: 'Quality and reports', icon: ShieldCheck,
    title: 'Trustworthy data, ready to share',
    text: 'CDIMS checks data as it arrives, helps maintain it afterwards, and turns it into reports others can rely on.',
    points: ['Automatic flags for readings far from a station’s usual range', 'Missing days found, and short gaps estimated (never rainfall)', 'Station-by-month heatmap and printable annual summaries', 'Every change recorded in the audit log'],
  },
  {
    id: 'warnings', label: 'Warnings', icon: Megaphone,
    title: 'Bulletins and alerts the public can use',
    text: 'CDIMS drafts weather bulletins and hazard alerts from the data. A forecaster reviews and publishes them, and they reach the public and the news media in the formats they need.',
    points: ['Daily and weekly bulletins generated from the record', 'Drought, flood, heat and storm alerts drafted from thresholds', 'Print-ready PDFs for newspapers and radio', 'Public page, RSS feed and standard CAP alert files'],
  },
  {
    id: 'admin', label: 'Administration', icon: KeyRound,
    title: 'Accounts and permissions you control',
    text: 'Administrators create users, set roles, disable accounts and see at a glance what every role may do.',
    points: ['Add users, or reset a forgotten password', 'Search and filter by role, with a permission matrix', 'Permanent audit log, session control and rate limiting', 'Disable accounts without losing their history'],
  },
];

const steps = [
  { icon: FileUp, title: 'Collect', text: 'Daily observations are entered by hand (even offline in the field) or imported from CSV and Excel files in the units your source uses.' },
  { icon: CheckCircle2, title: 'Check', text: 'Values are standardised, range-checked and flagged when they look unusual.' },
  { icon: BarChart3, title: 'Explore', text: 'Dashboards, maps and analysis turn the record into trends and alerts.' },
  { icon: Download, title: 'Share', text: 'Export data, print annual summaries, and publish bulletins and alerts for partners, policy makers and the public.' },
];

const elements = [
  { icon: Thermometer, title: 'Max temperature', range: '−20 to 55 °C' },
  { icon: Thermometer, title: 'Min temperature', range: '−20 to 45 °C' },
  { icon: CloudRain, title: 'Rainfall', range: '0 to 500 mm' },
  { icon: Droplets, title: 'Humidity', range: '0 to 100 %' },
  { icon: Wind, title: 'Wind speed', range: '0 to 150 m/s' },
];

const useCases = [
  { icon: Sprout, title: 'Agriculture and food security', text: 'Track rainfall onset and dry spells, and compare seasons to plan planting and advise farmers.' },
  { icon: Waves, title: 'Water resources', text: 'Monitor rainfall totals and trends that feed reservoirs, river basins and irrigation planning.' },
  { icon: Siren, title: 'Disaster risk reduction', text: 'Spot extreme heat and heavy rainfall quickly to support early warning and response.' },
  { icon: HeartPulse, title: 'Public health', text: 'Relate temperature and humidity patterns to heat stress and climate-sensitive disease.' },
  { icon: FlaskConical, title: 'Research and education', text: 'Give researchers and students a clean, exportable record with documented limits.' },
  { icon: Landmark, title: 'Policy and planning', text: 'Support evidence-based decisions on infrastructure, energy and climate adaptation.' },
];

const roles = ['Administrator', 'Analyst', 'Stakeholder', 'Public'];
const matrix = [
  ['View dashboard, map and stations', [1, 1, 1, 1]],
  ['Run trend and extreme-event analysis', [1, 1, 1, 1]],
  ['Browse individual readings', [1, 1, 1, 0]],
  ['Export data to CSV', [1, 1, 1, 0]],
  ['View reports and data quality', [1, 1, 1, 0]],
  ['Add, edit and import data', [1, 1, 0, 0]],
  ['Manage stations', [1, 1, 0, 0]],
  ['Prepare and publish alerts and bulletins', [1, 1, 0, 0]],
  ['Manage users and roles', [1, 0, 0, 0]],
  ['Read the audit log', [1, 0, 0, 0]],
];

const trust = [
  { icon: Lock, title: 'Passwords protected', text: 'Hashed with bcrypt, never stored in plain text.' },
  { icon: ShieldCheck, title: 'Request protection', text: 'A CSRF token guards every change and every query is parameterised.' },
  { icon: KeyRound, title: 'Brute-force lockout', text: 'Five failed sign-ins pause an address for 15 minutes.' },
  { icon: Gauge, title: 'Server-side permissions', text: 'Roles are checked on the server, not just hidden in the interface.' },
];

const roadmap = [
  { title: 'Automated satellite and model feeds', text: 'Data can be labelled by origin today. Scheduled pulls from external providers are not built yet.' },
  { title: 'Password reset by email', text: 'Self-service recovery. For now an administrator resets passwords.' },
  { title: 'Public data API', text: 'Keyed access for partner systems.' },
  { title: 'Offline data entry', text: 'Record observations without a connection and sync later.' },
  { title: 'Two-factor sign-in', text: 'An extra check for administrators and analysts.' },
];

const faqs = [
  ['Who is CDIMS for?', 'It is built for the Zambia Meteorology Department and the agencies, researchers and planners who rely on its climate information.'],
  ['How do I get data into the system?', 'Analysts and administrators can add a reading by hand or import a CSV. Dates, decimal commas and units are standardised, and every problem is reported by line number.'],
  ['Is the data on the dashboard real?', 'Demonstration installs contain generated sample readings, clearly labelled as such. Importing real observations replaces the sample view.'],
  ['How do I get access?', 'Create an account. New accounts start with read-only access to the dashboard, and an administrator can then grant additional permissions.'],
  ['Does it work on a phone?', 'Yes. CDIMS is designed mobile-first, can be installed to the home screen like an app, and shows a clear banner if the connection drops.'],
  ['How accurate are the trend figures?', 'Trends are straight-line fits to the selected period. Records shorter than 30 years are indicative only, which the Analysis page reminds you.'],
];

/* ---------- small illustrations used in the bento grid ---------- */
function Spark({ d, id, colour = 'var(--chart-1)' }) {
  return (
    <svg viewBox="0 0 200 70" className="lp-spark" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.45" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L200,70 L0,70 Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={colour} strokeWidth="2.5" strokeLinecap="round" pathLength="1" className="lp-draw" />
    </svg>
  );
}

// Menu entries, and which page section highlights which entry (security belongs under "Access")
const NAV = [['platform', 'Platform'], ['tour', 'Tour'], ['how', 'How it works'], ['usecases', 'Use cases'], ['access', 'Access'], ['faq', 'FAQ']];
const SPY = { platform: 'platform', tour: 'tour', how: 'how', usecases: 'usecases', access: 'access', trust: 'access', faq: 'faq' };

const MAP_DOTS = [[22, 40], [38, 26], [52, 58], [64, 34], [30, 66], [76, 62], [48, 30], [82, 44], [58, 76], [18, 62]];

function Tour() {
  const [active, setActive] = useState(tour[0].id);
  const current = tour.find((t) => t.id === active);
  return (
    <div className="tour">
      <div className="tour-tabs" role="tablist" aria-label="Product tour">
        {tour.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={id === active} className={id === active ? 'on' : ''} onClick={() => setActive(id)}>
            <Icon size={17} /> <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="tour-panel" key={current.id} role="tabpanel">
        <div>
          <h3>{current.title}</h3>
          <p>{current.text}</p>
          <ul className="ticks">
            {current.points.map((pt) => <li key={pt}><CheckCircle2 size={16} /> {pt}</li>)}
          </ul>
        </div>
        <div className="tour-art" aria-hidden="true">
          <current.icon size={64} />
          <i /><i /><i />
        </div>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, children }) {
  return (
    <Reveal className="lp-head">
      <span className="lp-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </Reveal>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState('');

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      setScrolled(h.scrollTop > 24);
      setProgress(h.scrollHeight - h.clientHeight > 0 ? h.scrollTop / (h.scrollHeight - h.clientHeight) : 0);
      if (h.scrollTop < 240) setActive(''); // still in the hero
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy: the section crossing the middle of the viewport is the current one
  useEffect(() => {
    const els = Object.keys(SPY).map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(SPY[e.target.id]); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Keep the active chip centred in the mobile section bar
  useEffect(() => {
    const bar = document.querySelector('.lp-subnav');
    const chip = bar?.querySelector('a.on');
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [active]);

  if (user) return <Navigate to="/app" replace />;

  return (
    <div className="lp">
      <div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />

      <header className={`lp-nav ${scrolled ? 'solid' : ''}`}>
        <div className="lp-nav-in">
          <a href="#top" className="lp-brand"><span className="lp-logo"><CloudSun size={20} /></span> CDIMS</a>
          <nav className="lp-links" aria-label="Sections">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>{label}</a>
            ))}
            <Link to="/bulletins" className="lp-pub-link">Public bulletins</Link>
          </nav>
          <div className="lp-actions">
            <ThemeToggle className="lp-theme" />
            <InstallButton className="btn ghost install-nav" />
            <Link to="/login" className="btn ghost lp-signin">Sign in</Link>
            <Link to="/register" className="btn lp-cta">Get started</Link>
          </div>
        </div>
        <nav className="lp-subnav" aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>{label}</a>
          ))}
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero" id="top">
        <div className="lp-alerts-wrap"><ActiveAlerts variant="landing" /></div>
        <div className="lp-grid-bg" aria-hidden="true" />
        <span className="lp-orb o1" aria-hidden="true" /><span className="lp-orb o2" aria-hidden="true" />
        <div className="lp-hero-in">
          <div className="lp-hero-copy">
            <span className="lp-pill"><i /> Built for the Zambia Meteorology Department</span>
            <h1>Climate data you can <em>trust</em>, in one place.</h1>
            <p>
              CDIMS brings station observations, quality control, analysis and reporting into a single validated system,
              replacing scattered spreadsheets with a record the whole country can rely on.
            </p>
            <div className="lp-buttons">
              <Link to="/login" className="btn lg lp-primary">Open the dashboard <ArrowRight size={18} /></Link>
              <a href="#tour" className="btn lg lp-glass">Take the tour</a>
            </div>
            <ul className="lp-points">
              <li><Check size={15} /> Validated on entry</li>
              <li><Check size={15} /> Works on phone and desktop</li>
              <li><Check size={15} /> Role-based access</li>
            </ul>
          </div>
          <div className="lp-hero-visual">
            <HeroPreview />
            <div className="lp-float f1"><span className="dotc heat"><Flame size={14} /></span><div><b>Heat alerts</b><small>Flagged from 35 °C</small></div></div>
            <div className="lp-float f2"><span className="dotc ok"><ShieldCheck size={14} /></span><div><b>Quality checked</b><small>Outliers flagged on entry</small></div></div>
          </div>
        </div>

        <div className="lp-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <div className="lp-fact-v"><CountUp to={f.value} /></div>
              <div className="lp-fact-l">{f.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- bento ---------- */}
      <section className="lp-section" id="platform">
        <SectionHead eyebrow="The platform" title="Everything the climate record needs, in one system">
          From first observation to shared report. No more stitching together files, scripts and emails.
        </SectionHead>
        <div className="bento">
          <Reveal className="bt bt-wide bt-dash">
            <div className="bt-text"><span className="bt-ico"><LayoutDashboard size={18} /></span><h3>Live dashboard</h3>
              <p>Thirty-day indicators, twelve-month charts and extreme-event alerts, filterable to any station.</p></div>
            <div className="bt-art">
              <Spark id="s1" d="M0,50 C25,46 40,20 70,28 C100,36 120,12 150,22 C170,28 185,18 200,10" />
              <Spark id="s2" colour="var(--chart-2)" d="M0,58 C30,55 55,40 85,44 C115,48 140,32 170,36 C185,38 195,30 200,28" />
            </div>
          </Reveal>

          <Reveal className="bt bt-quality" delay={80}>
            <span className="bt-ico"><ShieldCheck size={18} /></span><h3>Automatic quality control</h3>
            <p>Out-of-range values are rejected. Unusual ones are flagged. Gaps are found.</p>
            <ul className="bt-list">
<li><span className="pill ok">OK</span> A normal reading</li>
              <li><span className="pill heat">Suspect</span> 45 °C where 31 °C is usual</li>
              <li><span className="pill rain">Estimated</span> A missing day, interpolated</li>
            </ul>
          </Reveal>

          <Reveal className="bt bt-map" delay={120}>
            <span className="bt-ico"><MapPin size={18} /></span><h3>Station map</h3>
            <p>See the whole network, coloured by recent conditions.</p>
            <div className="bt-dots" aria-hidden="true">
              {MAP_DOTS.map(([x, y], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.25}s` }} />)}
            </div>
          </Reveal>

          <Reveal className="bt bt-import" delay={60}>
            <span className="bt-ico"><FileUp size={18} /></span><h3>Import in any format</h3>
            <p>Day-first dates, decimal commas, °F, km/h and inches are converted for you.</p>
            <div className="bt-chips"><span>14/10/2026</span><span>86 °F → 30 °C</span><span>18 km/h → 5 m/s</span><span>0,5 in → 12.7 mm</span></div>
          </Reveal>

          <Reveal className="bt bt-analysis" delay={100}>
            <span className="bt-ico"><LineChart size={18} /></span><h3>Trends and probabilities</h3>
            <p>Linear trend per year, station comparison, and how often a threshold is reached.</p>
            <Spark id="s3" colour="var(--chart-3)" d="M0,55 C30,50 50,48 80,38 C110,28 140,34 170,18 C185,10 195,12 200,8" />
          </Reveal>

          <Reveal className="bt bt-access" delay={140}>
            <span className="bt-ico"><Users size={18} /></span><h3>Role-based access</h3>
            <p>Four roles, enforced on the server, with a permanent audit log.</p>
            <div className="bt-chips"><span>Admin</span><span>Analyst</span><span>Stakeholder</span><span>Public</span></div>
          </Reveal>

          <Reveal className="bt bt-wide bt-mobile" delay={80}>
            <div className="bt-text"><span className="bt-ico"><Smartphone size={18} /></span><h3>Installable and mobile-first</h3>
              <p>Add it to a phone’s home screen, work with a bottom bar and drawer on small screens, and switch between light and dark themes.</p></div>
            <div className="bt-phone" aria-hidden="true"><i /><i /><i /><b /></div>
          </Reveal>
        </div>

        <Reveal className="lp-elements">
          <span className="lp-eyebrow">Elements and accepted ranges</span>
          <div>
            {elements.map(({ icon: Icon, title, range }) => (
              <span key={title} className="el-chip"><Icon size={16} /> <b>{title}</b> <em>{range}</em></span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- tour ---------- */}
      <section className="lp-section alt" id="tour">
        <SectionHead eyebrow="Product tour" title="Four areas, one consistent experience" />
        <Reveal><Tour /></Reveal>
      </section>

      {/* ---------- how ---------- */}
      <section className="lp-section" id="how">
        <SectionHead eyebrow="How it works" title="From the weather station to a decision" />
        <ol className="lp-steps">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 120}>
              <span className="lp-step-n">{i + 1}</span>
              <span className="lp-step-i"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- use cases ---------- */}
      <section className="lp-section alt" id="usecases">
        <SectionHead eyebrow="Use cases" title="Built for the sectors that depend on climate">
          Reliable records underpin decisions well beyond the weather office.
        </SectionHead>
        <div className="lp-cases">
          {useCases.map(({ icon: Icon, title, text }, i) => (
            <Reveal className="lp-case" key={title} delay={(i % 3) * 90}>
              <span className="lp-case-i"><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- access ---------- */}
      <section className="lp-section" id="access">
        <SectionHead eyebrow="Access control" title="The right access for every user">
          Permissions are enforced on the server, not just hidden in the interface.
        </SectionHead>
        <Reveal className="card matrix-card">
          <div className="table-wrap">
            <table className="matrix">
              <thead>
                <tr><th>What users can do</th>{roles.map((r) => <th key={r} className="center">{r}</th>)}</tr>
              </thead>
              <tbody>
                {matrix.map(([label, flags]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {flags.map((on, i) => (
                      <td key={i} className="center">
                        {on ? <Check size={18} className="yes" aria-label="Allowed" /> : <Minus size={18} className="no" aria-label="Not allowed" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      {/* ---------- security (dark band) ---------- */}
      <section className="lp-dark" id="trust">
        <div className="lp-section">
          <SectionHead eyebrow="Security" title="Climate records are national assets. Protected at every layer." />
          <div className="lp-trust">
            {trust.map(({ icon: Icon, title, text }, i) => (
              <Reveal className="lp-trust-i" key={title} delay={i * 90}>
                <span><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- roadmap + faq ---------- */}
      <section className="lp-section" id="faq">
        <div className="lp-two">
          <div id="roadmap">
            <SectionHead eyebrow="Roadmap" title="What is coming next">Planned improvements. These are not available yet.</SectionHead>
            <div className="lp-road">
              {roadmap.map(({ title, text }, i) => (
                <Reveal key={title} delay={i * 70} className="lp-road-i">
                  <CircleDashed size={18} />
                  <div><strong>{title}</strong><p>{text}</p></div>
                </Reveal>
              ))}
            </div>
          </div>
          <div>
            <SectionHead eyebrow="FAQ" title="Questions, answered" />
            <div className="faq lp-faq">
              {faqs.map(([q, a]) => (
                <details key={q}><summary>{q}<Plus size={18} /></summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="lp-final">
        <Reveal className="lp-final-in">
          <h2>Start working with the national climate record</h2>
          <p>Sign in to explore the dashboard, or create an account to request access.</p>
          <div className="lp-buttons" style={{ justifyContent: 'center' }}>
            <Link to="/login" className="btn lg lp-primary">Sign in <ArrowRight size={18} /></Link>
            <Link to="/register" className="btn lg lp-glass">Create account</Link>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-in">
          <div>
            <a href="#top" className="lp-brand"><span className="lp-logo"><CloudSun size={20} /></span> CDIMS</a>
            <p>Climate Data Integration and Management System for the Zambia Meteorology Department.</p>
          </div>
          <div><h4>Platform</h4><a href="#platform">Features</a><a href="#tour">Product tour</a><a href="#usecases">Use cases</a><a href="#trust">Security</a></div>
          <div><h4>Account</h4><Link to="/login">Sign in</Link><Link to="/register">Create account</Link><a href="#access">Roles and access</a><a href="#faq">FAQ</a></div>
          <div><h4>About</h4><p>A Bachelor of Information Technology research project, School of Engineering, Information and Communications University, Lusaka.</p></div>
        </div>
        <div className="lp-footer-base">© {new Date().getFullYear()} Zambia Meteorology Department · CDIMS</div>
      </footer>
    </div>
  );
}
