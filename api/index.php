<?php
/**
 * JSON API router. Apache rewrites /api/<route> to this file (see api/.htaccess).
 */

// Find the backend ("core") folder. It may sit next to this folder (development), inside the web root as
// ./cdims-core, or, recommended on shared hosting, one level above the web root. CDIMS_CORE can point anywhere.
$core = null;
foreach ([getenv('CDIMS_CORE') ?: '', dirname(__DIR__), dirname(__DIR__) . '/cdims-core', dirname(__DIR__, 2) . '/cdims-core', dirname(__DIR__, 3) . '/cdims-core'] as $candidate) {
    if ($candidate !== '' && is_file($candidate . '/config/config.php')) {
        $core = $candidate;
        break;
    }
}
if ($core === null) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'The CDIMS backend folder (cdims-core) was not found. See DEPLOYMENT.md.']);
    exit;
}

require_once $core . '/config/config.php';
foreach (['User', 'Climate', 'Audit', 'Weather', 'RateLimiter', 'PasswordPolicy', 'Warnings', 'Bulletins', 'SystemInfo'] as $class) {
    require_once $core . "/includes/classes/$class.php";
}

/** Absolute URL of the app (for links in feeds and CAP). Set CDIMS_PUBLIC_URL when behind a proxy. */
function publicBaseUrl(): string
{
    $fixed = cdims_env('CDIMS_PUBLIC_URL');
    if ($fixed) {
        return rtrim($fixed, '/');
    }
    $path = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/\\'); // "/CDIMS/api/index.php" -> "/CDIMS"
    return (isHttps() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $path;
}

function orgName(): string
{
    return cdims_env('CDIMS_ORG_NAME', 'Zambia Meteorology Department');
}

/** Emergency contacts shown on public alerts. CDIMS_EMERGENCY_CONTACTS="Label|number;Label|number" (nothing is shown if unset). */
function emergencyContacts(): array
{
    $out = [];
    foreach (explode(';', (string) cdims_env('CDIMS_EMERGENCY_CONTACTS', '')) as $pair) {
        [$label, $number] = array_pad(array_map('trim', explode('|', $pair, 2)), 2, '');
        if ($label !== '' && preg_match('/^[+0-9][0-9 ()-]{1,24}$/', $number)) {
            $out[] = ['label' => $label, 'number' => $number];
        }
    }
    return $out;
}

function sendXml(string $xml, string $type = 'application/xml'): never
{
    header('Content-Type: ' . $type . '; charset=utf-8');
    header('Cache-Control: public, max-age=120');
    echo $xml;
    exit;
}

ini_set('display_errors', '0');

/** Count a request against a named limit and refuse it when the limit is passed. */
function limit(string $bucket, string|int $subject, int $max, int $seconds, string $what = 'requests'): void
{
    RateLimiter::enforce($bucket, (string) $subject, $max, $seconds, $what);
}

function respond($data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_NUMERIC_CHECK);
    exit;
}

function fail(string $message, int $status = 400): never
{
    respond(['error' => $message], $status);
}

function body(): array
{
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($data) ? $data : [];
}

/** Require a signed-in user, optionally holding a permission (see User::PERMISSIONS). */
function requireUser(?array $user, ?string $permission = null): array
{
    if (!$user) {
        fail('Please sign in to continue.', 401);
    }
    if ($permission && !User::roleCan($user['role'], $permission)) {
        fail('Your role does not have access to this.', 403);
    }
    return $user;
}

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$route = trim($_GET['route'] ?? '', '/');
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET' && !validCsrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    fail('Your session expired. Refresh the page and try again.', 419);
}

try {
    // Broad ceiling per address: stops scrapers and runaway clients without bothering normal use
    limit('api_ip', clientIp(), 600, 60, 'requests');

    $users = new User();
    $climate = new Climate();
    // Background polling (weather refresh, offline sync) must not keep an unattended session alive
    $me = $users->current(($_SERVER['HTTP_X_BACKGROUND'] ?? '') !== '1');

    switch ("$method $route") {
        case 'GET auth/me':
            respond(['user' => $me, 'csrf' => csrfToken()]);

        case 'POST auth/password-check':
            limit('pwcheck', clientIp(), 60, 60, 'checks');
            $in = body();
            $ctx = ['username' => (string) ($in['username'] ?? ''), 'email' => (string) ($in['email'] ?? ''), 'full_name' => (string) ($in['full_name'] ?? '')];
            $pw = (string) ($in['password'] ?? '');
            respond(['score' => PasswordPolicy::score($pw, $ctx), 'problems' => PasswordPolicy::problems($pw, $ctx), 'min_length' => PasswordPolicy::MIN_LENGTH]);

        case 'GET auth/sessions':
            $me = requireUser($me);
            respond(['sessions' => $users->sessions($me['id'])]);

        case 'POST auth/sessions/revoke':
            $me = requireUser($me);
            $in = body();
            if (!$users->revokeSession($me['id'], (string) ($in['handle'] ?? ''))) {
                fail('That session was not found or is the one you are using.', 404);
            }
            Audit::log($me, 'revoke_session', 'user', $me['username']);
            respond(['ok' => true]);

        case 'POST auth/login':
            $in = body();
            try {
                $user = $users->login(trim((string) ($in['identifier'] ?? '')), (string) ($in['password'] ?? ''));
            } catch (RuntimeException $e) {
                Audit::log(null, 'login_failed', 'user', trim((string) ($in['identifier'] ?? '')) ?: null);
                throw $e;
            }
            Audit::log($user, 'login', 'user', $user['username']);
            respond(['user' => $user, 'csrf' => csrfToken()]);

        case 'POST auth/register':
            limit('register', clientIp(), 5, 3600, 'sign-up attempts');
            $in = body();
            $new = $users->register(
                (string) ($in['username'] ?? ''), (string) ($in['email'] ?? ''),
                (string) ($in['password'] ?? ''), (string) ($in['full_name'] ?? '')
            );
            Audit::log($new + ['id' => $new['id']], 'register', 'user', $new['username']);
            respond(['ok' => true], 201);

        case 'POST auth/logout':
            Audit::log($me, 'logout', 'user', $me['username'] ?? null);
            $users->logout();
            session_start();
            respond(['ok' => true, 'csrf' => csrfToken()]);

        case 'GET dashboard':
            requireUser($me, 'view_dashboard');
            respond($climate->dashboard(!empty($_GET['station']) ? (int) $_GET['station'] : null));

        case 'GET weather/current':
            $me = requireUser($me, 'view_dashboard');
            limit('weather', $me['id'], 120, 600, 'weather requests');
            respond((new Weather())->current());

        case 'GET weather/forecast':
            $me = requireUser($me, 'view_dashboard');
            limit('weather', $me['id'], 120, 600, 'weather requests');
            respond((new Weather())->forecast((int) ($_GET['station'] ?? 0)));

        // ---------------------------------------------------------------- public warnings and bulletins (no sign-in)
        case 'GET public/alerts':
            limit('public', clientIp(), 120, 60, 'requests');
            header('Cache-Control: public, max-age=60');
            $w = new Warnings();
            respond(['alerts' => $w->active(), 'recent' => $w->recent(12), 'demo' => Bulletins::sampleShare() > 0.5, 'org' => orgName(), 'generated_at' => date('c')]);

        case 'GET public/alert':
            limit('public', clientIp(), 120, 60, 'requests');
            $a = (new Warnings())->get((int) ($_GET['id'] ?? 0));
            if (!$a) {
                fail('That alert was not found.', 404);
            }
            // Add coordinates so the page can draw the affected area
            $codes = array_column($a['areas'], 'code');
            if ($codes) {
                $q = getDBConnection()->prepare('SELECT code, latitude, longitude FROM stations WHERE code IN (' . implode(',', array_fill(0, count($codes), '?')) . ')');
                $q->execute($codes);
                $pos = array_column($q->fetchAll(), null, 'code');
                foreach ($a['areas'] as &$ar) {
                    $ar['lat'] = isset($pos[$ar['code']]) ? (float) $pos[$ar['code']]['latitude'] : null;
                    $ar['lng'] = isset($pos[$ar['code']]) ? (float) $pos[$ar['code']]['longitude'] : null;
                }
                unset($ar);
            }
            header('Cache-Control: public, max-age=60');
            respond(['alert' => $a, 'demo' => Bulletins::sampleShare() > 0.5, 'org' => orgName(), 'contacts' => emergencyContacts()]);

        case 'GET public/alert.cap':
            limit('public', clientIp(), 120, 60, 'requests');
            $a = (new Warnings())->get((int) ($_GET['id'] ?? 0));
            if (!$a) {
                fail('That alert was not found.', 404);
            }
            $sender = cdims_env('CDIMS_ALERT_SENDER', 'alerts@' . preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'localhost'));
            sendXml(Warnings::cap($a, publicBaseUrl(), $sender, orgName()), 'application/cap+xml');

        case 'GET public/bulletins':
            limit('public', clientIp(), 120, 60, 'requests');
            header('Cache-Control: public, max-age=60');
            respond((new Bulletins())->list(false, $_GET['kind'] ?? null, (int) ($_GET['page'] ?? 1), (int) ($_GET['per'] ?? 10)) + ['demo' => Bulletins::sampleShare() > 0.5, 'org' => orgName()]);

        case 'GET public/bulletin':
            limit('public', clientIp(), 120, 60, 'requests');
            $bl = (new Bulletins())->get((int) ($_GET['id'] ?? 0));
            if (!$bl) {
                fail('That bulletin was not found.', 404);
            }
            unset($bl['notes'], $bl['created_at'], $bl['updated_at']); // reviewer notes and internal timestamps stay inside
            header('Cache-Control: public, max-age=60');
            respond(['bulletin' => $bl, 'demo' => Bulletins::sampleShare() > 0.5, 'org' => orgName()]);

        case 'GET public/feed.xml':
            limit('public', clientIp(), 60, 60, 'requests');
            $base = publicBaseUrl();
            $items = [];
            foreach ((new Bulletins())->list(false, null, 1, 20)['items'] as $it) {
                $items[] = ['ts' => strtotime($it['published_at'] ?: $it['period_end']), 'title' => $it['title'], 'link' => "$base/bulletins/{$it['id']}", 'desc' => $it['summary'], 'guid' => "cdims-bulletin-{$it['id']}"];
            }
            foreach ((new Warnings())->active() as $it) {
                $items[] = ['ts' => strtotime($it['published_at'] ?: $it['starts_at']), 'title' => strtoupper($it['severity']) . ': ' . $it['title'], 'link' => "$base/alerts/{$it['id']}", 'desc' => $it['message'], 'guid' => "cdims-alert-{$it['id']}"];
            }
            usort($items, fn($x, $y) => $y['ts'] <=> $x['ts']);
            $e = fn($s) => htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $rss = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<rss version="2.0"><channel>'
                . '<title>' . $e(orgName()) . ' weather bulletins and alerts</title><link>' . $e("$base/bulletins") . '</link>'
                . '<description>Daily bulletins, weekly climate summaries and weather alerts.</description><language>en</language>';
            foreach (array_slice($items, 0, 40) as $it) {
                $rss .= '<item><title>' . $e($it['title']) . '</title><link>' . $e($it['link']) . '</link><guid isPermaLink="false">' . $e($it['guid'])
                    . '</guid><pubDate>' . gmdate('D, d M Y H:i:s', $it['ts']) . ' GMT</pubDate><description>' . $e($it['desc']) . '</description></item>';
            }
            sendXml($rss . '</channel></rss>', 'application/rss+xml');

        // ---------------------------------------------------------------- staff: alerts and bulletins
        case 'GET alerts/admin':
            requireUser($me, 'manage_bulletins');
            respond(['alerts' => (new Warnings())->all($_GET['status'] ?? null)]);

        case 'POST alerts/generate':
            $me = requireUser($me, 'manage_bulletins');
            limit('heavy', $me['id'], 10, 600, 'maintenance requests');
            $res = (new Warnings())->generate($me['id']);
            Audit::log($me, 'check_rules', 'alert', null, ['created' => count($res['created']), 'skipped' => $res['skipped'], 'findings' => $res['checked']]);
            respond($res);

        case 'POST alerts/create':
            $me = requireUser($me, 'manage_bulletins');
            $id = (new Warnings())->create(body(), $me['id']);
            Audit::log($me, 'create', 'alert', $id);
            respond(['id' => $id], 201);

        case 'POST alerts/update':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Warnings())->update((int) ($in['id'] ?? 0), $in);
            Audit::log($me, 'update', 'alert', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'POST alerts/publish':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Warnings())->publish((int) ($in['id'] ?? 0), $me['id']);
            Audit::log($me, 'publish', 'alert', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'POST alerts/cancel':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Warnings())->cancel((int) ($in['id'] ?? 0), (string) ($in['reason'] ?? ''));
            Audit::log($me, 'cancel', 'alert', $in['id'] ?? null, ['reason' => $in['reason'] ?? null]);
            respond(['ok' => true]);

        case 'POST alerts/delete':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Warnings())->deleteDraft((int) ($in['id'] ?? 0));
            Audit::log($me, 'delete', 'alert', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'GET alerts/thresholds':
            requireUser($me, 'manage_bulletins');
            respond(['thresholds' => (new Warnings())->thresholds(), 'defaults' => Warnings::DEFAULT_THRESHOLDS, 'units' => Warnings::THRESHOLD_UNITS, 'hazards' => Warnings::HAZARDS]);

        case 'POST alerts/thresholds':
            $me = requireUser($me, 'manage_users'); // administrators decide what counts as a warning
            $t = (new Warnings())->saveThresholds(body()['thresholds'] ?? [], $me['id']);
            Audit::log($me, 'update', 'alert_rules', null, $t);
            respond(['thresholds' => $t]);

        case 'GET bulletins/admin':
            requireUser($me, 'manage_bulletins');
            respond((new Bulletins())->list(true, $_GET['kind'] ?? null, (int) ($_GET['page'] ?? 1), (int) ($_GET['per'] ?? 15)));

        case 'GET bulletins/get':
            requireUser($me, 'manage_bulletins');
            $bl = (new Bulletins())->get((int) ($_GET['id'] ?? 0), true);
            if (!$bl) {
                fail('Bulletin not found.', 404);
            }
            respond(['bulletin' => $bl, 'demo' => Bulletins::sampleShare() > 0.5, 'org' => orgName()]);

        case 'POST bulletins/generate':
            $me = requireUser($me, 'manage_bulletins');
            limit('heavy', $me['id'], 10, 600, 'maintenance requests');
            $in = body();
            $res = (new Bulletins())->generate((string) ($in['kind'] ?? ''), !empty($in['date']) ? (string) $in['date'] : null, $me['id']);
            Audit::log($me, 'generate', 'bulletin', $res['id'], ['kind' => $in['kind'] ?? null, 'replaced' => $res['replaced']]);
            respond($res, 201);

        case 'POST bulletins/update':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Bulletins())->update((int) ($in['id'] ?? 0), $in);
            Audit::log($me, 'update', 'bulletin', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'POST bulletins/publish':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Bulletins())->publish((int) ($in['id'] ?? 0), $me['id']);
            Audit::log($me, 'publish', 'bulletin', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'POST bulletins/unpublish':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Bulletins())->unpublish((int) ($in['id'] ?? 0));
            Audit::log($me, 'unpublish', 'bulletin', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'POST bulletins/delete':
            $me = requireUser($me, 'manage_bulletins');
            $in = body();
            (new Bulletins())->deleteDraft((int) ($in['id'] ?? 0));
            Audit::log($me, 'delete', 'bulletin', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'GET stations':
            requireUser($me, 'view_dashboard');
            respond(['stations' => $climate->stations()]);

        case 'GET readings':
            requireUser($me, 'view_readings');
            respond($climate->readings($_GET, (int) ($_GET['page'] ?? 1), (int) ($_GET['per'] ?? 25)));

        case 'POST readings':
            $me = requireUser($me, 'write_readings');
            $in = body();
            $stationId = $climate->stationIdByCode((string) ($in['station_code'] ?? ''));
            if (!$stationId) {
                fail('Choose a valid station.');
            }
            $clean = $climate->validate($in);
            $note = $climate->qcCheck($stationId, $clean);
            $flag = (string) ($in['quality_flag'] ?? 'ok');
            if ($note && $flag === 'ok') {
                $flag = 'suspect'; // automatic anomaly detection
            }
            $id = $climate->save($stationId, $clean, 'manual', $me['id'], (string) ($in['origin'] ?? 'station'), $flag, $note);
            Audit::log($me, 'save', 'reading', $id, ['station' => $in['station_code'], 'date' => $clean['observed_on'], 'qc' => $note] + $clean);
            respond(['ok' => true, 'id' => $id, 'flagged' => $note], 201);

        case 'POST readings/update':
            $me = requireUser($me, 'write_readings');
            $in = body();
            $change = $climate->updateReading((int) ($in['id'] ?? 0), $in, $me['id']);
            Audit::log($me, 'update', 'reading', $in['id'], $change);
            respond(['ok' => true]);

        case 'POST readings/delete':
            $me = requireUser($me, 'write_readings');
            $in = body();
            $info = $climate->deleteReading((int) ($in['id'] ?? 0), $me['id']);
            Audit::log($me, 'delete', 'reading', $in['id'], $info + ['note' => 'soft delete, row retained']);
            respond(['ok' => true]);

        case 'POST readings/import':
            $me = requireUser($me, 'write_readings');
            limit('import', $me['id'], 30, 600, 'import requests');
            $file = $_FILES['file'] ?? null;
            if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
                fail('Choose a CSV file to upload.');
            }
            if ($file['size'] > 5 * 1024 * 1024) {
                fail('File is larger than 5 MB.');
            }
            $origin = (string) ($_POST['origin'] ?? 'station');
            if (!in_array($origin, Climate::ORIGINS, true)) {
                fail('Unknown data origin.', 422);
            }
            $units = ['temp' => (string) ($_POST['temp_unit'] ?? 'c'), 'wind' => (string) ($_POST['wind_unit'] ?? 'ms'), 'rain' => (string) ($_POST['rain_unit'] ?? 'mm')];
            $dry = !empty($_POST['dry_run']) && $_POST['dry_run'] !== '0';
            $mapping = json_decode((string) ($_POST['mapping'] ?? ''), true);
            $report = $climate->importCsv($file['tmp_name'], $me['id'], $origin, $units, ['dry_run' => $dry, 'mapping' => is_array($mapping) ? $mapping : []]);
            if (!$dry) {
                Audit::log($me, 'import', 'reading', null, ['file' => basename((string) $file['name']), 'origin' => $origin, 'units' => $units,
                    'saved' => $report['saved'], 'skipped' => $report['skipped'], 'flagged' => $report['flagged']]);
            }
            respond($report);

        case 'POST readings/batch':
            $me = requireUser($me, 'write_readings');
            limit('batch', $me['id'], 120, 600, 'sync requests');
            $in = body();
            $items = $in['items'] ?? null;
            if (!is_array($items) || !$items) {
                fail('No readings were sent.', 422);
            }
            $res = $climate->saveBatch($items, $me['id']);
            Audit::log($me, 'sync', 'reading', null, ['received' => count($items), 'saved' => $res['saved'], 'failed' => $res['failed'], 'via' => 'offline queue']);
            respond($res);

        case 'GET readings/template':
            requireUser($me, 'view_readings');
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="cdims-import-template.csv"');
            echo "station_code,date,tmax,tmin,rainfall_mm,humidity,wind_speed\nLUS," . date('Y-m-d', strtotime('-1 day')) . ",29.5,14.2,0,48,3.4\n";
            exit;

        case 'GET readings/export':
            $me = requireUser($me, 'export');
            limit('export', $me['id'], 30, 600, 'exports');
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="cdims-readings-' . date('Ymd') . '.csv"');
            $out = fopen('php://output', 'w');
            fputcsv($out, ['station_code', 'date', 'tmax', 'tmin', 'rainfall_mm', 'humidity', 'wind_speed']);
            foreach ($climate->exportRows($_GET) as $row) {
                fputcsv($out, $row);
            }
            exit;

        case 'POST stations':
            $me = requireUser($me, 'manage_stations');
            $s = $climate->createStation(body());
            Audit::log($me, 'create', 'station', $s['code'], $s);
            respond(['ok' => true], 201);

        case 'POST stations/update':
            $me = requireUser($me, 'manage_stations');
            $in = body();
            $s = $climate->updateStation((int) ($in['id'] ?? 0), $in);
            Audit::log($me, 'update', 'station', $s['code'], $s);
            respond(['ok' => true]);

        case 'GET reports/summary':
            requireUser($me, 'view_reports');
            respond($climate->report(
                (int) ($_GET['year'] ?? date('Y')), !empty($_GET['station']) ? (int) $_GET['station'] : null,
                $_GET['from'] ?? null, $_GET['to'] ?? null
            ));

        case 'GET reports/compare':
            requireUser($me, 'view_reports');
            respond($climate->compareYears(
                !empty($_GET['station']) ? (int) $_GET['station'] : null,
                (int) ($_GET['from_year'] ?? date('Y') - 2), (int) ($_GET['to_year'] ?? date('Y'))
            ));

        case 'GET reports/quality':
            requireUser($me, 'view_reports');
            respond($climate->quality());

        case 'GET quality/gaps':
            requireUser($me, 'view_reports');
            respond($climate->gaps((int) ($_GET['station'] ?? 0), (int) ($_GET['days'] ?? 365)));

        case 'POST quality/scan':
            $me = requireUser($me, 'write_readings');
            limit('heavy', $me['id'], 10, 600, 'maintenance requests');
            $n = $climate->scanOutliers();
            Audit::log($me, 'qc_scan', 'reading', null, ['flagged' => $n]);
            respond(['flagged' => $n]);

        case 'POST quality/estimate':
            $me = requireUser($me, 'write_readings');
            limit('heavy', $me['id'], 10, 600, 'maintenance requests');
            $in = body();
            $sid = (int) ($in['station'] ?? 0);
            if (!$sid) {
                fail('Choose a station.', 422);
            }
            $res = $climate->estimateGaps($sid, (int) ($in['max_gap'] ?? 3), $me['id']);
            Audit::log($me, 'estimate_gaps', 'reading', $sid, $res + ['max_gap' => (int) ($in['max_gap'] ?? 3)]);
            respond($res);

        case 'GET analysis/extremes':
            requireUser($me, 'view_analysis');
            respond($climate->extremes($_GET));

        case 'GET stations/history':
            requireUser($me, 'manage_stations');
            respond(['history' => Audit::forEntity('station', strtoupper((string) ($_GET['code'] ?? '')))]);

        case 'GET system/health':
            requireUser($me, 'manage_users');
            respond((new SystemInfo())->health());

        case 'GET system/export':
            $me = requireUser($me, 'manage_users');
            limit('backup', $me['id'], 20, 600, 'backup downloads');
            $name = (string) ($_GET['table'] ?? '');
            $rows = (new SystemInfo())->exportRows($name); // throws on an unknown name before any output
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="cdims-' . $name . '-' . date('Ymd') . '.csv"');
            $out = fopen('php://output', 'w');
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            Audit::log($me, 'backup', 'system', $name);
            exit;

        case 'GET audit':
            requireUser($me, 'view_audit');
            respond(['entries' => Audit::recent((int) ($_GET['limit'] ?? 200), $_GET['entity'] ?? null)]);

        case 'GET analysis':
            requireUser($me, 'view_analysis');
            respond($climate->analysis($_GET));

        case 'POST auth/profile':
            $me = requireUser($me);
            $in = body();
            $users->updateProfile($me['id'], (string) ($in['full_name'] ?? ''), (string) ($in['email'] ?? ''));
            Audit::log($me, 'update_profile', 'user', $me['username']);
            respond(['user' => $users->current()]);

        case 'POST auth/preferences':
            $me = requireUser($me);
            $users->updatePreferences($me['id'], body());
            respond(['user' => $users->current()]);

        case 'POST auth/signout-all':
            $me = requireUser($me);
            $users->signOutEverywhere($me['id']);
            Audit::log($me, 'signout_everywhere', 'user', $me['username']);
            respond(['ok' => true]);

        case 'POST auth/password':
            $me = requireUser($me);
            limit('pwchange', $me['id'], 6, 900, 'password change attempts');
            $in = body();
            $users->changePassword($me['id'], (string) ($in['current'] ?? ''), (string) ($in['new'] ?? ''));
            respond(['ok' => true]);

        case 'GET users':
            requireUser($me, 'manage_users');
            respond(['users' => $users->all(), 'roles' => User::PERMISSIONS]);

        case 'POST users/unlock':
            $me = requireUser($me, 'manage_users');
            $in = body();
            $users->unlock((int) ($in['id'] ?? 0));
            Audit::log($me, 'unlock', 'user', $in['id'] ?? null);
            respond(['ok' => true]);

        case 'POST users/create':
            $me = requireUser($me, 'manage_users');
            limit('admin_users', $me['id'], 40, 3600, 'account changes');
            $in = body();
            $created = $users->create(
                (string) ($in['username'] ?? ''), (string) ($in['email'] ?? ''), (string) ($in['password'] ?? ''),
                (string) ($in['full_name'] ?? ''), (string) ($in['role'] ?? 'public')
            );
            Audit::log($me, 'create', 'user', $created['username'], ['role' => $created['role']]);
            respond(['user' => $created], 201);

        case 'POST users/update':
            $me = requireUser($me, 'manage_users');
            $in = body();
            $users->update((int) ($in['id'] ?? 0), (string) ($in['role'] ?? ''), (bool) ($in['is_active'] ?? false), $me['id']);
            Audit::log($me, 'update', 'user', $in['id'] ?? null, ['role' => $in['role'] ?? null, 'is_active' => (bool) ($in['is_active'] ?? false)]);
            respond(['ok' => true]);

        case 'POST users/reset-password':
            $me = requireUser($me, 'manage_users');
            limit('admin_users', $me['id'], 40, 3600, 'account changes');
            $in = body();
            $target = $users->resetPassword((int) ($in['id'] ?? 0), (string) ($in['password'] ?? ''));
            Audit::log($me, 'reset_password', 'user', $target);
            respond(['ok' => true]);

        default:
            fail('Not found.', 404);
    }
} catch (RateLimitExceeded $e) {
    header('Retry-After: ' . $e->retryAfter);
    fail($e->getMessage(), 429);
} catch (InvalidArgumentException $e) {
    fail($e->getMessage(), 422);
} catch (RuntimeException $e) {
    $code = in_array($e->getCode(), [401, 403, 429, 503], true) ? $e->getCode() : 500;
    fail($e->getMessage(), $code);
} catch (PDOException $e) {
    error_log('CDIMS database error: ' . $e->getMessage());
    $notReady = in_array((string) $e->getCode(), ['42S02', '42S22', '1049', '1146'], true);
    fail($notReady ? 'CDIMS has not been installed on this server yet. Open install.php, or run setup.php (see DEPLOYMENT.md).' : 'The database is not available right now. Please try again shortly.', 503);
} catch (Throwable $e) {
    error_log('CDIMS API error: ' . $e->getMessage());
    fail('Something went wrong on the server.', 500);
}
