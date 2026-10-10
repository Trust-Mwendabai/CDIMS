import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react';

const ICONS = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, storm: CloudLightning, snow: CloudSnow };
const TONES = { sun: '#f59e0b', partly: '#f59e0b', cloud: '#94a3b8', fog: '#94a3b8', drizzle: '#38bdf8', rain: '#2563eb', storm: '#7c3aed', snow: '#7dd3fc' };

/** Weather condition icon from the server's icon key. */
export default function WeatherIcon({ kind, size = 28, className = '' }) {
  const Icon = ICONS[kind] || Cloud;
  return <Icon size={size} className={className} style={{ color: TONES[kind] || '#94a3b8' }} aria-hidden="true" />;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => (deg == null ? '' : COMPASS[Math.round(deg / 22.5) % 16]);

/** "3 min ago" style label for the last update. */
export function ago(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}
