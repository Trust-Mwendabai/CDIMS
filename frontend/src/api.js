import { kvGet, kvSet } from './offline/db';

// The API lives next to the app, under the same base path ("/api" or "/CDIMS/api"), set at build time
const APP_BASE = import.meta.env.BASE_URL;
const BASE = `${APP_BASE}api`;
let csrf = '';

export const setCsrf = (t) => { csrf = t || csrf; };

export class ApiError extends Error {
  constructor(message, status, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter; // seconds, from a 429 response
  }
}

// Calls that are not "the user doing something" (polling, offline sync) must not keep an idle session alive
async function request(path, { method = 'GET', json, form, background = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (background) headers['X-Background'] = '1';
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;

  let res;
  try {
    res = await fetch(`${BASE}/${path}`, { method, headers, body, credentials: 'same-origin' });
  } catch {
    // fetch rejects only when the request never reached the server: no connection, or the server is down
    throw new ApiError('You appear to be offline.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server ended the session: tell the app so it can return to sign-in (login attempts themselves are not "expiry")
    if (res.status === 401 && !path.startsWith('auth/login')) window.dispatchEvent(new CustomEvent('cdims-unauthorized'));
    throw new ApiError(data.error || 'Request failed.', res.status, Number(res.headers.get('Retry-After')) || 0);
  }
  if (data.csrf) csrf = data.csrf;
  return data;
}

/** True when a request failed because there is no connection (as opposed to the server rejecting it). */
export const isNetworkError = (e) => e instanceof ApiError && e.status === 0;

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== '' && v != null && p.set(k, v));
  return p.toString();
};

export const api = {
  me: (opts) => request('auth/me', opts),
  sessions: () => request('auth/sessions'),
  revokeSession: (handle) => request('auth/sessions/revoke', { method: 'POST', json: { handle } }),
  unlockUser: (id) => request('users/unlock', { method: 'POST', json: { id } }),
  checkPassword: (payload) => request('auth/password-check', { method: 'POST', json: payload }),
  login: (identifier, password) => request('auth/login', { method: 'POST', json: { identifier, password } }),
  register: (payload) => request('auth/register', { method: 'POST', json: payload }),
  logout: () => request('auth/logout', { method: 'POST', json: {} }),
  signOutEverywhere: () => request('auth/signout-all', { method: 'POST', json: {} }),
  saveProfile: (payload) => request('auth/profile', { method: 'POST', json: payload }),
  savePreferences: (payload) => request('auth/preferences', { method: 'POST', json: payload }),
  updateReading: (payload) => request('readings/update', { method: 'POST', json: payload }),
  deleteReading: (id) => request('readings/delete', { method: 'POST', json: { id } }),
  createStation: (payload) => request('stations', { method: 'POST', json: payload }),
  updateStation: (payload) => request('stations/update', { method: 'POST', json: payload }),
  report: (params) => request(`reports/summary?${qs(params)}`),
  quality: () => request('reports/quality'),
  compare: (params) => request(`reports/compare?${qs(params)}`),
  gaps: (params) => request(`quality/gaps?${qs(params)}`),
  scanQuality: () => request('quality/scan', { method: 'POST', json: {} }),
  estimateGaps: (station, max_gap) => request('quality/estimate', { method: 'POST', json: { station: Number(station), max_gap } }),
  extremes: (params) => request(`analysis/extremes?${qs(params)}`),
  stationHistory: (code) => request(`stations/history?${qs({ code })}`),
  systemHealth: () => request('system/health'),
  systemExportUrl: (table) => `${BASE}/system/export?${qs({ table })}`,
  audit: (params = {}) => request(`audit?${qs(params)}`),
  resetPassword: (id, password) => request('users/reset-password', { method: 'POST', json: { id, password } }),
  templateUrl: `${BASE}/readings/template`,
  changePassword: (current, next) => request('auth/password', { method: 'POST', json: { current, new: next } }),
  analysis: (params) => request(`analysis?${qs(params)}`),
  // Public warnings and bulletins (no sign-in needed)
  publicAlerts: (opts) => request('public/alerts', opts),
  publicAlert: (id) => request(`public/alert?${qs({ id })}`),
  publicBulletins: (params = {}) => request(`public/bulletins?${qs(params)}`),
  publicBulletin: (id) => request(`public/bulletin?${qs({ id })}`),
  feedUrl: `${BASE}/public/feed.xml`,
  capUrl: (id) => `${BASE}/public/alert.cap?id=${id}`,
  // Staff: manage alerts and bulletins
  alertsAdmin: (params = {}) => request(`alerts/admin?${qs(params)}`),
  checkRules: () => request('alerts/generate', { method: 'POST', json: {} }),
  createAlert: (p) => request('alerts/create', { method: 'POST', json: p }),
  updateAlert: (p) => request('alerts/update', { method: 'POST', json: p }),
  publishAlert: (id) => request('alerts/publish', { method: 'POST', json: { id } }),
  cancelAlert: (id, reason) => request('alerts/cancel', { method: 'POST', json: { id, reason } }),
  deleteAlert: (id) => request('alerts/delete', { method: 'POST', json: { id } }),
  thresholds: () => request('alerts/thresholds'),
  saveThresholds: (thresholds) => request('alerts/thresholds', { method: 'POST', json: { thresholds } }),
  bulletinsAdmin: (params = {}) => request(`bulletins/admin?${qs(params)}`),
  bulletinAdmin: (id) => request(`bulletins/get?${qs({ id })}`),
  generateBulletin: (kind, date) => request('bulletins/generate', { method: 'POST', json: { kind, date: date || undefined } }),
  updateBulletin: (p) => request('bulletins/update', { method: 'POST', json: p }),
  publishBulletin: (id) => request('bulletins/publish', { method: 'POST', json: { id } }),
  unpublishBulletin: (id) => request('bulletins/unpublish', { method: 'POST', json: { id } }),
  deleteBulletin: (id) => request('bulletins/delete', { method: 'POST', json: { id } }),
  weatherCurrent: () => request('weather/current', { background: true }),
  weatherForecast: (station) => request(`weather/forecast?${qs({ station })}`, { background: true }),
  dashboard: (params = {}) => request(`dashboard?${qs(params)}`),
  // The station list is remembered on the device so entry forms still work offline
  stations: async () => {
    try {
      const d = await request('stations');
      kvSet('stations', d.stations);
      return d;
    } catch (e) {
      if (isNetworkError(e)) {
        const cached = await kvGet('stations');
        if (cached) return { stations: cached, cached: true };
      }
      throw e;
    }
  },
  syncBatch: (items) => request('readings/batch', { method: 'POST', json: { items }, background: true }),
  readings: (params) => request(`readings?${qs(params)}`),
  addReading: (payload) => request('readings', { method: 'POST', json: payload }),
  /** opts: { dryRun, mapping } - a dry run validates everything and saves nothing. */
  importReadings: (file, origin = 'station', units = {}, opts = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('origin', origin);
    Object.entries(units).forEach(([k, v]) => v && form.append(k, v));
    if (opts.dryRun) form.append('dry_run', '1');
    if (opts.mapping && Object.keys(opts.mapping).length) form.append('mapping', JSON.stringify(opts.mapping));
    return request('readings/import', { method: 'POST', form });
  },
  exportUrl: (params) => `${BASE}/readings/export?${qs(params)}`,
  users: () => request('users'),
  createUser: (payload) => request('users/create', { method: 'POST', json: payload }),
  updateUser: (payload) => request('users/update', { method: 'POST', json: payload }),
};
