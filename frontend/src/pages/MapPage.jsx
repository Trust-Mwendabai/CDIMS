import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CloudRain, Radio, Thermometer } from 'lucide-react';
import { api } from '../api';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const METRICS = {
  temp: { label: 'Average temperature', unit: '°C', key: 'avg_temp', from: [56, 189, 248], to: [239, 68, 68], icon: Thermometer },
  rain: { label: 'Rainfall total', unit: 'mm', key: 'rainfall', from: [186, 230, 253], to: [29, 78, 216], icon: CloudRain },
  live: { label: 'Live temperature', unit: '°C', key: 'live_temp', from: [56, 189, 248], to: [239, 68, 68], icon: Radio },
};

export default function MapPage() {
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState('temp');
  const [error, setError] = useState('');
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const markers = useRef({});

  const [live, setLive] = useState(null);

  useEffect(() => { api.dashboard().then(setData).catch((e) => setError(e.message)); }, []);

  // Live conditions are optional: the map works without them, and they refresh every 10 minutes
  useEffect(() => {
    const load = () => api.weatherCurrent().then(setLive).catch(() => {});
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const m = METRICS[metric];
  const stations = useMemo(() => {
    const byId = new Map((live?.stations || []).map((w) => [w.id, w]));
    return (data?.stations || []).filter((s) => s.latitude != null).map((s) => {
      const w = byId.get(s.id);
      return { ...s, live_temp: w?.temperature ?? null, live_condition: w?.condition ?? null, live_wind: w?.wind_ms ?? null };
    });
  }, [data, live]);
  const range = useMemo(() => {
    const vals = stations.map((s) => Number(s[m.key])).filter((v) => !Number.isNaN(v));
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [stations, m]);

  const colour = (v) => {
    if (v == null || Number.isNaN(Number(v))) return '#94a3b8';
    const t = range.max === range.min ? 0.5 : (Number(v) - range.min) / (range.max - range.min);
    return rgb(lerp(m.from, m.to, t));
  };

  // Create the map once
  useEffect(() => {
    if (!el.current || map.current) return undefined;
    map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView([-13.3, 27.9], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, attribution: '© OpenStreetMap contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  // Redraw markers when data or metric changes
  useEffect(() => {
    if (!map.current || !stations.length) return;
    layer.current.clearLayers();
    markers.current = {};
    stations.forEach((s) => {
      const v = s[m.key];
      const active = s.status !== 'inactive';
      const mk = L.circleMarker([Number(s.latitude), Number(s.longitude)], {
        radius: 12, weight: 2, color: '#ffffff', fillColor: active ? colour(v) : '#94a3b8', fillOpacity: 0.92,
      }).bindPopup(
        `<strong>${esc(s.name)}</strong> <small>(${esc(s.code)})</small><br>${esc(s.province)}<br>` +
        `Avg temp: <b>${s.avg_temp != null ? `${s.avg_temp}°C` : '—'}</b><br>` +
        `Rainfall: <b>${s.rainfall != null ? `${s.rainfall} mm` : '—'}</b><br>` +
        `<small>Last 30 days${active ? '' : ' · station inactive'}</small>` +
        (s.live_temp != null ? `<hr style="border:0;border-top:1px solid #ddd;margin:6px 0">Now: <b>${s.live_temp}°C</b>, ${esc(s.live_condition)}` +
          `${s.live_wind != null ? `, wind ${s.live_wind} m/s` : ''}<br><small>Live, modelled (Open-Meteo)</small>` : ''),
      ).bindTooltip(`${esc(s.name)} · ${v != null ? `${v}${m.unit}` : '—'}`, { direction: 'top', offset: [0, -8] });
      mk.addTo(layer.current);
      markers.current[s.id] = mk;
    });
    map.current.fitBounds(stations.map((s) => [Number(s.latitude), Number(s.longitude)]), { padding: [40, 40], maxZoom: 7 });
  }, [stations, metric]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = (s) => {
    map.current.flyTo([Number(s.latitude), Number(s.longitude)], 8, { duration: 0.8 });
    markers.current[s.id]?.openPopup();
    el.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Station map</h1>
          <p>Where observations are collected, coloured by conditions over the last 30 days, or by live modelled temperature.</p>
        </div>
        <div className="seg" role="group" aria-label="Map metric">
          {Object.entries(METRICS).map(([k, v]) => (
            <label key={k} className={metric === k ? 'on' : ''}>
              <input type="radio" name="metric" checked={metric === k} onChange={() => setMetric(k)} />
              <v.icon size={15} /> {v.label}
            </label>
          ))}
        </div>
      </div>

      <div className="card map-card">
        <div ref={el} className="map" aria-label="Map of observation stations" />
        {stations.length > 0 && (
          <div className="map-legend">
            <span>{range.min}{m.unit}</span>
            <i style={{ background: `linear-gradient(90deg, ${rgb(m.from)}, ${rgb(m.to)})` }} />
            <span>{range.max}{m.unit}</span>
            <span className="legend-grey"><i className="grey" /> inactive or no data</span>
          </div>
        )}
      </div>

      <div className="cards map-list">
        {!data && <div className="empty"><span className="spinner" /></div>}
        {stations.map((s) => (
          <button key={s.id} className="card station-chip" onClick={() => focus(s)}>
            <span className="dot-lg" style={{ background: s.status === 'inactive' ? '#94a3b8' : colour(s[m.key]) }} />
            <span>
              <strong>{s.name}</strong>
              <small>{s.province} · {s[m.key] != null ? `${s[m.key]}${m.unit}` : 'no data'}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
