# CDIMS deployment guide for cPanel

This guide takes you from a finished build to a live, secure CDIMS site on ordinary cPanel shared hosting. It assumes no command-line access. Every step can be done in the cPanel web interface.

Time needed: about 30 minutes.

## 1. What you need

| Item | Requirement |
|---|---|
| Hosting | cPanel account with Apache, PHP 8.1 or newer, MySQL or MariaDB |
| PHP extensions | `pdo_mysql`, `curl`, `mbstring`, `json`, `openssl` (all are on by default in cPanel) |
| Domain | A domain or sub-domain with an SSL certificate (AutoSSL / Let's Encrypt is free in cPanel) |
| Outbound internet | The server must be able to reach `api.open-meteo.com` (live weather, forecasts and weather-based alerts) |
| Disk space | Under 50 MB for the app. The database grows with your climate data. |

## 2. Build the release package (on your computer)

You need Node.js 18 or newer, once, on the computer where the source code lives.

```
node scripts/build-release.mjs
```

This creates the folder `release/` and the file `release/cdims-release.zip`:

```
release/
  public_html/   the website (built pages, api/, install.php, .htaccess)
  cdims-core/    the private backend (config, classes, cron, storage, env.example)
  DEPLOYMENT.md  this guide
```

Choose where the site will live **before** you build, because the address is built into the pages:

| You want the site at | Build command |
|---|---|
| `https://weather.example.zm/` (own domain or sub-domain) | `node scripts/build-release.mjs` |
| `https://example.zm/cdims/` (a folder) | `node scripts/build-release.mjs --base=/cdims/` |

Options: `--no-https` (testing on plain http only, never for production) and `--no-zip`.

> On Windows with Git Bash, put `MSYS_NO_PATHCONV=1` in front of the command when you use `--base=`, otherwise Git Bash rewrites the path. PowerShell and Command Prompt are fine.

## 3. Create the database

1. Log in to cPanel and open **MySQL® Databases**.
2. Under *Create New Database* enter a name, for example `cdims`. cPanel adds your account prefix, giving something like `myacct_cdims`. Write the full name down.
3. Under *MySQL Users > Add New User* create a user, for example `cdimsuser`, with a strong generated password. Write down the full user name (`myacct_cdimsuser`) and the password.
4. Under *Add User To Database* pick that user and that database, tick **ALL PRIVILEGES**, and save.

## 4. Choose the PHP version

1. cPanel > **Select PHP Version** (or **MultiPHP Manager**).
2. Choose **PHP 8.1, 8.2 or 8.3** for the domain.
3. In *Extensions*, make sure `pdo_mysql` (also shown as `mysqlnd`/`nd_mysqli`), `curl`, `mbstring`, `json` and `openssl` are ticked.

## 5. Upload the files

The backend must live **outside** the public web folder so that nobody can download it.

1. cPanel > **File Manager**, open your home folder (the one that contains `public_html`).
2. Click **Upload** and upload `release/cdims-release.zip` to the home folder.
3. Select the zip and click **Extract**. You get `public_html/`, `cdims-core/` and `DEPLOYMENT.md`.
4. Move the contents so the layout is:

```
/home/myacct/
  cdims-core/                 private backend   <- not reachable from the web
  public_html/                web root
    index.html, assets/, api/, install.php, .htaccess ...
```

   - **Own domain or sub-domain:** the contents of the extracted `public_html/` go into the web root of that domain (`public_html/`, or the sub-domain's document root, for example `public_html/weather/`). The `cdims-core` folder stays in your home folder. If the document root is deeper than `public_html/`, that is fine: the app searches up to three levels above `api/` for `cdims-core`. If yours is somewhere else, add the line `SetEnv CDIMS_CORE /home/myacct/cdims-core` to `.htaccess` (and into the same file for `install.php`).
   - **Folder variant (`/cdims/`):** create `public_html/cdims/` and put the extracted `public_html/` contents inside it. Keep `cdims-core` in your home folder.

5. In File Manager open *Settings* (top right) and tick **Show Hidden Files (dotfiles)** so you can see `.htaccess` and `.env`. Confirm that `.htaccess` was uploaded next to `index.html`.

## 6. Configure the private settings

1. Open `cdims-core/env.example` in File Manager, copy it to a new file named **`.env`** in the same folder (or `.cdims.env` in your home folder, which is even safer).
2. Edit it and set at least:

```
CDIMS_DB_HOST=localhost
CDIMS_DB_NAME=myacct_cdims
CDIMS_DB_USER=myacct_cdimsuser
CDIMS_DB_PASS=the-database-password
CDIMS_ENV=production
CDIMS_INSTALL_TOKEN=a-long-random-secret-of-your-own
CDIMS_PUBLIC_URL=https://weather.example.zm
```

3. Make sure the folder `cdims-core/storage` is writable (permissions **755**; use **775** if the installer says it is not writable). It holds the weather cache and the installer lock.

`env.example` documents every other setting (session timeouts, time zone, proxy trust, automatic bulletin publishing).

## 7. Run the installer

1. Visit `https://your-domain/install.php` (add the folder if you used one, for example `https://example.zm/cdims/install.php`).
2. Enter the `CDIMS_INSTALL_TOKEN` you chose.
3. The page checks PHP, extensions, the storage folder and the database connection. Fix anything marked **Fix** and reload.
4. Enter the administrator's name, email, username and a strong password. The installer enforces the same password rules as the system itself.
5. Leave **demonstration data** unticked for a real installation. Tick it only on a training or test site.
6. Click **Install**. The tables, the reference stations and your administrator account are created.

Then, immediately:

- **Delete `install.php`** from the server.
- **Remove the `CDIMS_INSTALL_TOKEN` line** from `.env`.

The installer locks itself after a successful run (`cdims-core/storage/installed.lock`), but a file that is not there cannot be attacked.

## 8. First sign-in checklist

1. Open the site, sign in as the administrator you just created.
2. **Users**: create accounts for analysts and stakeholders (each gets a password that follows the policy; ask them to change it under *My account*).
3. **Stations**: review the reference stations and mark inactive ones.
4. **Data > Import** or **Field entry**: load your historical records through the import wizard (it validates and previews before saving).
5. **Bulletins**: set the alert thresholds if the defaults do not suit you, and generate a first bulletin to see the public page.

## 9. Schedule the daily jobs (cron)

The cron job prepares alert drafts, a daily bulletin (and a weekly one on Mondays), and cleans old rate-limit and session records. Alerts are never published automatically.

1. cPanel > **Cron Jobs**.
2. Add a job to run once a day, for example at 06:00 (`0 6 * * *`), with this command (adjust the path and, if cPanel shows a different PHP binary, use that one):

```
/usr/local/bin/php /home/myacct/cdims-core/cron/generate.php >/dev/null 2>&1
```

3. Optional: to publish the generated bulletins without review, add `CDIMS_AUTO_PUBLISH_BULLETINS=1` to `.env`. Keep it off if every bulletin should be checked first.

To test it once, run it with the output visible by dropping `>/dev/null 2>&1`, and have cPanel email you the result.

## 10. HTTPS and security headers

- cPanel > **SSL/TLS Status**: run **AutoSSL** for the domain so a certificate is issued.
- The generated `.htaccess` redirects every visitor to HTTPS, sends HSTS, and sets the security headers (Content-Security-Policy, X-Frame-Options and others). If the site is behind a proxy or CDN such as Cloudflare, set `CDIMS_TRUST_PROXY=1` in `.env` so the real visitor address is used for rate limiting. Do **not** turn it on otherwise.
- Session cookies automatically use the secure `__Host-` prefix on HTTPS.

## 11. Updating to a new version

1. On your computer, build a new package with the same `--base` as before.
2. In File Manager, **back up** `cdims-core/.env` (or leave it where it is; the update does not touch it) and take a database backup (section 12).
3. Upload and extract the new zip over the existing files. Do **not** upload `install.php` again.
4. Overwrite `public_html` contents and the `cdims-core` folders `config`, `includes` and `cron`. Keep `cdims-core/.env` and `cdims-core/storage`.
5. If a release adds database columns or tables, they are added automatically the first time `setup` logic runs. If the release notes say so, run the installer again: delete `cdims-core/storage/installed.lock`, set a new install token, and open `install.php`; it will only add what is missing and will not touch your data or administrator.
6. Ask users to refresh. The service worker updates itself the next time they open the app.

## 12. Backups

- **Database:** cPanel > **Backup** > *Download a MySQL Database Backup*. Do this before every update and on a schedule (weekly at least). cPanel's own **JetBackup** or full-account backups also work if your host provides them.
- **Data exports:** signed in as an administrator or analyst, **Data > Export** downloads the readings as CSV.
- **Files:** the only file that matters is `.env`; keep a copy somewhere safe, away from the server. Everything else is in the release zip.

## 13. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| **500 Internal Server Error** on every page | A bad line in `.htaccess` or a PHP version below 8.1. Check cPanel > *Errors*, confirm PHP 8.1+, and re-upload the generated `.htaccess`. |
| Blank page, or the site shows but links give 404 | The build `--base` does not match where you uploaded it. Rebuild with the right base and re-upload. |
| *"The CDIMS backend folder (cdims-core) was not found"* | `cdims-core` is not in the home folder or under `public_html`. Move it, or add `SetEnv CDIMS_CORE /home/myacct/cdims-core` to `public_html/.htaccess`. |
| Installer: *Database connection failed* | Wrong database name, user or password in `.env`; or the user was not added to the database (step 3.4). Remember the account prefix. |
| Installer: *Writable storage folder* fails | Set `cdims-core/storage` permissions to 755 or 775. |
| *Installer is switched off* | `CDIMS_INSTALL_TOKEN` is missing or shorter than 12 characters in `.env`. |
| Sign-in works but you are signed out immediately | The site is opened over plain http. Use `https://`. Also check that the server clock is correct. |
| *"Too many requests"* messages | The rate limiter tripped (a person or script made too many requests). It resets on its own; the message says how long. Behind a CDN, enable `CDIMS_TRUST_PROXY=1`. |
| Live weather or alerts say *unavailable* | The host blocks outgoing connections. Ask the host to allow `api.open-meteo.com` on port 443, or confirm `curl` is enabled. The app keeps showing the last good data for up to two hours. |
| Dates and times are off by hours | Set `CDIMS_TIMEZONE=Africa/Lusaka` in `.env`. |
| Old screens appear after an update | Hard refresh once (Ctrl+F5). The service worker then replaces itself. |
| Real error details are hidden | That is deliberate in production. For a short investigation set `CDIMS_ENV=development`, reproduce, then set it back to `production`. |

## 14. Security checklist before announcing the site

- [ ] The site opens only over `https://`
- [ ] `install.php` is deleted and `CDIMS_INSTALL_TOKEN` is removed
- [ ] `CDIMS_ENV=production`
- [ ] `https://your-domain/cdims-core/.env` and `https://your-domain/config/database.php` return **403 or 404**
- [ ] The administrator password is long and unique; no sample or default accounts exist (`LOGIN-DETAILS.md` is for local development only and is not in the release)
- [ ] Only the people who need them have the *admin* and *analyst* roles
- [ ] The database user has access to this database only
- [ ] A database backup has been downloaded and stored off the server
- [ ] The cron job ran once and the log shows no failures
- [ ] PHP is a supported version (8.1 or newer) and kept up to date through cPanel

## 15. Quick reference: what is where

| Path | Purpose | Reachable from the web? |
|---|---|---|
| `public_html/index.html`, `assets/` | The React application | Yes |
| `public_html/api/` | The JSON API entry point | Yes (only `index.php`) |
| `public_html/.htaccess` | Routing, HTTPS, headers, blocked paths | n/a |
| `cdims-core/config/` | Settings and database code | **No** |
| `cdims-core/includes/` | PHP classes (users, climate, alerts, bulletins) | **No** |
| `cdims-core/cron/generate.php` | Daily job | **No** (run by cron) |
| `cdims-core/storage/` | Weather cache and installer lock | **No** |
| `cdims-core/.env` | Passwords and secrets | **No** |
