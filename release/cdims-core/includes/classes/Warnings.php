<?php
/**
 * Warnings: rule-based public alerts (heat, cold, heavy rain, flooding, dry spells, drought, strong wind).
 *
 * The system watches the climate record (observed) and the short-range forecast (forecast) against thresholds and
 * prepares DRAFT alerts. A person reviews, edits and publishes them: nothing reaches the public automatically.
 * Published alerts are available as web pages, RSS and CAP 1.2 (the international Common Alerting Protocol).
 */
class Warnings
{
    public const HAZARDS = [
        'heat' => 'Extreme heat', 'cold' => 'Cold / frost', 'heavy_rain' => 'Heavy rainfall', 'flood' => 'Flood risk',
        'drought' => 'Drought', 'dry_spell' => 'Dry spell', 'strong_wind' => 'Strong winds', 'other' => 'Other hazard',
    ];
    public const SEVERITIES = ['advisory', 'watch', 'warning'];

    /** Default thresholds. Administrators can change them (stored in the settings table). */
    public const DEFAULT_THRESHOLDS = [
        'heat'        => ['watch' => 35, 'warning' => 38],   // daily maximum temperature, °C, at or above
        'cold'        => ['watch' => 5,  'warning' => 2],    // daily minimum temperature, °C, at or below
        'heavy_rain'  => ['watch' => 50, 'warning' => 100],  // daily rainfall, mm, at or above
        'flood'       => ['watch' => 120, 'warning' => 200], // rainfall over three days, mm, at or above
        'strong_wind' => ['watch' => 10, 'warning' => 15],   // daily wind speed, m/s, at or above
        'dry_spell'   => ['watch' => 14, 'warning' => 21],   // consecutive days under 1 mm in the rainy season
        'drought'     => ['watch' => 50, 'warning' => 25],   // 30-day rainfall as % of normal, at or below
    ];

    public const THRESHOLD_UNITS = [
        'heat' => '°C', 'cold' => '°C', 'heavy_rain' => 'mm in a day', 'flood' => 'mm in 3 days',
        'strong_wind' => 'm/s', 'dry_spell' => 'dry days', 'drought' => '% of normal 30-day rainfall',
    ];

    private const ADVICE = [
        'heat' => 'Drink plenty of water, avoid strenuous outdoor activity between 10:00 and 16:00, check on children, older people and animals, and never leave anyone in a parked vehicle.',
        'cold' => 'Keep warm, protect livestock and sensitive crops from frost, and check on older people and young children. Never use charcoal or open fires in closed rooms.',
        'heavy_rain' => 'Avoid crossing flooded roads, rivers and streams. Stay away from low-lying areas, keep drains clear, and follow instructions from local authorities.',
        'flood' => 'Be ready to move to higher ground. Do not walk or drive through floodwater. Follow instructions from the Disaster Management and Mitigation Unit and local authorities.',
        'dry_spell' => 'Conserve water, protect young crops where possible, consider drought-tolerant varieties for replanting, and follow guidance from agricultural extension officers.',
        'drought' => 'Conserve water, monitor water sources and livestock, and follow guidance from agricultural extension officers and local authorities.',
        'strong_wind' => 'Secure loose objects and roofing, avoid sheltering under trees or near weak structures, and take care when travelling on exposed roads.',
        'other' => 'Follow guidance from local authorities.',
    ];

    private PDO $db;

    public function __construct()
    {
        $this->db = getDBConnection();
    }

    // ------------------------------------------------------------------ settings

    public static function setting(string $key, ?string $default = null): ?string
    {
        $stmt = getDBConnection()->prepare('SELECT svalue FROM settings WHERE skey = ?');
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        return $v === false ? $default : (string) $v;
    }

    public function thresholds(): array
    {
        $saved = json_decode((string) self::setting('alert_thresholds', ''), true);
        $out = self::DEFAULT_THRESHOLDS;
        foreach (is_array($saved) ? $saved : [] as $h => $levels) {
            foreach (['watch', 'warning'] as $lv) {
                if (isset($out[$h], $levels[$lv]) && is_numeric($levels[$lv])) {
                    $out[$h][$lv] = (float) $levels[$lv];
                }
            }
        }
        return $out;
    }

    public function saveThresholds(array $in, int $userId): array
    {
        $out = $this->thresholds();
        foreach (self::DEFAULT_THRESHOLDS as $h => $_) {
            foreach (['watch', 'warning'] as $lv) {
                if (isset($in[$h][$lv])) {
                    if (!is_numeric($in[$h][$lv])) {
                        throw new InvalidArgumentException('Thresholds must be numbers.');
                    }
                    $out[$h][$lv] = (float) $in[$h][$lv];
                }
            }
            $lowerIsWorse = in_array($h, ['cold', 'drought'], true);
            if ($lowerIsWorse ? $out[$h]['warning'] >= $out[$h]['watch'] : $out[$h]['warning'] <= $out[$h]['watch']) {
                throw new InvalidArgumentException(self::HAZARDS[$h] . ': the warning level must be more severe than the watch level.');
            }
        }
        $this->db->prepare(
            'INSERT INTO settings (skey, svalue, updated_by, updated_at) VALUES (?,?,?,NOW())
             ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = NOW()'
        )->execute(['alert_thresholds', json_encode($out), $userId]);
        return $out;
    }

    // ------------------------------------------------------------------ rule evaluation

    private static function level(float $value, array $t, bool $lowerIsWorse = false): ?string
    {
        if ($lowerIsWorse) {
            return $value <= $t['warning'] ? 'warning' : ($value <= $t['watch'] ? 'watch' : null);
        }
        return $value >= $t['warning'] ? 'warning' : ($value >= $t['watch'] ? 'watch' : null);
    }

    /** Findings from the climate record (latest observation day). */
    private function observedFindings(array $th, array &$notes): array
    {
        $last = $this->db->query('SELECT MAX(observed_on) FROM active_readings')->fetchColumn();
        if (!$last) {
            $notes[] = 'There are no observations to check.';
            return [];
        }
        if ((new DateTimeImmutable($last)) < (new DateTimeImmutable('today'))->modify('-7 days')) {
            $notes[] = "The latest observations are from $last, which is too old to base alerts on.";
            return [];
        }
        $out = [];
        $add = function (string $hazard, string $sev, array $s, float $value, string $unit, string $detail) use (&$out, $last) {
            $out[] = ['hazard' => $hazard, 'severity' => $sev, 'basis' => 'observed', 'code' => $s['code'], 'name' => $s['name'],
                'province' => $s['province'], 'value' => $value, 'unit' => $unit, 'date' => $last, 'detail' => $detail];
        };

        $stmt = $this->db->prepare(
            "SELECT s.id, s.code, s.name, s.province, r.tmax, r.tmin, r.rainfall_mm, r.wind_speed, r.quality_flag
             FROM stations s JOIN active_readings r ON r.station_id = s.id AND r.observed_on = ? WHERE s.status = 'active'"
        );
        $stmt->execute([$last]);
        $skipped = 0;
        foreach ($stmt->fetchAll() as $s) {
            if ($s['quality_flag'] === 'suspect') {
                $skipped++; // unverified values must not trigger a public alert
                continue;
            }
            if ($s['tmax'] !== null && ($l = self::level((float) $s['tmax'], $th['heat']))) {
                $add('heat', $l, $s, (float) $s['tmax'], '°C', "Maximum temperature {$s['tmax']}°C");
            }
            if ($s['tmin'] !== null && ($l = self::level((float) $s['tmin'], $th['cold'], true))) {
                $add('cold', $l, $s, (float) $s['tmin'], '°C', "Minimum temperature {$s['tmin']}°C");
            }
            if ($s['rainfall_mm'] !== null && ($l = self::level((float) $s['rainfall_mm'], $th['heavy_rain']))) {
                $add('heavy_rain', $l, $s, (float) $s['rainfall_mm'], 'mm', "{$s['rainfall_mm']} mm of rain in a day");
            }
            if ($s['wind_speed'] !== null && ($l = self::level((float) $s['wind_speed'], $th['strong_wind']))) {
                $add('strong_wind', $l, $s, (float) $s['wind_speed'], 'm/s', "Wind speed {$s['wind_speed']} m/s");
            }
        }
        if ($skipped) {
            $notes[] = "$skipped station reading(s) flagged as suspect were not used for alerts. Review them in Data quality.";
        }

        // three-day rainfall (flood risk)
        $stmt = $this->db->prepare(
            "SELECT s.id, s.code, s.name, s.province, SUM(r.rainfall_mm) AS total, COUNT(r.rainfall_mm) AS n
             FROM stations s JOIN active_readings r ON r.station_id = s.id
             WHERE s.status = 'active' AND r.quality_flag <> 'suspect' AND r.observed_on BETWEEN DATE_SUB(?, INTERVAL 2 DAY) AND ?
             GROUP BY s.id HAVING n >= 2"
        );
        $stmt->execute([$last, $last]);
        foreach ($stmt->fetchAll() as $s) {
            if ($l = self::level((float) $s['total'], $th['flood'])) {
                $add('flood', $l, $s, round((float) $s['total'], 1), 'mm', round((float) $s['total'], 1) . ' mm of rain in 3 days');
            }
        }

        $month = (int) substr($last, 5, 2);
        $rainy = in_array($month, [11, 12, 1, 2, 3], true);
        if ($rainy) {
            // dry spell: consecutive days under 1 mm up to the latest observation
            $stations = $this->db->query("SELECT id, code, name, province FROM stations WHERE status = 'active'")->fetchAll();
            $q = $this->db->prepare(
                'SELECT observed_on, rainfall_mm FROM active_readings WHERE station_id = ? AND observed_on <= ?
                 AND observed_on > DATE_SUB(?, INTERVAL 60 DAY) ORDER BY observed_on DESC'
            );
            foreach ($stations as $s) {
                $q->execute([$s['id'], $last, $last]);
                $run = 0;
                $expect = new DateTimeImmutable($last);
                foreach ($q->fetchAll() as $r) {
                    if ($r['observed_on'] !== $expect->format('Y-m-d') || $r['rainfall_mm'] === null || (float) $r['rainfall_mm'] >= 1) {
                        break;
                    }
                    $run++;
                    $expect = $expect->modify('-1 day');
                }
                if ($run && ($l = self::level((float) $run, $th['dry_spell']))) {
                    $add('dry_spell', $l, $s, (float) $run, 'days', "$run consecutive days with less than 1 mm of rain");
                }
            }
        }
        if (in_array($month, [11, 12, 1, 2, 3, 4], true)) {
            // drought: last 30 days' rainfall against the same window in earlier years
            $stations = $this->db->query("SELECT id, code, name, province FROM stations WHERE status = 'active'")->fetchAll();
            $sum = $this->db->prepare(
                'SELECT SUM(rainfall_mm) AS total, COUNT(rainfall_mm) AS n FROM active_readings
                 WHERE station_id = ? AND observed_on > DATE_SUB(?, INTERVAL ? DAY) AND observed_on <= DATE_SUB(?, INTERVAL ? DAY)'
            );
            foreach ($stations as $s) {
                $sum->execute([$s['id'], $last, 30, $last, 0]);
                $now = $sum->fetch();
                if (!$now || (int) $now['n'] < 25) {
                    continue;
                }
                $base = [];
                for ($y = 1; $y <= 5; $y++) {
                    $off = 365 * $y;
                    $sum->execute([$s['id'], $last, 30 + $off, $last, $off]);
                    $b = $sum->fetch();
                    if ($b && (int) $b['n'] >= 25) {
                        $base[] = (float) $b['total'];
                    }
                }
                if (!$base || array_sum($base) / count($base) < 20) {
                    continue; // no usable history, or normally too dry for a percentage to mean anything
                }
                $pct = round((float) $now['total'] / (array_sum($base) / count($base)) * 100);
                if ($l = self::level((float) $pct, $th['drought'], true)) {
                    $add('drought', $l, $s, (float) $pct, '%', "30-day rainfall of " . round((float) $now['total'], 1) . " mm is $pct% of the normal for this period");
                }
            }
        }
        return $out;
    }

    /** Findings from the next three days of forecast. */
    private function forecastFindings(array $th, array &$notes): array
    {
        $outlook = (new Weather())->outlook(4);
        if (!$outlook) {
            $notes[] = 'The forecast service was unavailable, so only observations were checked.';
            return [];
        }
        $today = date('Y-m-d');
        $out = [];
        foreach ($outlook as $s) {
            $days = array_values(array_filter($s['days'], fn($d) => $d['date'] >= $today));
            $days = array_slice($days, 0, 3);
            $rain3 = 0.0;
            foreach ($days as $d) {
                $row = ['code' => $s['code'], 'name' => $s['name'], 'province' => $s['province'], 'basis' => 'forecast', 'date' => $d['date']];
                if ($d['max'] !== null && ($l = self::level((float) $d['max'], $th['heat']))) {
                    $out[] = $row + ['hazard' => 'heat', 'severity' => $l, 'value' => (float) $d['max'], 'unit' => '°C', 'detail' => "Forecast maximum {$d['max']}°C"];
                }
                if ($d['min'] !== null && ($l = self::level((float) $d['min'], $th['cold'], true))) {
                    $out[] = $row + ['hazard' => 'cold', 'severity' => $l, 'value' => (float) $d['min'], 'unit' => '°C', 'detail' => "Forecast minimum {$d['min']}°C"];
                }
                if ($d['rain_mm'] !== null) {
                    $rain3 += (float) $d['rain_mm'];
                    if (($d['rain_chance'] ?? 0) >= 40 && ($l = self::level((float) $d['rain_mm'], $th['heavy_rain']))) {
                        $out[] = $row + ['hazard' => 'heavy_rain', 'severity' => $l, 'value' => (float) $d['rain_mm'], 'unit' => 'mm', 'detail' => "Forecast {$d['rain_mm']} mm of rain ({$d['rain_chance']}% chance)"];
                    }
                }
                if ($d['wind_max'] !== null && ($l = self::level((float) $d['wind_max'], $th['strong_wind']))) {
                    $out[] = $row + ['hazard' => 'strong_wind', 'severity' => $l, 'value' => (float) $d['wind_max'], 'unit' => 'm/s', 'detail' => "Forecast winds up to {$d['wind_max']} m/s"];
                }
            }
            if (count($days) === 3 && ($l = self::level($rain3, $th['flood']))) {
                $out[] = ['code' => $s['code'], 'name' => $s['name'], 'province' => $s['province'], 'basis' => 'forecast', 'date' => $days[0]['date'],
                    'hazard' => 'flood', 'severity' => $l, 'value' => round($rain3, 1), 'unit' => 'mm', 'detail' => 'Forecast ' . round($rain3, 1) . ' mm of rain over three days'];
            }
        }
        return $out;
    }

    private static function dateRange(array $dates): string
    {
        sort($dates);
        $a = new DateTimeImmutable(reset($dates));
        $b = new DateTimeImmutable(end($dates));
        return $a == $b ? $a->format('j M') : $a->format('j M') . ' to ' . $b->format('j M');
    }

    private function buildAlert(string $hazard, string $severity, string $basis, array $rows): array
    {
        // keep each station once, at its most severe value
        $byStation = [];
        foreach ($rows as $r) {
            $byStation[$r['code']][] = $r;
        }
        $lowerIsWorse = in_array($hazard, ['cold', 'drought'], true);
        $areas = [];
        $lines = [];
        $dates = [];
        foreach ($byStation as $code => $list) {
            usort($list, fn($a, $b) => $lowerIsWorse ? $a['value'] <=> $b['value'] : $b['value'] <=> $a['value']);
            $r = $list[0];
            $areas[] = ['code' => $code, 'name' => $r['name'], 'province' => $r['province']];
            $when = $basis === 'forecast' ? ' (' . self::dateRange(array_column($list, 'date')) . ')' : '';
            $lines[] = "{$r['name']}: {$r['detail']}$when";
            $dates = array_merge($dates, array_column($list, 'date'));
        }
        $names = array_column($areas, 'name');
        $label = self::HAZARDS[$hazard];
        $where = count($names) <= 4 ? implode(', ', $names) : implode(', ', array_slice($names, 0, 3)) . ' and ' . (count($names) - 3) . ' more areas';
        $lead = $basis === 'forecast'
            ? "$label is forecast for the period " . self::dateRange($dates) . '.'
            : "$label conditions were observed on " . self::dateRange($dates) . '.';

        $now = new DateTimeImmutable('now');
        if ($basis === 'forecast') {
            $start = max($now, new DateTimeImmutable(min($dates) . ' 00:00:00'));
            $end = (new DateTimeImmutable(max($dates) . ' 23:59:00'))->modify('+6 hours');
        } else {
            $start = $now;
            $end = $now->modify(in_array($hazard, ['dry_spell', 'drought'], true) ? '+7 days' : '+2 days');
        }

        $dayKey = $now->format('Y-m-d');
        return [
            'hazard' => $hazard, 'severity' => $severity, 'basis' => $basis,
            'title' => "$label $severity for $where", // e.g. "Extreme heat warning for Mfuwe"
            'message' => $lead . "\n\n" . implode("\n", array_map(fn($l) => "• $l", $lines)),
            'advice' => self::ADVICE[$hazard],
            'areas' => $areas,
            'starts_at' => $start->format('Y-m-d H:i:s'),
            'expires_at' => $end->format('Y-m-d H:i:s'),
            'fingerprint' => sha1(implode('|', [$hazard, $severity, $basis, $dayKey, implode(',', array_column($areas, 'code'))])),
            'evidence' => $rows,
        ];
    }

    /**
     * Check every rule and save new DRAFT alerts. Identical alerts for the same day are not created twice.
     *
     * @return array{created: array, skipped: int, notes: string[]}
     */
    public function generate(?int $userId): array
    {
        $th = $this->thresholds();
        $notes = [];
        $findings = array_merge($this->observedFindings($th, $notes), $this->forecastFindings($th, $notes));

        // A station should appear once per hazard and basis, at its most severe level (not in both a watch and a warning)
        $rank = ['advisory' => 0, 'watch' => 1, 'warning' => 2];
        $top = [];
        foreach ($findings as $f) {
            $k = "{$f['hazard']}|{$f['basis']}|{$f['code']}";
            $top[$k] = max($top[$k] ?? -1, $rank[$f['severity']]);
        }
        $findings = array_values(array_filter($findings, fn($f) => $rank[$f['severity']] === $top["{$f['hazard']}|{$f['basis']}|{$f['code']}"]));

        $groups = [];
        foreach ($findings as $f) {
            $groups[$f['hazard'] . '|' . $f['severity'] . '|' . $f['basis']][] = $f;
        }
        $insert = $this->db->prepare(
            "INSERT IGNORE INTO alerts (hazard, severity, title, message, advice, areas, basis, starts_at, expires_at, status, origin, fingerprint, evidence, created_by)
             VALUES (?,?,?,?,?,?,?,?,?, 'draft', 'auto', ?, ?, ?)"
        );
        $created = [];
        $skipped = 0;
        foreach ($groups as $key => $rows) {
            [$hazard, $severity, $basis] = explode('|', $key);
            $a = $this->buildAlert($hazard, $severity, $basis, $rows);
            $insert->execute([
                $a['hazard'], $a['severity'], $a['title'], $a['message'], $a['advice'], json_encode($a['areas']), $a['basis'],
                $a['starts_at'], $a['expires_at'], $a['fingerprint'], json_encode($a['evidence']), $userId,
            ]);
            if ($insert->rowCount()) {
                $created[] = ['id' => (int) $this->db->lastInsertId(), 'title' => $a['title'], 'severity' => $a['severity']];
            } else {
                $skipped++;
            }
        }
        if (!$findings) {
            $notes[] = 'No thresholds were reached. No alerts are needed right now.';
        }
        return ['created' => $created, 'skipped' => $skipped, 'notes' => $notes, 'checked' => count($findings)];
    }

    // ------------------------------------------------------------------ CRUD

    private static function present(array $r, bool $staff): array
    {
        $now = time();
        $out = [
            'id' => (int) $r['id'], 'hazard' => $r['hazard'], 'hazard_label' => self::HAZARDS[$r['hazard']] ?? $r['hazard'],
            'severity' => $r['severity'], 'title' => $r['title'], 'message' => $r['message'], 'advice' => $r['advice'],
            'areas' => json_decode((string) $r['areas'], true) ?: [], 'basis' => $r['basis'],
            'starts_at' => $r['starts_at'], 'expires_at' => $r['expires_at'], 'status' => $r['status'],
            'published_at' => $r['published_at'], 'cancel_reason' => $r['cancel_reason'],
            'active' => $r['status'] === 'published' && strtotime($r['expires_at']) > $now,
            'expired' => $r['status'] === 'published' && strtotime($r['expires_at']) <= $now,
        ];
        if ($staff) {
            $out += ['origin' => $r['origin'], 'evidence' => json_decode((string) $r['evidence'], true) ?: [], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at']];
        }
        return $out;
    }

    public function get(int $id, bool $staff = false): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM alerts WHERE id = ?');
        $stmt->execute([$id]);
        $r = $stmt->fetch();
        if (!$r || (!$staff && $r['status'] === 'draft')) {
            return null;
        }
        return self::present($r, $staff);
    }

    /** Staff list: newest first, optionally by status. */
    public function all(?string $status = null, int $limit = 200): array
    {
        $sql = 'SELECT * FROM alerts' . ($status ? ' WHERE status = ?' : '') . ' ORDER BY (status = \'draft\') DESC, id DESC LIMIT ' . max(1, min($limit, 500));
        $stmt = $this->db->prepare($sql);
        $stmt->execute($status ? [$status] : []);
        return array_map(fn($r) => self::present($r, true), $stmt->fetchAll());
    }

    /** Published alerts that have not expired (the public view). */
    public function active(): array
    {
        $rows = $this->db->query("SELECT * FROM alerts WHERE status = 'published' AND expires_at > NOW() ORDER BY FIELD(severity,'warning','watch','advisory'), starts_at")->fetchAll();
        return array_map(fn($r) => self::present($r, false), $rows);
    }

    /** Recently ended published and cancelled alerts, for the public archive. */
    public function recent(int $limit = 20): array
    {
        $rows = $this->db->query(
            "SELECT * FROM alerts WHERE status IN ('published','cancelled') AND (status = 'cancelled' OR expires_at <= NOW()) ORDER BY id DESC LIMIT " . max(1, min($limit, 100))
        )->fetchAll();
        return array_map(fn($r) => self::present($r, false), $rows);
    }

    private function clean(array $in): array
    {
        $hazard = $in['hazard'] ?? '';
        $severity = $in['severity'] ?? '';
        if (!isset(self::HAZARDS[$hazard])) {
            throw new InvalidArgumentException('Choose the type of hazard.');
        }
        if (!in_array($severity, self::SEVERITIES, true)) {
            throw new InvalidArgumentException('Choose how severe the alert is.');
        }
        $title = trim((string) ($in['title'] ?? ''));
        $message = trim((string) ($in['message'] ?? ''));
        if (mb_strlen($title) < 8 || mb_strlen($title) > 200) {
            throw new InvalidArgumentException('Write a title of 8 to 200 characters.');
        }
        if (mb_strlen($message) < 20 || mb_strlen($message) > 4000) {
            throw new InvalidArgumentException('The message must be 20 to 4000 characters.');
        }
        $starts = strtotime((string) ($in['starts_at'] ?? ''));
        $ends = strtotime((string) ($in['expires_at'] ?? ''));
        if (!$starts || !$ends) {
            throw new InvalidArgumentException('Enter when the alert starts and when it expires.');
        }
        if ($ends <= $starts) {
            throw new InvalidArgumentException('The alert must expire after it starts.');
        }
        if ($ends - $starts > 30 * 86400) {
            throw new InvalidArgumentException('An alert can last at most 30 days. Issue a new one to extend it.');
        }
        $areas = [];
        $codes = $this->db->query('SELECT code, name, province FROM stations')->fetchAll(PDO::FETCH_UNIQUE);
        foreach ((array) ($in['areas'] ?? []) as $code) {
            if (isset($codes[$code])) {
                $areas[] = ['code' => $code, 'name' => $codes[$code]['name'], 'province' => $codes[$code]['province']];
            }
        }
        if (!$areas) {
            throw new InvalidArgumentException('Choose at least one affected area.');
        }
        return [
            'hazard' => $hazard, 'severity' => $severity, 'title' => $title, 'message' => $message,
            'advice' => mb_substr(trim((string) ($in['advice'] ?? '')), 0, 2000),
            'areas' => json_encode($areas),
            'starts_at' => date('Y-m-d H:i:s', $starts), 'expires_at' => date('Y-m-d H:i:s', $ends),
        ];
    }

    public function create(array $in, int $userId): int
    {
        $c = $this->clean($in);
        $this->db->prepare(
            "INSERT INTO alerts (hazard, severity, title, message, advice, areas, basis, starts_at, expires_at, status, origin, created_by)
             VALUES (?,?,?,?,?,?, 'manual', ?,?, 'draft', 'manual', ?)"
        )->execute([$c['hazard'], $c['severity'], $c['title'], $c['message'], $c['advice'], $c['areas'], $c['starts_at'], $c['expires_at'], $userId]);
        return (int) $this->db->lastInsertId();
    }

    public function update(int $id, array $in): void
    {
        $cur = $this->get($id, true);
        if (!$cur) {
            throw new InvalidArgumentException('Alert not found.');
        }
        if ($cur['status'] === 'cancelled') {
            throw new InvalidArgumentException('A cancelled alert cannot be edited.');
        }
        $c = $this->clean($in);
        $this->db->prepare(
            'UPDATE alerts SET hazard=?, severity=?, title=?, message=?, advice=?, areas=?, starts_at=?, expires_at=?, updated_at=NOW() WHERE id=?'
        )->execute([$c['hazard'], $c['severity'], $c['title'], $c['message'], $c['advice'], $c['areas'], $c['starts_at'], $c['expires_at'], $id]);
    }

    public function publish(int $id, int $userId): void
    {
        $cur = $this->get($id, true);
        if (!$cur || $cur['status'] !== 'draft') {
            throw new InvalidArgumentException('Only a draft alert can be published.');
        }
        if (strtotime($cur['expires_at']) <= time()) {
            throw new InvalidArgumentException('This alert has already expired. Edit its dates before publishing.');
        }
        $this->db->prepare("UPDATE alerts SET status = 'published', published_by = ?, published_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([$userId, $id]);
    }

    public function cancel(int $id, string $reason): void
    {
        $reason = trim($reason);
        if (mb_strlen($reason) < 5) {
            throw new InvalidArgumentException('Give a short reason for cancelling.');
        }
        $stmt = $this->db->prepare("UPDATE alerts SET status = 'cancelled', cancel_reason = ?, updated_at = NOW() WHERE id = ? AND status = 'published'");
        $stmt->execute([mb_substr($reason, 0, 255), $id]);
        if (!$stmt->rowCount()) {
            throw new InvalidArgumentException('Only a published alert can be cancelled.');
        }
    }

    public function deleteDraft(int $id): void
    {
        $stmt = $this->db->prepare("DELETE FROM alerts WHERE id = ? AND status = 'draft'");
        $stmt->execute([$id]);
        if (!$stmt->rowCount()) {
            throw new InvalidArgumentException('Only a draft alert can be deleted.');
        }
    }

    // ------------------------------------------------------------------ CAP 1.2

    /** Common Alerting Protocol 1.2 document for one published or cancelled alert. */
    public static function cap(array $a, string $baseUrl, string $sender, string $org): string
    {
        $x = fn(?string $s) => htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $iso = fn(?string $d) => $d ? date('c', strtotime($d)) : date('c');
        $sevMap = ['advisory' => 'Minor', 'watch' => 'Moderate', 'warning' => 'Severe'];
        $urgency = $a['severity'] === 'warning' ? 'Expected' : 'Future';
        $certainty = $a['basis'] === 'observed' ? 'Observed' : ($a['severity'] === 'warning' ? 'Likely' : 'Possible');
        $cancelled = $a['status'] === 'cancelled';
        $areas = implode('; ', array_map(fn($z) => "{$z['name']} ({$z['province']} Province)", $a['areas']));

        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $xml .= '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">' . "\n";
        $xml .= '  <identifier>CDIMS-' . (int) $a['id'] . '</identifier>' . "\n";
        $xml .= '  <sender>' . $x($sender) . '</sender>' . "\n";
        $xml .= '  <sent>' . $iso($a['published_at']) . '</sent>' . "\n";
        $xml .= '  <status>Actual</status>' . "\n";
        $xml .= '  <msgType>' . ($cancelled ? 'Cancel' : 'Alert') . '</msgType>' . "\n";
        $xml .= '  <scope>Public</scope>' . "\n";
        $xml .= '  <info>' . "\n";
        $xml .= '    <language>en</language>' . "\n";
        $xml .= '    <category>Met</category>' . "\n";
        $xml .= '    <event>' . $x($a['hazard_label']) . '</event>' . "\n";
        $xml .= '    <urgency>' . $urgency . '</urgency>' . "\n";
        $xml .= '    <severity>' . $sevMap[$a['severity']] . '</severity>' . "\n";
        $xml .= '    <certainty>' . $certainty . '</certainty>' . "\n";
        $xml .= '    <effective>' . $iso($a['starts_at']) . '</effective>' . "\n";
        $xml .= '    <expires>' . $iso($a['expires_at']) . '</expires>' . "\n";
        $xml .= '    <senderName>' . $x($org) . '</senderName>' . "\n";
        $xml .= '    <headline>' . $x($a['title']) . '</headline>' . "\n";
        $xml .= '    <description>' . $x($cancelled ? 'This alert has been cancelled. ' . $a['cancel_reason'] : $a['message']) . '</description>' . "\n";
        if (!$cancelled && $a['advice']) {
            $xml .= '    <instruction>' . $x($a['advice']) . '</instruction>' . "\n";
        }
        $xml .= '    <web>' . $x($baseUrl . '/alerts/' . (int) $a['id']) . '</web>' . "\n";
        $xml .= '    <area>' . "\n" . '      <areaDesc>' . $x($areas) . '</areaDesc>' . "\n";
        foreach ($a['areas'] as $z) {
            $xml .= '      <geocode><valueName>StationCode</valueName><value>' . $x($z['code']) . '</value></geocode>' . "\n";
        }
        $xml .= '    </area>' . "\n";
        $xml .= '  </info>' . "\n";
        $xml .= '</alert>' . "\n";
        return $xml;
    }
}
