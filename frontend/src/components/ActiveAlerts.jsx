import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { SeverityBadge, hazardIcon } from './alerts';

/** Published weather alerts currently in force, shown at the top of the dashboard and on the landing page. */
export default function ActiveAlerts({ variant = 'app' }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const load = () => api.publicAlerts({ background: true }).then((d) => setAlerts(d.alerts)).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!alerts.length) return null;
  const worst = alerts.some((a) => a.severity === 'warning') ? 'warning' : alerts.some((a) => a.severity === 'watch') ? 'watch' : 'advisory';
  return (
    <div className={`active-alerts sev-${worst} ${variant}`} role="region" aria-label="Weather alerts in force">
      <div className="aa-head"><b>{alerts.length} weather alert{alerts.length > 1 ? 's' : ''} in force</b><Link to="/bulletins">Details <ArrowRight size={14} /></Link></div>
      <ul>
        {alerts.slice(0, 4).map((a) => {
          const Icon = hazardIcon(a.hazard);
          return (
            <li key={a.id}><Link to={`/alerts/${a.id}`}><Icon size={16} /> <SeverityBadge severity={a.severity} /> <span>{a.title}</span></Link></li>
          );
        })}
      </ul>
    </div>
  );
}
