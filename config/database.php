<?php
/**
 * Database connection and schema.
 * Settings come from environment variables or the private .env file (see env.php):
 * CDIMS_DB_HOST, CDIMS_DB_USER, CDIMS_DB_PASS, CDIMS_DB_NAME. The defaults match a stock XAMPP install.
 */
require_once __DIR__ . '/env.php';

define('DB_SERVER', cdims_env('CDIMS_DB_HOST', 'localhost'));
define('DB_USERNAME', cdims_env('CDIMS_DB_USER', 'root'));
define('DB_PASSWORD', cdims_env('CDIMS_DB_PASS', ''));
define('DB_NAME', cdims_env('CDIMS_DB_NAME', 'cdims_db'));

const PDO_OPTIONS = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

/**
 * Make the database session behave the same on every host:
 *  - time_zone follows PHP's, so NOW() and PHP's time agree (shared hosts usually run MySQL in UTC while the app
 *    runs in Lusaka time, and session timeouts compare the two);
 *  - ONLY_FULL_GROUP_BY is relaxed, because MySQL 5.7+/8 enable it by default and the reports group by station.
 */
function configureConnection(PDO $pdo): PDO
{
    $pdo->exec("SET time_zone = '" . date('P') . "'");
    $pdo->exec("SET SESSION sql_mode = (SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))");
    return $pdo;
}

function getDBConnection(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_SERVER . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = configureConnection(new PDO($dsn, DB_USERNAME, DB_PASSWORD, PDO_OPTIONS));
    }
    return $pdo;
}

/** Zambia Meteorology Department stations used for seeding: code, name, province, lat, lng, elevation(m), base tmax offset */
function seedStations(): array
{
    return [
        ['LUS', 'Lusaka City',   'Lusaka',       -15.4167, 28.2833, 1280,  0.0],
        ['NDO', 'Ndola',         'Copperbelt',   -12.9986, 28.6493, 1270, -0.8],
        ['KIT', 'Kitwe',         'Copperbelt',   -12.8024, 28.2132, 1240, -0.6],
        ['LIV', 'Livingstone',   'Southern',     -17.8219, 25.8228,  986,  2.4],
        ['MFW', 'Mfuwe',         'Eastern',      -13.2589, 31.9366,  571,  3.1],
        ['MBA', 'Mbala',         'Northern',      -8.8447, 31.3347, 1665, -3.2],
        ['KSB', 'Kasama',        'Northern',     -10.2167, 31.1333, 1384, -2.0],
        ['MON', 'Mongu',         'Western',      -15.2544, 23.1623, 1054,  1.2],
        ['PET', 'Petauke',       'Eastern',      -14.2500, 31.3333,  1000,  1.5],
        ['SOL', 'Solwezi',       'North-Western',-12.1822, 26.3894, 1360, -1.4],
    ];
}

/** Generate plausible, clearly-labelled sample data (source = 'sample'). Deterministic. */
function seedSampleReadings(PDO $pdo, int $days = 730): int
{
    mt_srand(20260101);
    $stations = $pdo->query('SELECT id, code FROM stations')->fetchAll();
    $offsets = [];
    foreach (seedStations() as $s) {
        $offsets[$s[0]] = $s[6];
    }

    $insert = $pdo->prepare(
        "INSERT IGNORE INTO climate_readings
            (station_id, observed_on, tmax, tmin, rainfall_mm, humidity, wind_speed, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'sample')"
    );

    $count = 0;
    $end = new DateTimeImmutable('today');
    $pdo->beginTransaction();
    foreach ($stations as $st) {
        $off = $offsets[$st['code']] ?? 0.0;
        for ($i = $days; $i >= 1; $i--) {
            $d = $end->modify("-$i days");
            $m = (int) $d->format('n');
            // Seasonal curves for southern Africa: hot Oct, cool Jun-Jul, rains Nov-Apr
            $doy = (int) $d->format('z');
            $heat = sin(2 * M_PI * ($doy - 200) / 365);          // peaks ~ late Oct
            $wet = in_array($m, [11, 12, 1, 2, 3], true) ? 1.0 : (in_array($m, [4, 10], true) ? 0.3 : 0.0);
            $tmax = 28.5 + $off + 4.0 * $heat - 2.5 * $wet + (mt_rand(-20, 20) / 10);
            $tmin = 15.0 + $off * 0.6 + 4.5 * $heat + 1.5 * $wet + (mt_rand(-15, 15) / 10);
            $rain = 0.0;
            if ($wet > 0 && mt_rand(0, 100) < 25 + 40 * $wet) {
                $rain = round(-log(max(mt_rand(1, 1000) / 1000, 0.001)) * 9 * $wet, 1);
            }
            $humidity = min(98, max(15, round(48 + 28 * $wet + ($rain > 0 ? 12 : 0) + mt_rand(-8, 8))));
            $wind = round(max(0.5, 3.2 + mt_rand(-15, 25) / 10), 1);
            $insert->execute([
                $st['id'], $d->format('Y-m-d'), round($tmax, 1), round(min($tmin, $tmax - 3), 1),
                min($rain, 180), $humidity, $wind,
            ]);
            $count++;
        }
    }
    $pdo->commit();
    return $count;
}

/**
 * Create demo accounts covering every role. All share one password (returned) and are meant for
 * development and demonstrations only. Existing usernames are left untouched.
 *
 * @return array{password: string, created: string[]}
 */
function createDemoUsers(): array
{
    $pdo = getDBConnection();
    $password = getenv('CDIMS_DEMO_PASSWORD') ?: rtrim(strtr(base64_encode(random_bytes(9)), '+/', 'Aa'), '=') . '7!';
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $demo = [
        ['demo.analyst',     'Demo Analyst',                'analyst'],
        ['demo.analyst2',    'Demo Analyst (Copperbelt)',   'analyst'],
        ['demo.agriculture', 'Demo Stakeholder, Agriculture', 'stakeholder'],
        ['demo.water',       'Demo Stakeholder, Water',     'stakeholder'],
        ['demo.public',      'Demo Public Visitor',         'public'],
    ];

    $exists = $pdo->prepare('SELECT 1 FROM users WHERE username = ? OR email = ?');
    $insert = $pdo->prepare('INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?,?,?,?,?)');
    $created = [];
    foreach ($demo as [$username, $name, $role]) {
        $email = "$username@cdims.zm";
        $exists->execute([$username, $email]);
        if ($exists->fetchColumn()) {
            continue;
        }
        $insert->execute([$username, $email, $hash, $name, $role]);
        $created[] = "$username ($role)";
    }
    return ['password' => $password, 'created' => $created];
}

/**
 * Create the database, tables, stations, default admin and (optionally) sample data.
 * Returns ['admin_password' => string|null, 'readings' => int].
 */
/** Add a column only if it is missing. Works on MySQL and MariaDB (MySQL has no ADD COLUMN IF NOT EXISTS). */
function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);
    if (!$stmt->fetchColumn()) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
    }
}

/** Split "name TYPE ..." definitions and ensure each column exists. */
function ensureColumns(PDO $pdo, string $table, array $definitions): void
{
    foreach ($definitions as $def) {
        [$name, $rest] = explode(' ', $def, 2);
        ensureColumn($pdo, $table, $name, $rest);
    }
}

/** Open the database, creating it when the account is allowed to (shared hosting usually pre-creates it). */
function connectForSetup(): PDO
{
    try {
        return configureConnection(new PDO('mysql:host=' . DB_SERVER . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USERNAME, DB_PASSWORD, PDO_OPTIONS));
    } catch (PDOException $e) {
        if ((int) ($e->errorInfo[1] ?? 0) !== 1049) { // 1049 = unknown database
            throw $e;
        }
    }
    $server = new PDO('mysql:host=' . DB_SERVER . ';charset=utf8mb4', DB_USERNAME, DB_PASSWORD, PDO_OPTIONS);
    $server->exec('CREATE DATABASE `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $server->exec('USE `' . DB_NAME . '`');
    return configureConnection($server);
}

/**
 * Create or upgrade the schema. Safe to run repeatedly.
 *
 * @param array{username:string,email:string,full_name:string,password:string}|null $admin the first administrator;
 *        when omitted a random password is generated (and returned) if no administrator exists yet
 */
function initializeDatabase(bool $seed = true, ?array $admin = null): array
{
    $pdo = connectForSetup();

    $table = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role ENUM('admin','analyst','stakeholder','public') NOT NULL DEFAULT 'public',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )$table");

    ensureColumns($pdo, 'users', [
        'preferences TEXT DEFAULT NULL',
        'session_version INT NOT NULL DEFAULT 0',
        'failed_logins INT NOT NULL DEFAULT 0',
        'locked_until DATETIME DEFAULT NULL',
        'lock_count INT NOT NULL DEFAULT 0',
        'password_changed_at DATETIME DEFAULT NULL',
    ]);

    // Brute-force and abuse protection (see RateLimiter)
    $pdo->exec("CREATE TABLE IF NOT EXISTS rate_limits (
        rkey CHAR(40) NOT NULL PRIMARY KEY,
        hits INT NOT NULL DEFAULT 0,
        window_start INT NOT NULL,
        KEY idx_window (window_start)
    )$table");

    // One row per signed-in browser, so sessions can be listed, expired and revoked individually
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_sessions (
        id CHAR(64) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        created_at DATETIME NOT NULL,
        last_seen DATETIME NOT NULL,
        KEY idx_user (user_id),
        KEY idx_seen (last_seen)
    )$table");

    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL UNIQUE,
        attempts INT NOT NULL DEFAULT 1,
        last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )$table");

    $pdo->exec("CREATE TABLE IF NOT EXISTS stations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(10) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        province VARCHAR(50) NOT NULL,
        latitude DECIMAL(9,6) NOT NULL,
        longitude DECIMAL(9,6) NOT NULL,
        elevation_m INT DEFAULT NULL
    )$table");

    $pdo->exec("CREATE TABLE IF NOT EXISTS climate_readings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        station_id INT NOT NULL,
        observed_on DATE NOT NULL,
        tmax DECIMAL(4,1) DEFAULT NULL,
        tmin DECIMAL(4,1) DEFAULT NULL,
        rainfall_mm DECIMAL(5,1) DEFAULT NULL,
        humidity TINYINT UNSIGNED DEFAULT NULL,
        wind_speed DECIMAL(4,1) DEFAULT NULL,
        source ENUM('manual','import','sample') NOT NULL DEFAULT 'manual',
        created_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_station_day (station_id, observed_on),
        KEY idx_day (observed_on),
        CONSTRAINT fk_reading_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    )$table");

    // Data lineage and quality (thesis: quality flags, audit trail, deleted records are retained)
    ensureColumns($pdo, 'climate_readings', [
        "quality_flag ENUM('ok','suspect','estimated') NOT NULL DEFAULT 'ok'",
        "origin ENUM('station','sensor','satellite','model') NOT NULL DEFAULT 'station'",
        'deleted_at DATETIME DEFAULT NULL',
        'updated_by INT DEFAULT NULL',
        'updated_at DATETIME DEFAULT NULL',
        'qc_note VARCHAR(255) DEFAULT NULL',
    ]);
    $pdo->exec("ALTER TABLE climate_readings MODIFY COLUMN source ENUM('manual','import','sample','estimated') NOT NULL DEFAULT 'manual'");
    ensureColumns($pdo, 'stations', [
        "status ENUM('active','inactive') NOT NULL DEFAULT 'active'",
        'established_year SMALLINT DEFAULT NULL',
        'notes VARCHAR(255) DEFAULT NULL',
        'instruments VARCHAR(255) DEFAULT NULL',
    ]);

    // Public warnings and bulletins. Alerts and bulletins start as drafts and are published by a person.
    $pdo->exec("CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hazard ENUM('heat','cold','heavy_rain','flood','drought','dry_spell','strong_wind','other') NOT NULL,
        severity ENUM('advisory','watch','warning') NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        advice TEXT,
        areas TEXT,
        basis ENUM('observed','forecast','manual') NOT NULL DEFAULT 'manual',
        starts_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        status ENUM('draft','published','cancelled') NOT NULL DEFAULT 'draft',
        origin ENUM('auto','manual') NOT NULL DEFAULT 'manual',
        fingerprint CHAR(40) DEFAULT NULL,
        evidence TEXT,
        cancel_reason VARCHAR(255) DEFAULT NULL,
        created_by INT DEFAULT NULL,
        published_by INT DEFAULT NULL,
        published_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT NULL,
        UNIQUE KEY uq_fingerprint (fingerprint),
        KEY idx_status (status, expires_at)
    )$table");

    $pdo->exec("CREATE TABLE IF NOT EXISTS bulletins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kind ENUM('daily','weekly') NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        title VARCHAR(200) NOT NULL,
        summary TEXT NOT NULL,
        notes TEXT,
        content MEDIUMTEXT NOT NULL,
        status ENUM('draft','published') NOT NULL DEFAULT 'draft',
        created_by INT DEFAULT NULL,
        published_by INT DEFAULT NULL,
        published_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT NULL,
        UNIQUE KEY uq_kind_period (kind, period_start),
        KEY idx_status (status, published_at)
    )$table");

    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        skey VARCHAR(60) NOT NULL PRIMARY KEY,
        svalue TEXT,
        updated_by INT DEFAULT NULL,
        updated_at DATETIME DEFAULT NULL
    )$table");

    $pdo->exec("CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        username VARCHAR(50) DEFAULT NULL,
        action VARCHAR(40) NOT NULL,
        entity VARCHAR(30) NOT NULL,
        entity_id VARCHAR(40) DEFAULT NULL,
        detail TEXT,
        ip_address VARCHAR(45) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_created (created_at),
        KEY idx_entity (entity, entity_id)
    )$table");

    // Reads go through this view so soft-deleted readings disappear everywhere without being lost
    $pdo->exec('CREATE OR REPLACE VIEW active_readings AS SELECT * FROM climate_readings WHERE deleted_at IS NULL');

    $ins = $pdo->prepare(
        'INSERT IGNORE INTO stations (code, name, province, latitude, longitude, elevation_m) VALUES (?,?,?,?,?,?)'
    );
    foreach (seedStations() as $s) {
        $ins->execute([$s[0], $s[1], $s[2], $s[3], $s[4], $s[5]]);
    }

    $adminPassword = null;
    if ((int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn() === 0) {
        if ($admin) {
            $pdo->prepare("INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?,?,?,?, 'admin')")
                ->execute([$admin['username'], $admin['email'], password_hash($admin['password'], PASSWORD_BCRYPT), $admin['full_name']]);
        } else {
            $adminPassword = cdims_env('CDIMS_ADMIN_PASSWORD') ?: rtrim(strtr(base64_encode(random_bytes(9)), '+/', 'Aa'), '=') . '9!';
            $pdo->prepare(
                "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('admin','admin@cdims.zm',?,'System Administrator','admin')"
            )->execute([password_hash($adminPassword, PASSWORD_BCRYPT)]);
        }
    }

    $readings = 0;
    if ($seed && (int) $pdo->query('SELECT COUNT(*) FROM climate_readings')->fetchColumn() === 0) {
        $readings = seedSampleReadings($pdo);
    }

    return ['admin_password' => $adminPassword, 'readings' => $readings];
}
