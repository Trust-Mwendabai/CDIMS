import { AlertTriangle, Baby, CarFront, CloudRain, Droplets, Flame, Home, Phone, Radio, Shirt, Snowflake, Sun, Users, Waves, Wind } from 'lucide-react';

export const SEVERITY = {
  advisory: { label: 'Advisory', hint: 'Be aware' },
  watch: { label: 'Watch', hint: 'Be prepared' },
  warning: { label: 'Warning', hint: 'Take action' },
};

const HAZARD_ICON = { heat: Flame, cold: Snowflake, heavy_rain: CloudRain, flood: Droplets, drought: Sun, dry_spell: Sun, strong_wind: Wind, other: AlertTriangle };
export const hazardIcon = (h) => HAZARD_ICON[h] || AlertTriangle;

export const fmtWhen = (d) => (d ? new Date(d.replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const fmtLong = (d) => (d ? new Date(d.replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function SeverityBadge({ severity }) {
  return <span className={`sev-badge sev-${severity}`}>{SEVERITY[severity]?.label || severity}</span>;
}

/** One alert as a card. `compact` shows only the headline, otherwise the message and advice too. */
export function AlertCard({ alert, compact = false, onOpen, hideAdvice = false }) {
  const Icon = hazardIcon(alert.hazard);
  return (
    <article className={`alert-card sev-${alert.severity} ${alert.status === 'cancelled' ? 'cancelled' : ''}`}>
      <span className="alert-ico"><Icon size={22} /></span>
      <div className="alert-body">
        <div className="alert-top">
          <SeverityBadge severity={alert.severity} />
          <span className="alert-type">{alert.hazard_label}</span>
          {alert.status === 'cancelled' && <span className="badge danger">Cancelled</span>}
          {alert.expired && <span className="badge">Ended</span>}
        </div>
        <h3>{onOpen ? <a href={`#alert-${alert.id}`} onClick={(e) => { e.preventDefault(); onOpen(alert); }}>{alert.title}</a> : alert.title}</h3>
        <p className="alert-meta">
          {alert.areas.map((a) => a.name).join(', ')} · until {fmtWhen(alert.expires_at)}
        </p>
        {!compact && <p className="alert-msg">{alert.message}</p>}
        {!compact && !hideAdvice && alert.advice && <p className="alert-advice"><b>What to do:</b> {alert.advice}</p>}
      </div>
    </article>
  );
}

export function DemoBanner({ show }) {
  if (!show) return null;
  return (
    <div className="demo-banner" role="note">
      <AlertTriangle size={16} />
      <span><b>Demonstration data.</b> This installation uses generated sample data. Its bulletins and alerts are examples and must not be used for real decisions.</span>
    </div>
  );
}

const LEVELS = [
  { key: 'normal', label: 'Normal', hint: 'No action' },
  { key: 'advisory', label: 'Advisory', hint: 'Be aware' },
  { key: 'watch', label: 'Watch', hint: 'Be prepared' },
  { key: 'warning', label: 'Warning', hint: 'Take action' },
];

/** Four-step gauge showing where this alert sits between normal conditions and the highest level used. */
export function SeverityScale({ severity }) {
  const at = LEVELS.findIndex((l) => l.key === severity);
  return (
    <div className="sev-scale" role="img" aria-label={`Severity: ${SEVERITY[severity]?.label || severity}, level ${at} of 3`}>
      <ol>
        {LEVELS.map((l, i) => (
          <li key={l.key} className={`lv-${l.key} ${i === at ? 'on' : ''} ${i < at ? 'past' : ''}`}>
            <span className="bar" />
            <b>{l.label}</b>
            <small>{l.hint}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TIPS = [
  [/water|hydrat|drink|fluid/i, Droplets],
  [/indoor|shade|cool|inside|shelter|stay (at )?home/i, Home],
  [/elder|child|infant|vulnerable|baby|babies|sick|pregnan/i, Users],
  [/livestock|animal|pet/i, Baby],
  [/clothing|clothes|light|loose|hat/i, Shirt],
  [/flood|river|stream|low-lying|drain/i, Waves],
  [/road|driv|vehicle|travel/i, CarFront],
  [/radio|listen|official|instruction|authorit|follow|update/i, Radio],
  [/sun|heat|midday|outdoor/i, Sun],
  [/wind|tree|roof|loose objects/i, Wind],
  [/frost|cold|warm|blanket/i, Snowflake],
];

/** Splits the advice into short actions, each with an icon, for quick reading on a phone. */
export function AdviceList({ advice }) {
  const items = String(advice || '').split(/(?<=[.!])\s+/)
    .flatMap((s) => s.split(/(?:,\s+)?(?:and\s+)?(?=(?:never|avoid|check on|keep|stay|drink|wear|follow|listen|move|do not))/i))
    .map((s) => s.trim().replace(/^./, (m) => m.toUpperCase()).replace(/[.!]?$/, '.'))
    .filter((s) => s.length > 3);
  if (!items.length) return null;
  return (
    <section className="advice-box" aria-labelledby="advice-h">
      <h2 id="advice-h">What to do</h2>
      <ul>
        {items.map((t) => {
          const Icon = (TIPS.find(([re]) => re.test(t)) || [null, AlertTriangle])[1];
          return <li key={t}><span><Icon size={18} /></span><p>{t}</p></li>;
        })}
      </ul>
    </section>
  );
}

export function EmergencyContacts({ contacts }) {
  if (!contacts?.length) return null;
  return (
    <section className="contacts-box" aria-labelledby="contacts-h">
      <h2 id="contacts-h"><Phone size={16} /> In an emergency</h2>
      <ul>
        {contacts.map((c) => (
          <li key={c.label}><span>{c.label}</span><a href={`tel:${c.number.replace(/[^+0-9]/g, '')}`}>{c.number}</a></li>
        ))}
      </ul>
    </section>
  );
}
