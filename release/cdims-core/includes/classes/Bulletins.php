<?php
/**
 * Bulletins: automatically prepared daily weather bulletins and weekly climate summaries.
 *
 * A bulletin is built from the quality-controlled climate record (observed) and the short-range forecast (outlook).
 * It is saved as a DRAFT with a plain-language summary that a person can edit before it is published.
 */
class Bulletins
{
    private PDO $db;

    public function __construct()
    {
        $this->db = getDBConnection();
    }

    private static function avg(array $values): ?float
    {
        $v = array_filter($values, fn($x) => $x !== null);
        return $v ? round(array_sum($v) / count($v), 1) : null;
    }

    private static function dateText(string $d): string
    {
        return (new DateTimeImmutable($d))->format('j F Y');
    }

    private static function rangeText(string $a, string $b): string
    {
        $x = new DateTimeImmutable($a);
        $y = new DateTimeImmutable($b);
        if ($x->format('Y-m') === $y->format('Y-m')) {
            return $x->format('j') . ' to ' . $y->format('j F Y');
        }
        return $x->format('j F') . ' to ' . $y->format('j F Y');
    }

    /** Share of readings that are generated sample data, so public pages can warn that a demo is not real. */
    public static function sampleShare(): float
    {
        $r = getDBConnection()->query("SELECT COUNT(*) AS n, SUM(source = 'sample') AS s FROM active_readings")->fetch();
        return $r && $r['n'] ? (float) $r['s'] / (float) $r['n'] : 0.0;
    }

    private function latestObservation(): ?string
    {
        $d = $this->db->query('SELECT MAX(observed_on) FROM active_readings')->fetchColumn();
        return $d ?: null;
    }

    private function alertSnapshot(): array
    {
        return array_map(fn($a) => ['id' => $a['id'], 'title' => $a['title'], 'severity' => $a['severity'], 'hazard' => $a['hazard_label'], 'areas' => array_column($a['areas'], 'name'), 'expires_at' => $a['expires_at']],
            (new Warnings())->active());
    }

    // ------------------------------------------------------------------ daily

    private function dailyContent(string $date): array
    {
        $stmt = $this->db->prepare(
            "SELECT s.code, s.name, s.province, r.tmax, r.tmin, r.rainfall_mm AS rain, r.humidity, r.wind_speed AS wind, r.quality_flag
             FROM stations s JOIN active_readings r ON r.station_id = s.id AND r.observed_on = ?
             WHERE s.status = 'active' ORDER BY s.name"
        );
        $stmt->execute([$date]);
        $rows = $stmt->fetchAll();
        if (!$rows) {
            throw new InvalidArgumentException("There are no observations for $date to build a bulletin from.");
        }
        $trusted = array_values(array_filter($rows, fn($r) => $r['quality_flag'] !== 'suspect')); // headline figures skip unverified values
        $pick = function (string $col, bool $max) use ($trusted) {
            $c = array_values(array_filter($trusted, fn($r) => $r[$col] !== null));
            if (!$c) {
                return null;
            }
            usort($c, fn($a, $b) => $max ? $b[$col] <=> $a[$col] : $a[$col] <=> $b[$col]);
            return ['name' => $c[0]['name'], 'value' => (float) $c[0][$col]];
        };
        $national = [
            'avg_tmax' => self::avg(array_column($trusted, 'tmax')), 'avg_tmin' => self::avg(array_column($trusted, 'tmin')),
            'stations' => count($rows), 'with_rain' => count(array_filter($trusted, fn($r) => (float) ($r['rain'] ?? 0) >= 0.1)),
        ];
        $highlights = ['hottest' => $pick('tmax', true), 'coldest' => $pick('tmin', false), 'wettest' => $pick('rain', true)];

        $outlook = $this->outlookRows(3);
        return ['kind' => 'daily', 'observed_on' => $date, 'observed' => $rows, 'national' => $national, 'highlights' => $highlights,
            'outlook' => $outlook, 'alerts' => $this->alertSnapshot()];
    }

    /** Forecast per station for the next $days days (today onwards). Empty when the forecast service is unavailable. */
    private function outlookRows(int $days): array
    {
        $today = date('Y-m-d');
        return array_map(function ($s) use ($today, $days) {
            $s['days'] = array_slice(array_values(array_filter($s['days'], fn($d) => $d['date'] >= $today)), 0, $days);
            return $s;
        }, (new Weather())->outlook($days + 1));
    }

    private function outlookSentence(array $outlook, int $days): string
    {
        if (!$outlook) {
            return 'The forecast service was unavailable when this bulletin was prepared, so no outlook is included.';
        }
        $wet = [];
        $hot = null;
        foreach ($outlook as $s) {
            foreach ($s['days'] as $d) {
                if (($d['rain_chance'] ?? 0) >= 50 || (float) ($d['rain_mm'] ?? 0) >= 1) {
                    $wet[$s['province']] = true;
                }
                if ($d['max'] !== null && ($hot === null || $d['max'] > $hot['value'])) {
                    $hot = ['value' => (float) $d['max'], 'name' => $s['name']];
                }
            }
        }
        $txt = $wet
            ? "Over the next $days days rain is likely in " . self::listText(array_keys($wet)) . ' Province' . (count($wet) > 1 ? 's' : '') . '.'
            : "Mostly dry weather is expected across the stations over the next $days days.";
        if ($hot) {
            $txt .= " The highest forecast temperature is {$hot['value']}°C at {$hot['name']}.";
        }
        return $txt;
    }

    private static function listText(array $items): string
    {
        $items = array_values($items);
        if (count($items) <= 1) {
            return $items[0] ?? '';
        }
        return implode(', ', array_slice($items, 0, -1)) . ' and ' . end($items);
    }

    private function dailySummary(array $c): string
    {
        $n = $c['national'];
        $h = $c['highlights'];
        $parts = [];
        $parts[] = 'On ' . self::dateText($c['observed_on']) . ", the average maximum temperature across {$n['stations']} reporting stations was "
            . ($n['avg_tmax'] ?? 'not available') . '°C and the average minimum was ' . ($n['avg_tmin'] ?? 'not available') . '°C.';
        if ($h['hottest']) {
            $parts[] = "The highest maximum was {$h['hottest']['value']}°C at {$h['hottest']['name']}" . ($h['coldest'] ? ", and the lowest minimum was {$h['coldest']['value']}°C at {$h['coldest']['name']}." : '.');
        }
        $parts[] = $n['with_rain'] > 0
            ? "Rain was recorded at {$n['with_rain']} of {$n['stations']} stations, with the highest total of {$h['wettest']['value']} mm at {$h['wettest']['name']}."
            : 'No rainfall was recorded at the reporting stations.';
        $parts[] = $this->outlookSentence($c['outlook'], 3);
        $parts[] = $c['alerts']
            ? count($c['alerts']) . ' weather alert' . (count($c['alerts']) > 1 ? 's are' : ' is') . ' currently in force. See the alerts section.'
            : 'There are no weather alerts in force.';
        return implode(' ', $parts);
    }

    // ------------------------------------------------------------------ weekly

    private function weeklyContent(string $start, string $end): array
    {
        $stmt = $this->db->prepare(
            "SELECT s.id, s.code, s.name, s.province, COUNT(*) AS days, ROUND(AVG(r.tmax),1) AS tmax, ROUND(AVG(r.tmin),1) AS tmin,
                    ROUND(SUM(r.rainfall_mm),1) AS rain, SUM(r.rainfall_mm >= 1) AS rain_days, MAX(r.tmax) AS hottest, MIN(r.tmin) AS coldest
             FROM stations s JOIN active_readings r ON r.station_id = s.id
             WHERE s.status = 'active' AND r.quality_flag <> 'suspect' AND r.observed_on BETWEEN ? AND ?
             GROUP BY s.id ORDER BY s.name"
        );
        $stmt->execute([$start, $end]);
        $rows = $stmt->fetchAll();
        if (!$rows) {
            throw new InvalidArgumentException("There are no observations between $start and $end.");
        }
        // The same calendar window in earlier years gives a "normal" to compare against (needs at least 5 days of data)
        $clim = $this->db->prepare(
            'SELECT ROUND(AVG(tmax),1) AS tmax, ROUND(AVG(tmin),1) AS tmin, ROUND(SUM(rainfall_mm),1) AS rain, COUNT(*) AS n FROM active_readings
             WHERE station_id = ? AND quality_flag <> \'suspect\' AND observed_on BETWEEN DATE_SUB(?, INTERVAL ? DAY) AND DATE_SUB(?, INTERVAL ? DAY)'
        );
        foreach ($rows as &$r) {
            $tx = $tn = $rn = [];
            for ($y = 1; $y <= 5; $y++) {
                $off = 365 * $y;
                $clim->execute([$r['id'], $start, $off, $end, $off]);
                $c = $clim->fetch();
                if ($c && (int) $c['n'] >= 5) {
                    $tx[] = (float) $c['tmax'];
                    $tn[] = (float) $c['tmin'];
                    $rn[] = (float) $c['rain'];
                }
            }
            $r['tmax_anomaly'] = $tx ? round((float) $r['tmax'] - array_sum($tx) / count($tx), 1) : null;
            $r['tmin_anomaly'] = $tn ? round((float) $r['tmin'] - array_sum($tn) / count($tn), 1) : null;
            $r['rain_pct_normal'] = ($rn && array_sum($rn) / count($rn) >= 5) ? (int) round((float) $r['rain'] / (array_sum($rn) / count($rn)) * 100) : null;
            unset($r['id']);
        }
        unset($r);

        $national = [
            'avg_tmax' => self::avg(array_column($rows, 'tmax')), 'avg_tmin' => self::avg(array_column($rows, 'tmin')),
            'avg_rain' => self::avg(array_column($rows, 'rain')), 'stations' => count($rows),
            'tmax_anomaly' => self::avg(array_column($rows, 'tmax_anomaly')), 'rain_pct_normal' => self::avg(array_column($rows, 'rain_pct_normal')),
        ];
        $by = function (string $col, bool $max) use ($rows) {
            $c = array_values(array_filter($rows, fn($r) => $r[$col] !== null));
            if (!$c) {
                return null;
            }
            usort($c, fn($a, $b) => $max ? $b[$col] <=> $a[$col] : $a[$col] <=> $b[$col]);
            return ['name' => $c[0]['name'], 'value' => (float) $c[0][$col]];
        };
        $highlights = ['hottest' => $by('hottest', true), 'coldest' => $by('coldest', false), 'wettest' => $by('rain', true), 'driest' => $by('rain', false)];

        // next seven days: expected rainfall and warmth per station
        $weekOutlook = array_map(function ($s) {
            $d = array_slice(array_values(array_filter($s['days'], fn($x) => $x['date'] >= date('Y-m-d'))), 0, 7);
            return ['code' => $s['code'], 'name' => $s['name'], 'province' => $s['province'],
                'rain_mm' => round(array_sum(array_map(fn($x) => (float) ($x['rain_mm'] ?? 0), $d)), 1),
                'avg_max' => self::avg(array_column($d, 'max')), 'days' => count($d)];
        }, (new Weather())->outlook(7));

        return ['kind' => 'weekly', 'start' => $start, 'end' => $end, 'stations' => $rows, 'national' => $national, 'highlights' => $highlights,
            'outlook' => $weekOutlook, 'alerts' => $this->alertSnapshot()];
    }

    private function weeklySummary(array $c): string
    {
        $n = $c['national'];
        $h = $c['highlights'];
        $p = ['During ' . self::rangeText($c['start'], $c['end']) . ", the average maximum temperature across {$n['stations']} stations was {$n['avg_tmax']}°C and the average minimum was {$n['avg_tmin']}°C."];
        if ($n['tmax_anomaly'] !== null) {
            $d = $n['tmax_anomaly'];
            $p[] = abs($d) < 0.5 ? 'Maximum temperatures were close to the average for this time of year.'
                : 'Maximum temperatures were ' . abs($d) . '°C ' . ($d > 0 ? 'above' : 'below') . ' the average for this time of year.';
        }
        $p[] = "The average rainfall total was {$n['avg_rain']} mm" . ($n['rain_pct_normal'] !== null ? ', about ' . (int) round($n['rain_pct_normal']) . '% of normal' : '') . '.';
        if ($h['wettest'] && $h['wettest']['value'] > 0) {
            $p[] = "The wettest station was {$h['wettest']['name']} with {$h['wettest']['value']} mm.";
        }
        if ($h['hottest']) {
            $p[] = "The highest temperature was {$h['hottest']['value']}°C at {$h['hottest']['name']}" . ($h['coldest'] ? " and the lowest was {$h['coldest']['value']}°C at {$h['coldest']['name']}." : '.');
        }
        $p[] = $c['outlook']
            ? 'For the coming week, rainfall totals of up to ' . max(array_column($c['outlook'], 'rain_mm')) . ' mm are forecast at individual stations.'
            : 'No forecast outlook was available when this summary was prepared.';
        $p[] = $c['alerts'] ? count($c['alerts']) . ' weather alert(s) are currently in force.' : 'There are no weather alerts in force.';
        return implode(' ', $p);
    }

    // ------------------------------------------------------------------ lifecycle

    /**
     * Build a bulletin and save it as a draft (replacing an earlier draft for the same period).
     * $date is the last day covered; it defaults to the latest observation.
     */
    public function generate(string $kind, ?string $date, ?int $userId): array
    {
        if (!in_array($kind, ['daily', 'weekly'], true)) {
            throw new InvalidArgumentException('Unknown bulletin type.');
        }
        $end = $date ?: $this->latestObservation();
        if (!$end) {
            throw new InvalidArgumentException('There are no climate readings yet, so there is nothing to summarise.');
        }
        if (!$end || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || !checkdate((int) substr($end, 5, 2), (int) substr($end, 8, 2), (int) substr($end, 0, 4))) {
            throw new InvalidArgumentException('Choose a valid date.');
        }
        if ($end > date('Y-m-d')) {
            throw new InvalidArgumentException('The date cannot be in the future.');
        }
        if ($kind === 'daily') {
            $start = $end;
            $content = $this->dailyContent($end);
            $title = 'Daily Weather Bulletin, ' . self::dateText($end);
            $summary = $this->dailySummary($content);
        } else {
            $start = (new DateTimeImmutable($end))->modify('-6 days')->format('Y-m-d');
            $content = $this->weeklyContent($start, $end);
            $title = 'Weekly Climate Summary, ' . self::rangeText($start, $end);
            $summary = $this->weeklySummary($content);
        }
        $content['generated_at'] = date('c');

        $stmt = $this->db->prepare('SELECT id, status FROM bulletins WHERE kind = ? AND period_start = ?');
        $stmt->execute([$kind, $start]);
        $existing = $stmt->fetch();
        if ($existing && $existing['status'] === 'published') {
            throw new InvalidArgumentException('That bulletin is already published. Unpublish it first if you need to rebuild it.');
        }
        if ($existing) {
            $this->db->prepare('UPDATE bulletins SET period_end=?, title=?, summary=?, content=?, updated_at=NOW() WHERE id=?')
                ->execute([$end, $title, $summary, json_encode($content), $existing['id']]);
            return ['id' => (int) $existing['id'], 'replaced' => true, 'title' => $title];
        }
        $this->db->prepare(
            "INSERT INTO bulletins (kind, period_start, period_end, title, summary, content, status, created_by) VALUES (?,?,?,?,?,?, 'draft', ?)"
        )->execute([$kind, $start, $end, $title, $summary, json_encode($content), $userId]);
        return ['id' => (int) $this->db->lastInsertId(), 'replaced' => false, 'title' => $title];
    }

    private static function present(array $r, bool $full): array
    {
        $out = [
            'id' => (int) $r['id'], 'kind' => $r['kind'], 'period_start' => $r['period_start'], 'period_end' => $r['period_end'],
            'title' => $r['title'], 'summary' => $r['summary'], 'status' => $r['status'], 'published_at' => $r['published_at'],
        ];
        if ($full) {
            $out['notes'] = $r['notes'];
            $out['content'] = json_decode((string) $r['content'], true) ?: [];
            $out['created_at'] = $r['created_at'];
            $out['updated_at'] = $r['updated_at'];
        }
        return $out;
    }

    public function get(int $id, bool $staff = false): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM bulletins WHERE id = ?');
        $stmt->execute([$id]);
        $r = $stmt->fetch();
        if (!$r || (!$staff && $r['status'] !== 'published')) {
            return null;
        }
        return self::present($r, true);
    }

    /** Staff list (drafts first) or the public list (published only), with paging. */
    public function list(bool $staff, ?string $kind, int $page, int $per): array
    {
        $per = max(1, min($per, 50));
        $where = [];
        $params = [];
        if (!$staff) {
            $where[] = "status = 'published'";
        }
        if ($kind && in_array($kind, ['daily', 'weekly'], true)) {
            $where[] = 'kind = ?';
            $params[] = $kind;
        }
        $w = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM bulletins $w");
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();
        $order = $staff ? "ORDER BY (status = 'draft') DESC, period_end DESC, id DESC" : 'ORDER BY period_end DESC, id DESC';
        $stmt = $this->db->prepare("SELECT * FROM bulletins $w $order LIMIT $per OFFSET " . (max(1, $page) - 1) * $per);
        $stmt->execute($params);
        return ['items' => array_map(fn($r) => self::present($r, false), $stmt->fetchAll()), 'total' => $total, 'page' => max(1, $page), 'per' => $per];
    }

    public function update(int $id, array $in): void
    {
        $title = trim((string) ($in['title'] ?? ''));
        $summary = trim((string) ($in['summary'] ?? ''));
        if (mb_strlen($title) < 8 || mb_strlen($title) > 200) {
            throw new InvalidArgumentException('Write a title of 8 to 200 characters.');
        }
        if (mb_strlen($summary) < 20 || mb_strlen($summary) > 4000) {
            throw new InvalidArgumentException('The summary must be 20 to 4000 characters.');
        }
        $stmt = $this->db->prepare('UPDATE bulletins SET title=?, summary=?, notes=?, updated_at=NOW() WHERE id=?');
        $stmt->execute([$title, $summary, mb_substr(trim((string) ($in['notes'] ?? '')), 0, 1000) ?: null, $id]);
    }

    public function publish(int $id, int $userId): void
    {
        $b = $this->get($id, true);
        if (!$b || $b['status'] !== 'draft') {
            throw new InvalidArgumentException('Only a draft bulletin can be published.');
        }
        $content = $b['content'];
        $content['alerts'] = $this->alertSnapshot(); // freeze the alerts in force at the moment of publishing
        $this->db->prepare("UPDATE bulletins SET status='published', content=?, published_by=?, published_at=NOW(), updated_at=NOW() WHERE id=?")
            ->execute([json_encode($content), $userId, $id]);
    }

    public function unpublish(int $id): void
    {
        $stmt = $this->db->prepare("UPDATE bulletins SET status='draft', published_at=NULL, published_by=NULL, updated_at=NOW() WHERE id=? AND status='published'");
        $stmt->execute([$id]);
        if (!$stmt->rowCount()) {
            throw new InvalidArgumentException('Only a published bulletin can be withdrawn.');
        }
    }

    public function deleteDraft(int $id): void
    {
        $stmt = $this->db->prepare("DELETE FROM bulletins WHERE id=? AND status='draft'");
        $stmt->execute([$id]);
        if (!$stmt->rowCount()) {
            throw new InvalidArgumentException('Only a draft bulletin can be deleted.');
        }
    }
}
