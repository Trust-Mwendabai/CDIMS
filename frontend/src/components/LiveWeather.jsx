import { useCallback, useEffect, useState } from 'react';
import { CloudRain, Droplets, Navigation, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import WeatherIcon, { ago, compass } from './WeatherIcon';

const REFRESH_MS = 10 * 60 * 1000; // matches the server cache; the source itself updates every 15 minutes
const dayName = (d, i) => (i === 0 ? 'Today' : new Date(`${d}T12:00:00`).toLocaleDateString('en', { weekday: 'short' }));
const hourLabel = (t) => new Date(t).toLocaleTimeString('en', { hour: 'numeric' });

/**
 * Live conditions for every station plus a 7-day forecast for one of them.
 * Values are modelled for each station's coordinates by Open-Meteo, not ZMD observations, and are never stored.
 */
export default function LiveWeather({ stationId }) {
  const { user } = useAuth();
  const [now, setNow] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const [fcStation, setFcStation] = useState('');
  const [forecast, setForecast] = useState(null);
  const [fcError, setFcError] = useState('');

  const load = useCallback(async (manual = false) => {
    if (manual) setBusy(true);
    try {
      const d = await api.weatherCurrent();
      setNow(d);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // First load, then refresh every 10 minutes and whenever the tab becomes visible again
  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // Keep "updated 3 min ago" honest
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Choose the forecast station: the dashboard filter, else the user's default, else the first station
  useEffect(() => {
    if (!now?.stations.length) return;
    const wanted = stationId || user.preferences?.default_station;
    setFcStation((cur) => {
      if (stationId) return String(stationId);
      if (cur && now.stations.some((s) => String(s.id) === cur)) return cur;
      return String(wanted && now.stations.some((s) => s.id === Number(wanted)) ? wanted : now.stations[0].id);
    });
  }, [now, stationId, user.preferences?.default_station]);

  useEffect(() => {
    if (!fcStation) return undefined;
    let live = true;
    setForecast(null);
    setFcError('');
    api.weatherForecast(fcStation).then((d) => live && setForecast(d)).catch((e) => live && setFcError(e.message));
    return () => { live = false; };
  }, [fcStation]);

  if (error && !now) {
    return (
      <div className="card live-card">
        <div className="live-head"><h3><span className="live-dot off" /> Live conditions</h3></div>
        <p className="sec-text">{error} The climate record below is unaffected.</p>
        <button className="btn ghost" onClick={() => load(true)} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''} /> Try again</button>
      </div>
    );
  }
  if (!now) return <div className="card live-card"><div className="empty"><span className="spinner" /></div></div>;

  const { summary, stations } = now;
  const focus = stationId ? stations.find((s) => s.id === Number(stationId)) : null;
  const shownStations = focus ? [focus] : stations;
  const hero = focus
    ? { label: focus.name, temp: focus.temperature, humidity: focus.humidity, wind: focus.wind_ms, rain: focus.rain_mm, icon: focus.icon, condition: focus.condition, feels: focus.feels_like, dir: focus.wind_dir }
    : { label: 'Zambia average', temp: summary?.avg_temp, humidity: summary?.avg_humidity, wind: summary?.avg_wind, rain: null, icon: stations[0]?.icon, condition: null };

  return (
    <div className="card live-card">
      <div className="live-head">
        <div>
          <h3><span className={`live-dot ${now.stale ? 'off' : ''}`} /> Live conditions</h3>
          <small className="muted">
            {now.stale ? 'Showing the last update, the weather service is unreachable' : 'Updated'} {ago(now.updated_at, tick)}
            {' '}· refreshes every 10 minutes
          </small>
        </div>
        <button className="btn ghost compact" onClick={() => load(true)} disabled={busy} aria-label="Refresh live conditions">
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="live-hero">
        <div className="live-now">
          <WeatherIcon kind={hero.icon} size={54} />
          <div>
            <div className="live-temp">{hero.temp != null ? `${Math.round(hero.temp * 10) / 10}°C` : '—'}</div>
            <div className="live-label">{hero.label}{hero.condition ? ` · ${hero.condition}` : ''}</div>
            {hero.feels != null && <small className="muted">Feels like {hero.feels}°C</small>}
          </div>
        </div>
        <div className="live-stats">
          <div><Droplets size={16} /><b>{hero.humidity != null ? `${Math.round(hero.humidity)}%` : '—'}</b><small>Humidity</small></div>
          <div><Wind size={16} /><b>{hero.wind != null ? `${hero.wind} m/s` : '—'}</b><small>Wind {compass(hero.dir)}</small></div>
          {focus
            ? <div><CloudRain size={16} /><b>{focus.rain_mm != null ? `${focus.rain_mm} mm` : '—'}</b><small>Rain now</small></div>
            : <div><CloudRain size={16} /><b>{summary ? `${summary.raining} of ${summary.count}` : '—'}</b><small>Stations with rain</small></div>}
          {!focus && summary?.hottest && <div><Thermometer size={16} /><b>{summary.hottest.temperature}°C</b><small>Hottest: {summary.hottest.name}</small></div>}
          {!focus && summary?.coldest && <div><Thermometer size={16} className="cold" /><b>{summary.coldest.temperature}°C</b><small>Coolest: {summary.coldest.name}</small></div>}
        </div>
      </div>

      {!focus && (
        <div className="live-stations" role="list">
          {shownStations.map((s) => (
            <button key={s.id} role="listitem" className={`live-st ${String(s.id) === fcStation ? 'on' : ''}`} onClick={() => setFcStation(String(s.id))}
              title={`${s.name}: ${s.condition}. Click to show its forecast.`}>
              <WeatherIcon kind={s.icon} size={22} />
              <span><b>{s.temperature != null ? `${Math.round(s.temperature)}°` : '—'}</b><small>{s.name}</small></span>
            </button>
          ))}
        </div>
      )}

      <div className="forecast">
        <div className="forecast-head">
          <h4>7-day forecast{forecast ? ` · ${forecast.station.name}` : ''}</h4>
          {!stationId && (
            <select className="input compact" aria-label="Forecast station" value={fcStation} onChange={(e) => setFcStation(e.target.value)}>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        {fcError && <p className="sec-text">{fcError}</p>}
        {!forecast && !fcError && <div className="empty" style={{ padding: 16 }}><span className="spinner" /></div>}
        {forecast && (
          <>
            <div className="fc-days">
              {forecast.daily.map((d, i) => (
                <div key={d.date} className={`fc-day ${i === 0 ? 'today' : ''}`} title={`${d.condition}. Wind up to ${d.wind_max} m/s`}>
                  <small>{dayName(d.date, i)}</small>
                  <WeatherIcon kind={d.icon} size={26} />
                  <b>{d.max != null ? `${Math.round(d.max)}°` : '—'}</b>
                  <span className="fc-min">{d.min != null ? `${Math.round(d.min)}°` : '—'}</span>
                  <span className="fc-rain"><Droplets size={11} /> {d.rain_chance != null ? `${d.rain_chance}%` : '—'}</span>
                </div>
              ))}
            </div>
            {forecast.hourly.length > 0 && (
              <div className="fc-hours" aria-label="Next 24 hours">
                {forecast.hourly.filter((_, i) => i % 3 === 0).map((h) => (
                  <div key={h.time}><small>{hourLabel(h.time)}</small><b>{h.temp != null ? `${Math.round(h.temp)}°` : '—'}</b><span><Droplets size={10} /> {h.rain_chance ?? 0}%</span></div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <p className="live-note">
        <Navigation size={13} /> Modelled conditions for each station's location from Open-Meteo, shown for situational awareness.
        They are not ZMD observations and are not stored in the climate record.
      </p>
    </div>
  );
}
