import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const COLOUR = { advisory: '#eab308', watch: '#f97316', warning: '#dc2626' };

/** Small map of the stations an alert covers, so readers can see whether they are inside the area. */
export default function AlertMap({ areas, severity }) {
  const el = useRef(null);
  useEffect(() => {
    const pts = areas.filter((a) => a.lat != null && a.lng != null);
    if (!el.current || !pts.length) return undefined;
    const map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© OpenStreetMap' }).addTo(map);
    const colour = COLOUR[severity] || COLOUR.watch;
    const group = L.featureGroup(pts.map((a) => {
      L.circle([a.lat, a.lng], { radius: 40000, color: colour, weight: 1, fillColor: colour, fillOpacity: 0.15 }).addTo(map);
      return L.circleMarker([a.lat, a.lng], { radius: 8, color: '#fff', weight: 2, fillColor: colour, fillOpacity: 1 })
        .bindTooltip(`${a.name}${a.province ? `, ${a.province}` : ''}`, { permanent: pts.length <= 3, direction: 'top' });
    })).addTo(map);
    map.fitBounds(group.getBounds().pad(0.6), { maxZoom: 8 });
    return () => map.remove();
  }, [areas, severity]);

  if (!areas.some((a) => a.lat != null)) return null;
  return (
    <figure className="alert-map">
      <div ref={el} role="img" aria-label={`Map of affected areas: ${areas.map((a) => a.name).join(', ')}`} />
      <figcaption>Shaded circles show about 40 km around each station named in this alert. Conditions can differ nearby.</figcaption>
    </figure>
  );
}
