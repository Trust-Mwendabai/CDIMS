<?php
/**
 * Climate: stations, readings, validation, import and dashboard aggregates.
 */
class Climate
{
    private const FIELDS = [
        // field => [min, max]
        'tmax'        => [-20, 55],
        'tmin'        => [-20, 45],
        'rainfall_mm' => [0, 500],
        'humidity'    => [0, 100],
        'wind_speed'  => [0, 150],
    ];

    public const ORIGINS = ['station', 'sensor', 'satellite', 'model'];
    public const FLAGS = ['ok', 'suspect', 'estimated'];

    private PDO $db;

    public function __construct()
    {
        $this->db = getDBConnection();
    }

    public function stations(): array
    {
        return $this->db->query(
            'SELECT s.id, s.code, s.name, s.province, s.latitude, s.longitude, s.elevation_m,
                    s.status, s.established_year, s.notes, s.instruments, COUNT(r.id) AS readings, MAX(r.observed_on) AS last_reading
             FROM stations s LEFT JOIN active_readings r ON r.station_id = s.id
             GROUP BY s.id ORDER BY s.name'
        )->fetchAll();
    }

    private function where(array $f, array &$params): string
    {
        $w = [];
        if (!empty($f['station'])) {
            $w[] = 'r.station_id = ?';
            $params[] = (int) $f['station'];
        }
        if (!empty($f['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $f['from'])) {
            $w[] = 'r.observed_on >= ?';
            $params[] = $f['from'];
        }
        if (!empty($f['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $f['to'])) {
            $w[] = 'r.observed_on <= ?';
            $params[] = $f['to'];
        }
        if (!empty($f['origin']) && in_array($f['origin'], self::ORIGINS, true)) {
            $w[] = 'r.origin = ?';
            $params[] = $f['origin'];
        }
        if (!empty($f['flag']) && in_array($f['flag'], self::FLAGS, true)) {
            $w[] = 'r.quality_flag = ?';
            $params[] = $f['flag'];
        }
        return $w ? 'WHERE ' . implode(' AND ', $w) : '';
    }

    public function readings(array $f, int $page, int $per): array
    {
        $params = [];
        $where = $this->where($f, $params);

        $stmt = $this->db->prepare("SELECT COUNT(*) FROM active_readings r $where");
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        $per = max(1, min($per, 200));
        $page = max(1, $page);
        $sql = "SELECT r.id, s.code AS station_code, s.name AS station, r.observed_on, r.tmax, r.tmin,
                       r.rainfall_mm, r.humidity, r.wind_speed, r.source, r.origin, r.quality_flag, r.qc_note, s.id AS station_id
                FROM active_readings r JOIN stations s ON s.id = r.station_id
                $where ORDER BY r.observed_on DESC, s.name LIMIT $per OFFSET " . (($page - 1) * $per);
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return ['rows' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'per' => $per];
    }

    public function exportRows(array $f): Generator
    {
        $params = [];
        $where = $this->where($f, $params);
        $stmt = $this->db->prepare(
            "SELECT s.code, r.observed_on, r.tmax, r.tmin, r.rainfall_mm, r.humidity, r.wind_speed
             FROM active_readings r JOIN stations s ON s.id = r.station_id
             $where ORDER BY r.observed_on, s.code"
        );
        $stmt->execute($params);
        while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
            yield $row;
        }
    }

    /** Validate a reading; returns cleaned values or throws InvalidArgumentException. */
    public function validate(array $in): array
    {
        $date = $in['observed_on'] ?? '';
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', (string) $date);
        if (!$d || $d->format('Y-m-d') !== $date) {
            throw new InvalidArgumentException('Date must be in YYYY-MM-DD format.');
        }
        if ($d > new DateTimeImmutable('today')) {
            throw new InvalidArgumentException('Date cannot be in the future.');
        }

        $out = ['observed_on' => $date];
        foreach (self::FIELDS as $field => [$min, $max]) {
            $v = $in[$field] ?? null;
            if ($v === null || $v === '') {
                $out[$field] = null;
                continue;
            }
            if (!is_numeric($v) || $v < $min || $v > $max) {
                throw new InvalidArgumentException("$field must be a number between $min and $max.");
            }
            $out[$field] = $field === 'humidity' ? (int) round((float) $v) : round((float) $v, 1);
        }
        if ($out['tmax'] !== null && $out['tmin'] !== null && $out['tmin'] > $out['tmax']) {
            throw new InvalidArgumentException('Minimum temperature cannot exceed maximum temperature.');
        }
        if (count(array_filter($out, fn($v) => $v !== null)) < 2) {
            throw new InvalidArgumentException('Provide at least one measurement.');
        }
        return $out;
    }

    /** Insert a reading, or replace the one for that station and day (also revives a soft-deleted one). Returns its id. */
    public function save(int $stationId, array $clean, string $source, int $userId, string $origin = 'station', string $flag = 'ok', ?string $note = null): int
    {
        if (!in_array($origin, self::ORIGINS, true) || !in_array($flag, self::FLAGS, true)) {
            throw new InvalidArgumentException('Unknown origin or quality flag.');
        }
        $this->db->prepare(
            'INSERT INTO climate_readings
                (station_id, observed_on, tmax, tmin, rainfall_mm, humidity, wind_speed, source, origin, quality_flag, qc_note, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE tmax = VALUES(tmax), tmin = VALUES(tmin), rainfall_mm = VALUES(rainfall_mm),
                humidity = VALUES(humidity), wind_speed = VALUES(wind_speed), source = VALUES(source),
                origin = VALUES(origin), quality_flag = VALUES(quality_flag), qc_note = VALUES(qc_note),
                created_by = VALUES(created_by), deleted_at = NULL, updated_by = VALUES(created_by), updated_at = NOW()'
        )->execute([
            $stationId, $clean['observed_on'], $clean['tmax'], $clean['tmin'], $clean['rainfall_mm'],
            $clean['humidity'], $clean['wind_speed'], $source, $origin, $flag, $note, $userId,
        ]);
        $stmt = $this->db->prepare('SELECT id FROM climate_readings WHERE station_id = ? AND observed_on = ?');
        $stmt->execute([$stationId, $clean['observed_on']]);
        return (int) $stmt->fetchColumn();
    }

    public function reading(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT r.*, s.code AS station_code FROM active_readings r JOIN stations s ON s.id = r.station_id WHERE r.id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    /** Edit the measurements, quality flag and origin of an existing reading (station and date are fixed). */
    public function updateReading(int $id, array $in, int $userId): array
    {
        $old = $this->reading($id);
        if (!$old) {
            throw new InvalidArgumentException('Reading not found.');
        }
        $clean = $this->validate(['observed_on' => $old['observed_on']] + $in);
        $clean['observed_on'] = $old['observed_on'];
        $flag = $in['quality_flag'] ?? $old['quality_flag'];
        $origin = $in['origin'] ?? $old['origin'];
        if (!in_array($origin, self::ORIGINS, true) || !in_array($flag, self::FLAGS, true)) {
            throw new InvalidArgumentException('Unknown origin or quality flag.');
        }
        $this->db->prepare(
            "UPDATE climate_readings SET tmax=?, tmin=?, rainfall_mm=?, humidity=?, wind_speed=?, origin=?, quality_flag=?,
                    qc_note = IF(? = 'ok', NULL, qc_note), updated_by=?, updated_at=NOW() WHERE id=? AND deleted_at IS NULL"
        )->execute([
            $clean['tmax'], $clean['tmin'], $clean['rainfall_mm'], $clean['humidity'], $clean['wind_speed'],
            $origin, $flag, $flag, $userId, $id,
        ]);
        return ['before' => array_intersect_key($old, array_flip(['tmax', 'tmin', 'rainfall_mm', 'humidity', 'wind_speed', 'origin', 'quality_flag'])),
                'after' => $clean + ['origin' => $origin, 'quality_flag' => $flag], 'station' => $old['station_code'], 'date' => $old['observed_on']];
    }

    /** Soft delete: the row stays in the database (thesis requirement) but disappears from every view. */
    public function deleteReading(int $id, int $userId): array
    {
        $old = $this->reading($id);
        if (!$old) {
            throw new InvalidArgumentException('Reading not found.');
        }
        $this->db->prepare('UPDATE climate_readings SET deleted_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$userId, $id]);
        return ['station' => $old['station_code'], 'date' => $old['observed_on']];
    }

    private function cleanStation(array $in): array
    {
        $code = strtoupper(trim((string) ($in['code'] ?? '')));
        $name = trim((string) ($in['name'] ?? ''));
        $province = trim((string) ($in['province'] ?? ''));
        if (!preg_match('/^[A-Z0-9]{2,10}$/', $code)) {
            throw new InvalidArgumentException('Code must be 2-10 letters or numbers.');
        }
        if ($name === '' || mb_strlen($name) > 100 || $province === '' || mb_strlen($province) > 50) {
            throw new InvalidArgumentException('Name and province are required.');
        }
        foreach (['latitude' => 90, 'longitude' => 180] as $k => $max) {
            if (!isset($in[$k]) || !is_numeric($in[$k]) || abs((float) $in[$k]) > $max) {
                throw new InvalidArgumentException(ucfirst($k) . " must be a number between -$max and $max.");
            }
        }
        $elev = $in['elevation_m'] ?? null;
        if ($elev !== null && $elev !== '' && (!is_numeric($elev) || $elev < -500 || $elev > 9000)) {
            throw new InvalidArgumentException('Elevation must be between -500 and 9000 m.');
        }
        $year = $in['established_year'] ?? null;
        if ($year !== null && $year !== '' && (!is_numeric($year) || $year < 1800 || $year > (int) date('Y'))) {
            throw new InvalidArgumentException('Established year is not valid.');
        }
        $status = $in['status'] ?? 'active';
        if (!in_array($status, ['active', 'inactive'], true)) {
            throw new InvalidArgumentException('Unknown status.');
        }
        return [
            'code' => $code, 'name' => $name, 'province' => $province,
            'latitude' => round((float) $in['latitude'], 6), 'longitude' => round((float) $in['longitude'], 6),
            'elevation_m' => ($elev === null || $elev === '') ? null : (int) $elev,
            'established_year' => ($year === null || $year === '') ? null : (int) $year,
            'status' => $status, 'notes' => mb_substr(trim((string) ($in['notes'] ?? '')), 0, 255) ?: null,
            'instruments' => mb_substr(trim((string) ($in['instruments'] ?? '')), 0, 255) ?: null,
        ];
    }

    public function createStation(array $in): array
    {
        $s = $this->cleanStation($in);
        try {
            $this->db->prepare(
                'INSERT INTO stations (code, name, province, latitude, longitude, elevation_m, status, established_year, notes, instruments)
                 VALUES (:code,:name,:province,:latitude,:longitude,:elevation_m,:status,:established_year,:notes,:instruments)'
            )->execute($s);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new InvalidArgumentException('A station with that code already exists.');
            }
            throw $e;
        }
        return $s;
    }

    public function updateStation(int $id, array $in): array
    {
        $s = $this->cleanStation($in);
        try {
            $this->db->prepare(
                'UPDATE stations SET code=:code, name=:name, province=:province, latitude=:latitude, longitude=:longitude,
                        elevation_m=:elevation_m, status=:status, established_year=:established_year, notes=:notes,
                        instruments=:instruments WHERE id=:id'
            )->execute($s + ['id' => $id]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new InvalidArgumentException('A station with that code already exists.');
            }
            throw $e;
        }
        return $s;
    }

    /**
     * Monthly and overall summaries per station, for a calendar year or (when $from and $to are given) a custom range.
     * Month keys are 1-12 for a calendar year and 'YYYY-MM' for a custom range.
     */
    public function report(int $year, ?int $stationId, ?string $from = null, ?string $to = null): array
    {
        $custom = $from && $to && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to);
        if ($custom && $from > $to) {
            throw new InvalidArgumentException('The start date must be before the end date.');
        }
        if ($custom && (new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days > 3660) {
            throw new InvalidArgumentException('Choose a range of 10 years or less.');
        }
        $monthExpr = $custom ? "DATE_FORMAT(r.observed_on, '%Y-%m')" : 'MONTH(r.observed_on)';
        $params = $custom ? [$from, $to] : [$year];
        $sql = "SELECT s.id, s.code, s.name, $monthExpr AS m,
                       ROUND(AVG(r.tmax), 1) AS tmax, ROUND(AVG(r.tmin), 1) AS tmin,
                       ROUND(SUM(r.rainfall_mm), 1) AS rain, SUM(r.rainfall_mm >= 1) AS rain_days,
                       MAX(r.tmax) AS hottest, MIN(r.tmin) AS coldest, COUNT(*) AS days
                FROM active_readings r JOIN stations s ON s.id = r.station_id
                WHERE " . ($custom ? 'r.observed_on BETWEEN ? AND ?' : 'YEAR(r.observed_on) = ?');
        if ($stationId) {
            $sql .= ' AND r.station_id = ?';
            $params[] = $stationId;
        }
        $sql .= ' GROUP BY s.id, m ORDER BY s.name, m';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        $stations = [];
        foreach ($stmt->fetchAll() as $r) {
            $id = $r['id'];
            $stations[$id] ??= ['id' => $id, 'code' => $r['code'], 'name' => $r['name'], 'months' => []];
            $stations[$id]['months'][$custom ? (string) $r['m'] : (int) $r['m']] = [
                'tmax' => $r['tmax'], 'tmin' => $r['tmin'], 'rain' => $r['rain'], 'rain_days' => (int) $r['rain_days'],
                'hottest' => $r['hottest'], 'coldest' => $r['coldest'], 'days' => (int) $r['days'],
            ];
        }
        foreach ($stations as &$st) {
            $m = $st['months'];
            $days = array_sum(array_column($m, 'days'));
            $st['year'] = [
                'tmax' => $days ? round(array_sum(array_map(fn($x) => $x['tmax'] * $x['days'], $m)) / $days, 1) : null,
                'tmin' => $days ? round(array_sum(array_map(fn($x) => $x['tmin'] * $x['days'], $m)) / $days, 1) : null,
                'rain' => round(array_sum(array_column($m, 'rain')), 1),
                'rain_days' => array_sum(array_column($m, 'rain_days')),
                'hottest' => max(array_column($m, 'hottest')),
                'coldest' => min(array_column($m, 'coldest')),
                'days' => $days,
            ];
        }
        unset($st);

        $years = array_map('intval', $this->db->query('SELECT DISTINCT YEAR(observed_on) FROM active_readings ORDER BY 1 DESC')->fetchAll(PDO::FETCH_COLUMN));
        $asOf = $this->db->query('SELECT MAX(observed_on) FROM active_readings')->fetchColumn() ?: null;
        return [
            'year' => $year, 'years' => $years, 'stations' => array_values($stations),
            'range' => $custom ? ['from' => $from, 'to' => $to] : null,
            'as_of' => $asOf, // the date the data runs to, so months after it can be shown as "not reached yet"
        ];
    }

    /** Year-by-year figures for one station (or the national average), for comparing years. */
    public function compareYears(?int $stationId, int $fromYear, int $toYear): array
    {
        if ($fromYear > $toYear || $toYear - $fromYear > 40) {
            throw new InvalidArgumentException('Choose a valid span of years.');
        }
        $params = [$fromYear, $toYear];
        $where = 'YEAR(r.observed_on) BETWEEN ? AND ?';
        if ($stationId) {
            $where .= ' AND r.station_id = ?';
            $params[] = $stationId;
        }
        $stmt = $this->db->prepare(
            "SELECT YEAR(r.observed_on) AS year, COUNT(DISTINCT r.station_id) AS stations, COUNT(*) AS readings,
                    ROUND(AVG(r.tmax), 1) AS tmax, ROUND(AVG(r.tmin), 1) AS tmin,
                    ROUND(SUM(r.rainfall_mm) / COUNT(DISTINCT r.station_id), 1) AS rain,
                    ROUND(SUM(r.rainfall_mm >= 1) / COUNT(DISTINCT r.station_id)) AS rain_days,
                    MAX(r.tmax) AS hottest, MIN(r.tmin) AS coldest
             FROM active_readings r WHERE $where GROUP BY year ORDER BY year"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $years = array_map('intval', $this->db->query('SELECT DISTINCT YEAR(observed_on) FROM active_readings ORDER BY 1 DESC')->fetchAll(PDO::FETCH_COLUMN));
        return ['rows' => $rows, 'years' => $years, 'scope' => $stationId ? 'station' : 'national'];
    }

    /** Completeness and quality indicators used to evaluate the data holdings (thesis: data accuracy KPIs). */
    public function quality(): array
    {
        $latest = $this->db->query('SELECT MAX(observed_on) FROM active_readings')->fetchColumn();
        if (!$latest) {
            return ['latest' => null, 'stations' => [], 'totals' => null];
        }
        $stmt = $this->db->prepare(
            "SELECT s.id, s.code, s.name, s.status, COUNT(r.id) AS days_reported,
                    COALESCE(SUM(r.quality_flag <> 'ok'), 0) AS flagged, MAX(r.observed_on) AS last_reading
             FROM stations s
             LEFT JOIN active_readings r ON r.station_id = s.id AND r.observed_on > DATE_SUB(?, INTERVAL 30 DAY)
             GROUP BY s.id ORDER BY s.name"
        );
        $stmt->execute([$latest]);
        $stations = array_map(function ($r) {
            $r['completeness'] = round(min(100, $r['days_reported'] / 30 * 100));
            return $r;
        }, $stmt->fetchAll());

        $totals = $this->db->query(
            "SELECT (SELECT COUNT(*) FROM active_readings) AS readings,
                    (SELECT COUNT(*) FROM climate_readings WHERE deleted_at IS NOT NULL) AS deleted,
                    (SELECT COUNT(*) FROM active_readings WHERE quality_flag <> 'ok') AS flagged,
                    (SELECT COUNT(*) FROM active_readings WHERE source = 'sample') AS sample"
        )->fetch();
        $byOrigin = $this->db->query('SELECT origin, COUNT(*) AS n FROM active_readings GROUP BY origin')->fetchAll();
        return ['latest' => $latest, 'stations' => $stations, 'totals' => $totals, 'origins' => $byOrigin];
    }

    public function stationIdByCode(string $code): ?int
    {
        $stmt = $this->db->prepare('SELECT id FROM stations WHERE code = ?');
        $stmt->execute([strtoupper(trim($code))]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    public const UNITS = ['temp' => ['c', 'f', 'k'], 'wind' => ['ms', 'kmh', 'kn', 'mph'], 'rain' => ['mm', 'in']];

    /** Parse a date written as YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY into YYYY-MM-DD. */
    public static function normalizeDate(string $raw): string
    {
        $raw = trim($raw);
        if (preg_match('/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/', $raw, $m)) {
            [$y, $mo, $d] = [$m[1], $m[2], $m[3]];
        } elseif (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/', $raw, $m)) {
            [$d, $mo, $y] = [$m[1], $m[2], $m[3]]; // day first, the convention used in Zambia
        } else {
            throw new InvalidArgumentException("Unrecognised date \"$raw\". Use YYYY-MM-DD or DD/MM/YYYY.");
        }
        if (!checkdate((int) $mo, (int) $d, (int) $y)) {
            throw new InvalidArgumentException("\"$raw\" is not a real calendar date.");
        }
        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    }

    /** Parse "25,4" or "25.4" and convert to the stored unit (°C, m/s, mm). Returns null for blanks. */
    private static function toStored(?string $raw, string $kind, string $unit)
    {
        if ($raw === null || trim($raw) === '' || in_array(strtolower(trim($raw)), ['na', 'n/a', 'nan', '-', '--', 'null'], true)) {
            return null;
        }
        $s = str_replace([' ', ','], ['', '.'], trim($raw));
        if (!is_numeric($s)) {
            throw new InvalidArgumentException("\"$raw\" is not a number.");
        }
        $v = (float) $s;
        return match ($kind) {
            'temp' => match ($unit) { 'f' => ($v - 32) / 1.8, 'k' => $v - 273.15, default => $v },
            'wind' => match ($unit) { 'kmh' => $v / 3.6, 'kn' => $v * 0.514444, 'mph' => $v * 0.44704, default => $v },
            'rain' => $unit === 'in' ? $v * 25.4 : $v,
            default => $v,
        };
    }

    /**
     * Import a CSV: station_code,date,tmax,tmin,rainfall_mm,humidity,wind_speed.
     * Standardises dates, decimal commas, missing-value markers and units, flags anomalies, rejects duplicate rows.
     * Valid rows are saved, invalid rows are reported (max 20 messages).
     *
     * @param array{temp?: string, wind?: string, rain?: string} $units
     * @param array{dry_run?: bool, mapping?: array<string,string>} $opts dry_run validates everything and saves nothing;
     *        mapping renames file headers to canonical fields (for archives with their own column names)
     */
    public function importCsv(string $path, int $userId, string $origin = 'station', array $units = [], array $opts = []): array
    {
        $dry = !empty($opts['dry_run']);
        $mapping = [];
        foreach (($opts['mapping'] ?? []) as $from => $to) {
            if ($to === '_ignore' || in_array($to, self::IMPORT_FIELDS, true)) { // '_ignore' drops a column even if its name looks familiar
                $mapping[strtolower(trim((string) $from))] = $to;
            }
        }
        $units = array_merge(['temp' => 'c', 'wind' => 'ms', 'rain' => 'mm'], array_filter($units));
        foreach ($units as $kind => $u) {
            if (!in_array($u, self::UNITS[$kind] ?? [], true)) {
                throw new InvalidArgumentException("Unknown $kind unit.");
            }
        }
        $fh = fopen($path, 'r');
        if (!$fh) {
            throw new RuntimeException('Could not read the uploaded file.');
        }
        $first = fgets($fh);
        rewind($fh);
        // Commas, semicolons (Excel in many locales) or tabs (pasted from a spreadsheet)
        $counts = [',' => substr_count((string) $first, ','), ';' => substr_count((string) $first, ';'), "\t" => substr_count((string) $first, "\t")];
        arsort($counts);
        $delim = (string) array_key_first($counts);
        $rawHeader = fgetcsv($fh, 0, $delim) ?: [];
        $rawHeader = array_map(fn($h) => strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $rawHeader);
        $fileHeaders = $rawHeader;
        // user mapping wins, then well-known aliases (spaces, hyphens and underscores are interchangeable), then the name as written
        $norm = fn(string $h) => preg_replace('/[\s\-]+/', '_', trim($h));
        $aliases = [];
        foreach (self::HEADER_ALIASES as $alias => $field) {
            $aliases[$norm($alias)] = $field;
        }
        foreach (self::IMPORT_FIELDS as $field) {
            $aliases[$field] = $field;
        }
        $header = array_map(fn($h) => $mapping[$h] ?? $aliases[$norm($h)] ?? $h, $rawHeader);
        $missing = array_values(array_filter(['station_code', 'date'], fn($col) => !in_array($col, $header, true)));
        $hasMeasure = count(array_filter($header, fn($h) => in_array($h, ['tmax', 'tmin', 'rainfall_mm', 'humidity', 'wind_speed'], true))) > 0;
        if ($missing || !$hasMeasure) {
            fclose($fh);
            if ($dry) {
                // Not an error in preview mode: tell the screen which columns it needs the user to map
                return ['dry_run' => true, 'needs_mapping' => true, 'missing' => $missing, 'needs_measure' => !$hasMeasure,
                    'columns' => ['file' => $fileHeaders, 'mapped' => $header], 'fields' => self::IMPORT_FIELDS];
            }
            throw new InvalidArgumentException($missing
                ? "Missing required column: {$missing[0]}. Map it to one of your file's columns."
                : 'No measurement columns were recognised. Map at least one of tmax, tmin, rainfall_mm, humidity or wind_speed.');
        }

        $saved = $skipped = $flagged = $line = 0;
        $line = 1;
        $errors = [];
        $errorRows = [];
        $seen = [];
        $preview = [];
        $byStation = [];
        $wouldCreate = $wouldReplace = 0;
        $minDate = $maxDate = null;
        $exists = $this->db->prepare('SELECT 1 FROM active_readings WHERE station_id = ? AND observed_on = ?');
        $this->db->beginTransaction();
        while (($cells = fgetcsv($fh, 0, $delim)) !== false) {
            $line++;
            if ($cells === [null]) {
                continue;
            }
            $row = array_combine($header, array_pad(array_slice($cells, 0, count($header)), count($header), null));
            try {
                $stationId = $this->stationIdByCode((string) $row['station_code']);
                if (!$stationId) {
                    throw new InvalidArgumentException('Unknown station code "' . $row['station_code'] . '".');
                }
                $date = self::normalizeDate((string) $row['date']);
                $key = "$stationId|$date";
                if (isset($seen[$key])) {
                    throw new InvalidArgumentException("Duplicate of line {$seen[$key]} (same station and date).");
                }
                $seen[$key] = $line;

                $std = [
                    'observed_on' => $date,
                    'tmax' => self::toStored($row['tmax'] ?? null, 'temp', $units['temp']),
                    'tmin' => self::toStored($row['tmin'] ?? null, 'temp', $units['temp']),
                    'rainfall_mm' => self::toStored($row['rainfall_mm'] ?? null, 'rain', $units['rain']),
                    'humidity' => self::toStored($row['humidity'] ?? null, 'plain', 'x'),
                    'wind_speed' => self::toStored($row['wind_speed'] ?? null, 'wind', $units['wind']),
                ];
                $clean = $this->validate($std);
                $note = $this->qcCheck($stationId, $clean);
                $exists->execute([$stationId, $date]);
                $replaces = (bool) $exists->fetchColumn();
                if (!$dry) {
                    $this->save($stationId, $clean, 'import', $userId, $origin, $note ? 'suspect' : 'ok', $note);
                }
                $saved++;
                $flagged += $note ? 1 : 0;
                $replaces ? $wouldReplace++ : $wouldCreate++;
                $code = strtoupper(trim((string) $row['station_code']));
                $byStation[$code] = ($byStation[$code] ?? 0) + 1;
                $minDate = $minDate === null || $date < $minDate ? $date : $minDate;
                $maxDate = $maxDate === null || $date > $maxDate ? $date : $maxDate;
                if ($dry && count($preview) < 25) {
                    $preview[] = ['line' => $line, 'station' => $code] + $clean + ['replaces' => $replaces, 'flag' => $note ? 'suspect' : 'ok', 'note' => $note];
                }
            } catch (InvalidArgumentException $e) {
                $skipped++;
                if (count($errors) < ($dry ? 200 : 20)) {
                    $errors[] = "Line $line: " . $e->getMessage();
                }
                if (count($errorRows) < 1000) {
                    $errorRows[] = ['line' => $line, 'message' => $e->getMessage()];
                }
            }
        }
        if ($dry) {
            $this->db->rollBack(); // nothing was written, but keep the transaction semantics identical
        } else {
            $this->db->commit();
        }
        fclose($fh);
        arsort($byStation);
        return [
            'dry_run' => $dry, 'saved' => $saved, 'skipped' => $skipped, 'flagged' => $flagged, 'errors' => $errors,
            'would_create' => $wouldCreate, 'would_replace' => $wouldReplace,
            'preview' => $preview, 'error_rows' => $errorRows, 'range' => $minDate ? ['from' => $minDate, 'to' => $maxDate] : null,
            'stations' => array_map(fn($c, $n) => ['code' => $c, 'rows' => $n], array_keys($byStation), $byStation),
            'columns' => ['file' => $fileHeaders, 'mapped' => $header],
        ];
    }

    /** Fields an import column can be mapped to. */
    public const IMPORT_FIELDS = ['station_code', 'date', 'tmax', 'tmin', 'rainfall_mm', 'humidity', 'wind_speed'];

    /** Common names for the same columns, so paper-archive spreadsheets import without manual mapping. */
    private const HEADER_ALIASES = [
        'station' => 'station_code', 'stn' => 'station_code', 'code' => 'station_code', 'station code' => 'station_code', 'station_id' => 'station_code',
        'observed_on' => 'date', 'obs_date' => 'date', 'day' => 'date', 'datum' => 'date', 'observation date' => 'date',
        'max' => 'tmax', 'tx' => 'tmax', 'max temp' => 'tmax', 'max_temp' => 'tmax', 'maximum temperature' => 'tmax', 'temp_max' => 'tmax', 'tmax_c' => 'tmax',
        'min' => 'tmin', 'tn' => 'tmin', 'min temp' => 'tmin', 'min_temp' => 'tmin', 'minimum temperature' => 'tmin', 'temp_min' => 'tmin', 'tmin_c' => 'tmin',
        'rain' => 'rainfall_mm', 'rainfall' => 'rainfall_mm', 'precip' => 'rainfall_mm', 'precipitation' => 'rainfall_mm', 'prcp' => 'rainfall_mm', 'rain_mm' => 'rainfall_mm',
        'rh' => 'humidity', 'rel humidity' => 'humidity', 'relative humidity' => 'humidity', 'humidity_pct' => 'humidity',
        'wind' => 'wind_speed', 'windspeed' => 'wind_speed', 'wind speed' => 'wind_speed', 'wspd' => 'wind_speed', 'ws' => 'wind_speed',
    ];

    /**
     * Save readings queued on a device while it was offline. Each item is validated and quality-checked on its own, so
     * one bad entry never blocks the rest. Saving is an upsert, so retrying a batch is safe.
     *
     * @param array<int, array<string,mixed>> $items
     * @return array{results: array<int, array<string,mixed>>, saved: int, failed: int}
     */
    public function saveBatch(array $items, int $userId): array
    {
        $results = [];
        $saved = $failed = 0;
        foreach (array_slice($items, 0, 200) as $i => $it) {
            try {
                $stationId = $this->stationIdByCode((string) ($it['station_code'] ?? ''));
                if (!$stationId) {
                    throw new InvalidArgumentException('Unknown station.');
                }
                $clean = $this->validate($it);
                $note = $this->qcCheck($stationId, $clean);
                $flag = (string) ($it['quality_flag'] ?? 'ok');
                if ($note && $flag === 'ok') {
                    $flag = 'suspect';
                }
                $id = $this->save($stationId, $clean, 'manual', $userId, (string) ($it['origin'] ?? 'station'), $flag, $note);
                $results[] = ['index' => $i, 'ok' => true, 'id' => $id, 'flagged' => $note];
                $saved++;
            } catch (InvalidArgumentException $e) {
                $results[] = ['index' => $i, 'ok' => false, 'error' => $e->getMessage()];
                $failed++;
            }
        }
        return ['results' => $results, 'saved' => $saved, 'failed' => $failed];
    }

    /** @var array<string, array|null> station+month statistics cache for qcCheck */
    private array $statCache = [];

    /**
     * Automatic quality control for one reading. Returns a note describing the anomaly, or null if it looks plausible.
     * Rules: very wide diurnal range, extreme rainfall, and temperatures more than 4 standard deviations from the
     * station's usual value for that calendar month (needs at least 30 earlier readings, per WMO's 30-sample guidance).
     */
    public function qcCheck(int $stationId, array $c): ?string
    {
        $notes = [];
        if ($c['tmax'] !== null && $c['tmin'] !== null && $c['tmax'] - $c['tmin'] > 30) {
            $notes[] = sprintf('Diurnal range of %.1f°C is unusually large', $c['tmax'] - $c['tmin']);
        }
        if ($c['rainfall_mm'] !== null && $c['rainfall_mm'] >= 200) {
            $notes[] = "Rainfall of {$c['rainfall_mm']} mm in one day is extreme";
        }
        $month = (int) substr($c['observed_on'], 5, 2);
        $key = "$stationId|$month";
        if (!array_key_exists($key, $this->statCache)) {
            $stmt = $this->db->prepare(
                'SELECT COUNT(*) AS n, AVG(tmax) AS mt, STDDEV_SAMP(tmax) AS st, AVG(tmin) AS mn, STDDEV_SAMP(tmin) AS sn
                 FROM active_readings WHERE station_id = ? AND MONTH(observed_on) = ?'
            );
            $stmt->execute([$stationId, $month]);
            $s = $stmt->fetch();
            $this->statCache[$key] = ($s && $s['n'] >= 30) ? $s : null;
        }
        if ($s = $this->statCache[$key]) {
            foreach (['tmax' => ['mt', 'st', 'maximum'], 'tmin' => ['mn', 'sn', 'minimum']] as $f => [$mean, $sd, $name]) {
                if ($c[$f] !== null && $s[$sd] > 0 && abs($c[$f] - $s[$mean]) > 4 * $s[$sd]) {
                    $notes[] = sprintf('%s temperature %.1f°C is %.1f standard deviations from the usual %.1f°C',
                        ucfirst($name), $c[$f], abs($c[$f] - $s[$mean]) / $s[$sd], $s[$mean]);
                }
            }
        }
        return $notes ? mb_substr(implode('; ', $notes), 0, 255) : null;
    }

    /** Scan the whole archive for outliers (per station and calendar month) and flag them as suspect. Returns the count. */
    public function scanOutliers(): int
    {
        $stmt = $this->db->prepare(
            "UPDATE climate_readings r
             JOIN (SELECT station_id, MONTH(observed_on) AS m, COUNT(*) AS n,
                          AVG(tmax) AS mt, STDDEV_SAMP(tmax) AS st, AVG(tmin) AS mn, STDDEV_SAMP(tmin) AS sn
                   FROM active_readings GROUP BY station_id, m HAVING n >= 30) s
               ON s.station_id = r.station_id AND s.m = MONTH(r.observed_on)
             SET r.quality_flag = 'suspect',
                 r.qc_note = 'Outlier: more than 4 standard deviations from the usual value for this month',
                 r.updated_at = NOW()
             WHERE r.deleted_at IS NULL AND r.quality_flag = 'ok'
               AND ((s.st > 0 AND ABS(r.tmax - s.mt) > 4 * s.st) OR (s.sn > 0 AND ABS(r.tmin - s.mn) > 4 * s.sn))"
        );
        $stmt->execute();
        return $stmt->rowCount();
    }

    /** Runs of missing days for a station within the last $days days of its record. */
    public function gaps(int $stationId, int $days = 365): array
    {
        $stmt = $this->db->prepare('SELECT MAX(observed_on) FROM active_readings WHERE station_id = ?');
        $stmt->execute([$stationId]);
        $last = $stmt->fetchColumn();
        if (!$last) {
            return ['last' => null, 'runs' => [], 'missing' => 0, 'span' => 0];
        }
        $start = (new DateTimeImmutable($last))->modify('-' . (max(7, min($days, 3650)) - 1) . ' days');
        $stmt = $this->db->prepare('SELECT observed_on FROM active_readings WHERE station_id = ? AND observed_on >= ? ORDER BY observed_on');
        $stmt->execute([$stationId, $start->format('Y-m-d')]);
        $have = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));

        // Only count gaps after the station's first reading inside the window
        $firstHave = $have ? min(array_keys($have)) : $last;
        $runs = [];
        $cursor = new DateTimeImmutable($firstHave);
        $end = new DateTimeImmutable($last);
        $open = null;
        $missing = 0;
        for (; $cursor <= $end; $cursor = $cursor->modify('+1 day')) {
            $d = $cursor->format('Y-m-d');
            if (!isset($have[$d])) {
                $open ??= ['from' => $d, 'length' => 0];
                $open['to'] = $d;
                $open['length']++;
                $missing++;
            } elseif ($open) {
                $runs[] = $open;
                $open = null;
            }
        }
        if ($open) {
            $runs[] = $open;
        }
        return ['last' => $last, 'runs' => $runs, 'missing' => $missing, 'span' => (int) $start->diff($end)->days + 1];
    }

    /**
     * Estimate short gaps (up to $maxGap days) between two real readings by linear interpolation of temperature,
     * humidity and wind. Rainfall is deliberately left blank: it cannot be interpolated honestly.
     * Estimated rows are flagged "estimated", sourced "estimated" and tagged origin "model".
     */
    public function estimateGaps(int $stationId, int $maxGap, int $userId): array
    {
        $maxGap = max(1, min($maxGap, 5));
        $filled = 0;
        $skippedLong = 0;
        $skippedFlagged = 0;
        $fields = ['tmax', 'tmin', 'humidity', 'wind_speed'];
        foreach ($this->gaps($stationId, 3650)['runs'] as $run) {
            if ($run['length'] > $maxGap) {
                $skippedLong++;
                continue;
            }
            $before = $this->db->prepare('SELECT * FROM active_readings WHERE station_id = ? AND observed_on = ?');
            $before->execute([$stationId, (new DateTimeImmutable($run['from']))->modify('-1 day')->format('Y-m-d')]);
            $a = $before->fetch();
            $before->execute([$stationId, (new DateTimeImmutable($run['to']))->modify('+1 day')->format('Y-m-d')]);
            $b = $before->fetch();
            if (!$a || !$b) {
                continue; // no real reading on one side
            }
            if ($a['quality_flag'] !== 'ok' || $b['quality_flag'] !== 'ok') {
                $skippedFlagged++; // never build an estimate from a suspect or already-estimated neighbour
                continue;
            }
            for ($i = 1; $i <= $run['length']; $i++) {
                $t = $i / ($run['length'] + 1);
                $date = (new DateTimeImmutable($run['from']))->modify('+' . ($i - 1) . ' days')->format('Y-m-d');
                $c = ['observed_on' => $date, 'rainfall_mm' => null];
                foreach ($fields as $f) {
                    $c[$f] = ($a[$f] !== null && $b[$f] !== null) ? $a[$f] + ($b[$f] - $a[$f]) * $t : null;
                    if ($c[$f] !== null) {
                        $c[$f] = $f === 'humidity' ? (int) round($c[$f]) : round($c[$f], 1);
                    }
                }
                if (count(array_filter($c, fn($v) => $v !== null)) < 3) {
                    continue;
                }
                $this->save($stationId, $c, 'estimated', $userId, 'model', 'estimated', 'Linear interpolation between neighbouring days');
                $filled++;
            }
        }
        return ['filled' => $filled, 'skipped_long_gaps' => $skippedLong, 'skipped_flagged_neighbours' => $skippedFlagged];
    }

    /**
     * Empirical probability that an element goes above/below a threshold, with seasonal and yearly breakdowns.
     */
    public function extremes(array $f): array
    {
        $element = $f['element'] ?? 'tmax';
        if (!isset(self::FIELDS[$element])) {
            throw new InvalidArgumentException('Unknown element.');
        }
        if (!isset($f['threshold']) || !is_numeric($f['threshold'])) {
            throw new InvalidArgumentException('Enter a threshold value.');
        }
        $threshold = (float) $f['threshold'];
        $op = ($f['direction'] ?? 'above') === 'below' ? '<=' : '>=';

        $params = [];
        $where = $this->where($f, $params);
        $where .= ($where ? ' AND' : 'WHERE') . " r.$element IS NOT NULL";
        $stmt = $this->db->prepare(
            "SELECT YEAR(r.observed_on) AS y, MONTH(r.observed_on) AS m, COUNT(*) AS n, SUM(r.$element $op ?) AS hits
             FROM active_readings r $where GROUP BY y, m"
        );
        $stmt->execute(array_merge([$threshold], $params));

        $months = array_fill(1, 12, ['days' => 0, 'hits' => 0]);
        $years = [];
        $total = $hits = 0;
        foreach ($stmt->fetchAll() as $r) {
            $months[(int) $r['m']]['days'] += (int) $r['n'];
            $months[(int) $r['m']]['hits'] += (int) $r['hits'];
            $years[$r['y']] = ($years[$r['y']] ?? 0) + (int) $r['hits'];
            $total += (int) $r['n'];
            $hits += (int) $r['hits'];
        }
        if ($total < 30) {
            return ['total_days' => $total, 'enough' => false];
        }
        $out = [];
        foreach ($months as $m => $x) {
            $out[] = ['month' => $m, 'probability' => $x['days'] ? round($x['hits'] / $x['days'] * 100, 1) : null, 'days' => $x['days'], 'hits' => $x['hits']];
        }
        $yearsWithData = count($years);
        return [
            'enough' => true,
            'element' => $element,
            'direction' => $op === '<=' ? 'below' : 'above',
            'threshold' => $threshold,
            'total_days' => $total,
            'hit_days' => $hits,
            'probability' => round($hits / $total * 100, 2),
            'per_year' => $yearsWithData ? round($hits / $yearsWithData, 1) : null,
            'return_days' => $hits ? round($total / $hits, 1) : null,
            'months' => $out,
            'years' => array_map(fn($y, $n) => ['year' => (int) $y, 'hits' => $n], array_keys($years), $years),
            'short_record' => $yearsWithData < 30,
        ];
    }

    /**
     * Time series and summary statistics for one element, optionally for one station.
     * Series longer than 400 days are averaged by month to keep charts readable.
     */
    public function analysis(array $f): array
    {
        $element = $f['element'] ?? 'tmax';
        if (!isset(self::FIELDS[$element])) {
            throw new InvalidArgumentException('Unknown element.');
        }
        $params = [];
        $where = $this->where($f, $params);
        $where .= ($where ? ' AND' : 'WHERE') . " r.$element IS NOT NULL";

        $stmt = $this->db->prepare(
            "SELECT r.observed_on AS d, AVG(r.$element) AS v FROM active_readings r $where
             GROUP BY r.observed_on ORDER BY r.observed_on"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        if (count($rows) < 2) {
            return ['element' => $element, 'series' => [], 'stats' => null, 'granularity' => 'day'];
        }

        $n = count($rows);
        $sumX = $sumY = $sumXY = $sumXX = 0.0;
        $min = $max = $rows[0];
        $t0 = strtotime($rows[0]['d']);
        foreach ($rows as $r) {
            $x = (strtotime($r['d']) - $t0) / 86400 / 365.25; // years
            $y = (float) $r['v'];
            $sumX += $x; $sumY += $y; $sumXY += $x * $y; $sumXX += $x * $x;
            if ($y < (float) $min['v']) { $min = $r; }
            if ($y > (float) $max['v']) { $max = $r; }
        }
        $den = $n * $sumXX - $sumX * $sumX;
        $slope = $den != 0 ? ($n * $sumXY - $sumX * $sumY) / $den : 0.0;

        $granularity = 'day';
        $series = array_map(fn($r) => ['date' => $r['d'], 'value' => round((float) $r['v'], 1)], $rows);
        if ($n > 400) {
            $granularity = 'month';
            $buckets = [];
            foreach ($rows as $r) {
                $buckets[substr($r['d'], 0, 7)][] = (float) $r['v'];
            }
            $series = [];
            foreach ($buckets as $m => $vals) {
                $series[] = ['date' => $m, 'value' => round(array_sum($vals) / count($vals), 1)];
            }
        }

        return [
            'element' => $element,
            'granularity' => $granularity,
            'series' => $series,
            'stats' => [
                'days' => $n,
                'mean' => round($sumY / $n, 1),
                'min' => ['value' => round((float) $min['v'], 1), 'date' => $min['d']],
                'max' => ['value' => round((float) $max['v'], 1), 'date' => $max['d']],
                'trend_per_year' => round($slope, 2),
                'total' => $element === 'rainfall_mm' ? round($sumY, 1) : null,
            ],
        ];
    }

    public function dashboard(?int $stationId = null): array
    {
        $totals = $this->db->query(
            'SELECT COUNT(*) AS readings, COUNT(DISTINCT station_id) AS stations_reporting, MAX(observed_on) AS latest
             FROM active_readings'
        )->fetch();
        $stationCount = (int) $this->db->query('SELECT COUNT(*) FROM stations')->fetchColumn();
        $latest = $totals['latest'];

        if (!$latest) {
            return [
                'totals' => ['readings' => 0, 'stations' => $stationCount, 'latest' => null, 'sample_share' => 0],
                'monthly' => [], 'stations' => [], 'alerts' => [], 'kpis' => null,
            ];
        }

        $sample = (int) $this->db->query("SELECT COUNT(*) FROM active_readings WHERE source = 'sample'")->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT DATE_FORMAT(observed_on, '%Y-%m') AS month,
                    ROUND(AVG((tmax + tmin) / 2), 1) AS avg_temp,
                    ROUND(AVG(tmax), 1) AS avg_tmax,
                    ROUND(AVG(tmin), 1) AS avg_tmin,
                    ROUND(SUM(rainfall_mm) / COUNT(DISTINCT station_id), 1) AS rainfall
             FROM active_readings
             WHERE observed_on > DATE_SUB(?, INTERVAL 12 MONTH)" . ($stationId ? ' AND station_id = ?' : '') . "
             GROUP BY month ORDER BY month"
        );
        $stmt->execute($stationId ? [$latest, $stationId] : [$latest]);
        $monthly = array_slice($stmt->fetchAll(), -12);

        $stmt = $this->db->prepare(
            'SELECT s.id, s.code, s.name, s.province, s.latitude, s.longitude, s.status,
                    ROUND(AVG((r.tmax + r.tmin) / 2), 1) AS avg_temp,
                    ROUND(SUM(r.rainfall_mm), 1) AS rainfall,
                    MAX(r.observed_on) AS last_reading
             FROM stations s
             LEFT JOIN active_readings r ON r.station_id = s.id AND r.observed_on > DATE_SUB(?, INTERVAL 30 DAY)
             GROUP BY s.id ORDER BY s.name'
        );
        $stmt->execute([$latest]);
        $stations = $stmt->fetchAll();

        $stmt = $this->db->prepare(
            "SELECT s.name AS station, r.observed_on, 'Heat' AS type, r.tmax AS value
             FROM active_readings r JOIN stations s ON s.id = r.station_id
             WHERE r.observed_on > DATE_SUB(?, INTERVAL 7 DAY) AND r.tmax >= 35
             UNION ALL
             SELECT s.name, r.observed_on, 'Heavy rain', r.rainfall_mm
             FROM active_readings r JOIN stations s ON s.id = r.station_id
             WHERE r.observed_on > DATE_SUB(?, INTERVAL 7 DAY) AND r.rainfall_mm >= 50
             ORDER BY observed_on DESC LIMIT 20"
        );
        $stmt->execute([$latest, $latest]);
        $alerts = $stmt->fetchAll();

        $stmt = $this->db->prepare(
            'SELECT ROUND(AVG((tmax + tmin) / 2), 1) AS avg_temp, ROUND(SUM(rainfall_mm) / COUNT(DISTINCT station_id), 1) AS rainfall,
                    ROUND(AVG(humidity)) AS humidity, ROUND(AVG(wind_speed), 1) AS wind
             FROM active_readings WHERE observed_on > DATE_SUB(?, INTERVAL 30 DAY)'
        );
        $stmt->execute([$latest]);
        $kpis = $stmt->fetch();

        return [
            'totals' => [
                'readings' => (int) $totals['readings'],
                'stations' => $stationCount,
                'latest' => $latest,
                'sample_share' => round($sample / max(1, (int) $totals['readings']), 3),
            ],
            'kpis' => $kpis,
            'monthly' => $monthly,
            'stations' => $stations,
            'alerts' => $alerts,
        ];
    }
}
