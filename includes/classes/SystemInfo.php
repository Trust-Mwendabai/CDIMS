<?php
/**
 * Administrator tools: a health check of the installation and CSV backups of the main tables.
 */
class SystemInfo
{
    /** Downloadable tables. Password hashes, session ids and the like are never included. */
    private const EXPORTS = [
        'readings' => 'SELECT s.code AS station_code, r.observed_on, r.tmax, r.tmin, r.rainfall_mm, r.humidity, r.wind_speed, r.source, r.quality_flag, r.origin, r.qc_note, r.created_at
                       FROM active_readings r JOIN stations s ON s.id = r.station_id ORDER BY s.code, r.observed_on',
        'stations' => 'SELECT code, name, province, latitude, longitude, elevation_m, status, established_year, instruments, notes FROM stations ORDER BY code',
        'users' => 'SELECT username, email, full_name, role, is_active, created_at, last_login FROM users ORDER BY user_id',
        'audit' => 'SELECT created_at, username, action, entity, entity_id, detail, ip_address FROM audit_log ORDER BY id',
        'alerts' => 'SELECT id, hazard, severity, title, message, advice, areas, basis, starts_at, expires_at, status, origin, published_at, created_at FROM alerts ORDER BY id',
        'bulletins' => 'SELECT id, kind, period_start, period_end, title, summary, status, published_at, created_at FROM bulletins ORDER BY id',
    ];

    private PDO $db;

    public function __construct()
    {
        $this->db = getDBConnection();
    }

    public static function exportNames(): array
    {
        return array_keys(self::EXPORTS);
    }

    /** Yields the header row first, then every data row, ready for fputcsv(). */
    public function exportRows(string $name): Generator
    {
        if (!isset(self::EXPORTS[$name])) {
            throw new InvalidArgumentException('Unknown export.');
        }
        $stmt = $this->db->query(self::EXPORTS[$name], PDO::FETCH_ASSOC);
        $header = false;
        foreach ($stmt as $row) {
            if (!$header) {
                yield array_keys($row);
                $header = true;
            }
            yield array_values($row);
        }
        if (!$header) {
            yield ['(no rows)'];
        }
    }

    /** Called by the cron job so administrators can see that scheduled work is happening. */
    public static function heartbeat(bool $ok, string $note): void
    {
        getDBConnection()->prepare(
            'INSERT INTO settings (skey, svalue, updated_by, updated_at) VALUES (?,?,NULL,NOW())
             ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_at = NOW()'
        )->execute(['cron_last_run', json_encode(['at' => date('c'), 'ok' => $ok, 'note' => $note])]);
    }

    public function health(): array
    {
        $checks = [];
        $add = function (string $name, string $status, string $detail) use (&$checks) {
            $checks[] = ['name' => $name, 'status' => $status, 'detail' => $detail]; // status: ok | warn | fail
        };

        $add('PHP version', PHP_VERSION_ID >= 80100 ? 'ok' : 'fail', PHP_VERSION);
        $missing = array_values(array_filter(['pdo_mysql', 'curl', 'mbstring', 'json', 'openssl'], fn($e) => !extension_loaded($e)));
        $add('PHP extensions', $missing ? 'fail' : 'ok', $missing ? 'Missing: ' . implode(', ', $missing) : 'All required extensions are loaded');
        $add('Database', 'ok', 'MySQL/MariaDB ' . $this->db->query('SELECT VERSION()')->fetchColumn());

        $drift = abs(strtotime((string) $this->db->query('SELECT NOW()')->fetchColumn()) - time());
        $add('Clock agreement (PHP and database)', $drift <= 5 ? 'ok' : 'warn', $drift <= 5 ? 'In step' : "Differ by $drift seconds. Check CDIMS_TIMEZONE.");

        $dir = cdims_storage_dir();
        $add('Storage folder', is_writable($dir) ? 'ok' : 'fail', is_writable($dir) ? 'Writable' : 'Not writable: the weather cache cannot be saved');

        $production = cdims_env('CDIMS_ENV', 'development') === 'production';
        $add('Production mode', $production ? 'ok' : 'warn', $production ? 'Error details are hidden from visitors' : 'CDIMS_ENV is not "production"');
        $add('HTTPS', isHttps() ? 'ok' : ($production ? 'fail' : 'warn'), isHttps() ? 'This request arrived over HTTPS' : 'This request was not secure (HTTP)');

        $installer = false;
        foreach ([$_SERVER['DOCUMENT_ROOT'] ?? '', dirname($_SERVER['SCRIPT_FILENAME'] ?? '')] as $d) {
            $installer = $installer || ($d !== '' && (is_file($d . '/install.php') || is_file($d . '/../install.php')));
        }
        $add('Installer removed', $installer ? 'warn' : 'ok', $installer ? 'install.php is still on the server. Delete it.' : 'No installer file found');

        $cron = json_decode((string) $this->setting('cron_last_run'), true);
        if (!$cron) {
            $add('Scheduled job (cron)', 'warn', 'It has not run yet. Add the cPanel cron job described in DEPLOYMENT.md.');
        } else {
            $stale = time() - (int) strtotime($cron['at']) > 36 * 3600;
            $add('Scheduled job (cron)', $stale || !$cron['ok'] ? 'warn' : 'ok',
                'Last run ' . $cron['at'] . ($cron['ok'] ? '' : ' with problems') . ($stale ? ' (over a day and a half ago)' : '') . '. ' . $cron['note']);
        }

        $ws = (new Weather())->current();
        $live = !empty($ws['stations']) && empty($ws['stale']);
        $add('Live weather service', $live ? 'ok' : 'warn', $live ? 'Reachable' : (!empty($ws['stations']) ? 'Showing older saved data; the service could not be reached' : 'No data returned'));

        $count = fn(string $sql) => (int) $this->db->query($sql)->fetchColumn();
        $size = $this->db->prepare('SELECT ROUND(SUM(data_length + index_length) / 1048576, 2) FROM information_schema.tables WHERE table_schema = ?');
        $size->execute([DB_NAME]);
        $free = @disk_free_space($dir);

        return [
            'checks' => $checks,
            'counts' => [
                'readings' => $count('SELECT COUNT(*) FROM active_readings'),
                'stations' => $count('SELECT COUNT(*) FROM stations'),
                'users' => $count('SELECT COUNT(*) FROM users'),
                'active_sessions' => $count('SELECT COUNT(*) FROM user_sessions'),
                'published_alerts' => $count("SELECT COUNT(*) FROM alerts WHERE status = 'published'"),
                'draft_alerts' => $count("SELECT COUNT(*) FROM alerts WHERE status = 'draft'"),
                'published_bulletins' => $count("SELECT COUNT(*) FROM bulletins WHERE status = 'published'"),
                'audit_entries' => $count('SELECT COUNT(*) FROM audit_log'),
            ],
            'latest_reading' => $this->db->query('SELECT MAX(observed_on) FROM active_readings')->fetchColumn() ?: null,
            'database_mb' => (float) $size->fetchColumn(),
            'disk_free_mb' => $free === false ? null : (int) round($free / 1048576),
            'php' => PHP_VERSION,
            'server_time' => date('c'),
            'timezone' => date_default_timezone_get(),
            'exports' => self::exportNames(),
        ];
    }

    private function setting(string $key): ?string
    {
        $stmt = $this->db->prepare('SELECT svalue FROM settings WHERE skey = ?');
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        return $v === false ? null : (string) $v;
    }
}
