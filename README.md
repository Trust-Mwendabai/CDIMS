# Climate Data Integration and Management System (CDIMS)

A web platform for the Zambia Meteorology Department (ZMD) to store, validate, analyse, map and share daily station climate observations, and to publish public weather bulletins and alerts.

## Features

**Data**
- **Multi-source repository:** every reading records its *origin* (station, sensor, satellite or model) and *source* (manual, import, sample, estimated). Satellite and model data can be labelled and imported as files; automated feeds are not built.
- **Import wizard:** CSV and Excel files, automatic column matching with manual mapping, and a **validation preview** (valid rows, new vs replaced readings, line-numbered errors) before anything is saved. Accepts `YYYY-MM-DD` and day-first `DD/MM/YYYY` dates, decimal commas, comma/semicolon/tab files and `NA`/`-` markers, and converts °F/K, km/h/knots/mph and inches to °C, m/s and mm.
- **Offline-first field entry:** observations are queued on the device (IndexedDB) when there is no signal and sent automatically when it returns. Sending is idempotent, so a retry never duplicates a day.
- **Quality control:** values outside accepted ranges are rejected. Readings more than 4 standard deviations from a station's usual value for the month are flagged *suspect* (needs 30+ readings). Missing days are found per station, and short gaps (up to 5 days) can be estimated by interpolation. Rainfall is never estimated. Estimated readings are flagged and never used as the basis for other estimates.
- **Lineage and retention:** edits and deletions are logged. Deleted readings are hidden but kept (the view `active_readings` exposes only live rows).
- **Station metadata:** coordinates, elevation, status, year established, instruments, notes and a change history.

**Analysis and reporting**
- **Live weather:** current conditions for every active station and a 7-day plus next-24-hour forecast, refreshed every 10 minutes. Data comes from [Open-Meteo](https://open-meteo.com) (free, no API key), fetched and cached by the server, with the last good answer served for up to two hours if the service is unreachable. These are **modelled values for each station's coordinates, not ZMD observations**, and are never written to the climate record. The server needs outbound HTTPS access.
- **Dashboard:** 30-day indicators, 12-month temperature and rainfall charts, active alerts, station table.
- **Analysis:** mean, extremes and linear trend per year, station comparison, and the empirical probability that a threshold is reached, by month.
- **Station map** (OpenStreetMap tiles via Leaflet) and a regional **heatmap**.
- **Reports** for a calendar year or any custom range (up to 10 years), year-by-year comparison and a data-quality report, each downloadable as **PDF**, CSV or printed. Missing data is shown distinctly from a measured 0.

**Public warnings and bulletins**
- **Alerts:** threshold rules over observations and the 3-day forecast (heat, cold, heavy rain, flood, wind, dry spell, drought) create *draft* alerts. A person reviews and publishes; nothing goes public automatically. Thresholds are editable.
- **Bulletins:** daily and weekly bulletins generated from the stored data, with forecaster notes. Publish or unpublish.
- **Distribution:** public pages (`/bulletins`, `/alerts/:id`) that need no sign-in, **PDFs** formatted for news outlets, an **RSS** feed and standard **CAP 1.2** alert files.
- A cron job (`cron/generate.php`) prepares drafts every morning.

**People and security**
- Four roles with server-enforced permissions, an admin **Users** page (create, change role, disable, unlock, reset password), a permanent **audit log**, and a **System** page (health checks, record counts, CSV backups).
- Passwords: bcrypt, a policy enforced on the server (10+ characters, three character classes, no common passwords, no personal details) and a live strength meter.
- Sessions: tracked per browser, idle (60 min) and absolute (12 h) expiry, list and revoke your own sessions, sign out everywhere, a new session id at sign-in, sessions ended when the role or password changes.
- Abuse protection: database-backed rate limiting (global, per endpoint, per account), progressive account lockout, `Retry-After` on 429, CSRF token on every change, strict Content-Security-Policy and other security headers.
- **My account:** profile, avatar colour, theme, start page, default station, sidebar style, password change, unsaved-changes warning.
- An in-app **User guide** with a searchable contents overlay.

**Interface**
- React single-page app, mobile-first, with a pinned collapsible sidebar on desktop and a bottom bar plus drawer on phones, light and dark themes, pagination on long lists, toasts, a back-to-top button and a scroll-spy landing page.
- Installable **PWA** with an offline banner and sync status. The app shell is cached; climate data and the API responses are never cached (offline entries are queued separately).

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, React Router, Recharts, Leaflet, Lucide icons, jsPDF (`frontend/`) |
| Backend | PHP 8.1+ JSON API (`api/`, `includes/`, `config/`) |
| Database | MySQL 5.7+ / MariaDB 10.3+ (portable schema upgrades, one view for live readings) |

## Setup (XAMPP on Windows)

Requirements: XAMPP (Apache with `mod_rewrite`, MySQL, PHP 8.1+) and Node.js 18+.

1. Place the project in `C:\xampp\htdocs\CDIMS` and start **Apache** and **MySQL**.
2. Create or upgrade the database, stations and admin account:
   ```
   C:\xampp\php\php.exe setup.php
   ```
   Running it again is safe: it upgrades the schema and never overwrites existing data or users. Options:
   - `--no-seed` skip the sample readings
   - `--demo-users` also create demo accounts for the analyst, stakeholder and public roles
3. Build the frontend:
   ```
   cd frontend
   npm install
   npm run build
   ```
4. Open <http://localhost/CDIMS/> and sign in as `admin` (the password is printed by step 2, and kept in `LOGIN-DETAILS.md`).

Run `setup.php` again after pulling code changes that touch the database, then rebuild the frontend.

### Configuration

Defaults match a stock XAMPP install (`root`, no password, database `cdims_db`). Settings come from environment variables or from a `.env` file kept outside the web folder (see `deploy/env.example`):

`CDIMS_DB_HOST`, `CDIMS_DB_USER`, `CDIMS_DB_PASS`, `CDIMS_DB_NAME`, `CDIMS_ENV` (`production` hides PHP errors), `CDIMS_TIMEZONE`, `CDIMS_SESSION_IDLE_MIN`, `CDIMS_TRUST_PROXY`, `CDIMS_PUBLIC_URL`, `CDIMS_ORG_NAME`, `CDIMS_AUTO_PUBLISH_BULLETINS`, `CDIMS_ADMIN_PASSWORD`, `CDIMS_DEMO_PASSWORD`.

### Development

```
cd frontend
npm run dev      # http://localhost:5173/  (redirects to /CDIMS/); API calls are proxied to Apache
npm run build    # writes the production app to dist/
```

## Deploying to cPanel

```
node scripts/build-release.mjs                  # site at the domain root
node scripts/build-release.mjs --base=/cdims/   # site in a sub-folder
```

This produces `release/cdims-release.zip`: the public site, a private backend folder, a generated `.htaccess` (HTTPS redirect, security headers, blocked paths) and a web installer. **[DEPLOYMENT.md](DEPLOYMENT.md)** is the full step-by-step guide: database, PHP version, upload, `.env`, installer, cron, SSL, updates, backups, troubleshooting and a security checklist.

## Tests

```
C:\xampp\php\php.exe tests/run.php
```

Checks the password policy, date parsing, reading validation and the rate limiter. Exit code 1 on failure.

## Roles and permissions

| Permission | admin | analyst | stakeholder | public |
| --- | :-: | :-: | :-: | :-: |
| Dashboard, map, stations | ✓ | ✓ | ✓ | ✓ |
| Trend and extreme-event analysis | ✓ | ✓ | ✓ | ✓ |
| Browse readings, export CSV | ✓ | ✓ | ✓ | |
| Reports and data quality | ✓ | ✓ | ✓ | |
| Add, edit, delete, import data; QC scan; estimate gaps | ✓ | ✓ | | |
| Manage stations | ✓ | ✓ | | |
| Prepare and publish alerts and bulletins | ✓ | ✓ | | |
| Manage users, audit log, system page | ✓ | | | |

New registrations start as `public`. An admin changes roles on the **Users** page. The rules live in `User::PERMISSIONS` and the UI reads them from the signed-in user. Published bulletins and alerts are visible to everyone, signed in or not.

## Data

One row per station per day: max and min temperature (°C), rainfall (mm), humidity (%) and wind speed (m/s). Re-entering a station and date replaces the earlier reading.

**Import** needs a station code and a date, plus any of max/min temperature, rainfall, humidity, wind speed. A template is available in the app. Choose the file's units and the data origin before importing. Maximum size 5 MB.

**Sample data:** setup generates two years of synthetic readings for ten stations, marked `sample`. They exist for demonstration only and are not real ZMD measurements. Import real observations to replace them.

## API

All routes are under `<base>/api/` and return JSON. Writes need the `X-CSRF-Token` header returned by `GET auth/me`.

| Area | Routes |
| --- | --- |
| Session | `GET auth/me`, `POST auth/login`, `auth/register`, `auth/logout`, `auth/profile`, `auth/preferences`, `auth/password`, `auth/signout-all`, `GET auth/sessions`, `POST auth/sessions/revoke` |
| Live weather | `GET weather/current`, `weather/forecast?station=` |
| Summaries | `GET dashboard`, `stations`, `analysis`, `analysis/extremes`, `reports/summary`, `reports/quality`, `quality/gaps` |
| Readings | `GET readings`, `readings/export`, `readings/template`; `POST readings`, `readings/update`, `readings/delete`, `readings/import` (supports `dry_run`), `readings/batch` (offline sync) |
| Quality | `POST quality/scan`, `quality/estimate` |
| Stations | `POST stations`, `stations/update`, `GET stations/history` |
| Alerts and bulletins | staff: `alerts/*`, `bulletins/*`; public: `GET public/alerts`, `public/alert`, `public/alert.cap`, `public/bulletins`, `public/bulletin`, `public/feed.xml` |
| Admin | `GET users`, `POST users/create`, `users/update`, `users/reset-password`, `GET audit`, `GET system/health`, `GET system/export` |

## Project layout

```
api/         router and rewrite rules for the JSON API
config/      bootstrap, .env loader and database schema (blocked from web access)
includes/    PHP classes: User, Climate, Audit, Weather, Warnings, Bulletins, RateLimiter, PasswordPolicy, SystemInfo
cron/        daily job: alert drafts, bulletins, housekeeping
deploy/      web installer and .env example for hosting
scripts/     release builder
tests/       automated checks
frontend/    React source (src/pages, src/components)
dist/        built frontend served by Apache (generated)
setup.php    command-line installer and migrator
```

## Not yet included

Automated satellite and model data feeds, password reset by email, "remember me", two-factor sign-in, photo avatars, a public data API and push notifications. The interface and user guide describe the current behaviour.

## PWA notes

- Service worker: `frontend/public/sw.js` (scope follows the build base, `/CDIMS/` by default), registered only in production builds. After deploying a new build, bump `VERSION` in `sw.js` so installed copies refresh.
- Icons are generated PNGs in `frontend/public/`. Replace them with official ZMD artwork if available.
- Browsers only offer installation over HTTPS or `localhost`.
- The map loads OpenStreetMap tiles, so it needs an internet connection.
