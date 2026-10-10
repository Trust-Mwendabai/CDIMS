<?php
/**
 * Weather: live conditions and short forecasts for the station locations, from Open-Meteo (https://open-meteo.com).
 *
 * These are model-based values for each station's coordinates. They are NOT ZMD observations and are never written
 * to the climate record. Responses are cached on disk so many users share one upstream request.
 */
class Weather
{
    private const BASE = 'https://api.open-meteo.com/v1/forecast';
    private const TTL_CURRENT = 600;    // Open-Meteo refreshes its current values every 15 minutes
    private const TTL_FORECAST = 1800;
    private const STALE_LIMIT = 7200;   // serve the last good answer for up to two hours if the service is unreachable

    /** WMO weather interpretation codes => [label, icon key used by the frontend] */
    private const CODES = [
        0 => ['Clear sky', 'sun'], 1 => ['Mostly clear', 'sun'], 2 => ['Partly cloudy', 'partly'], 3 => ['Overcast', 'cloud'],
        45 => ['Fog', 'fog'], 48 => ['Freezing fog', 'fog'],
        51 => ['Light drizzle', 'drizzle'], 53 => ['Drizzle', 'drizzle'], 55 => ['Heavy drizzle', 'drizzle'],
        56 => ['Freezing drizzle', 'drizzle'], 57 => ['Freezing drizzle', 'drizzle'],
        61 => ['Light rain', 'rain'], 63 => ['Rain', 'rain'], 65 => ['Heavy rain', 'rain'],
        66 => ['Freezing rain', 'rain'], 67 => ['Freezing rain', 'rain'],
        71 => ['Light snow', 'snow'], 73 => ['Snow', 'snow'], 75 => ['Heavy snow', 'snow'], 77 => ['Snow grains', 'snow'],
        80 => ['Light showers', 'rain'], 81 => ['Showers', 'rain'], 82 => ['Violent showers', 'rain'],
        85 => ['Snow showers', 'snow'], 86 => ['Snow showers', 'snow'],
        95 => ['Thunderstorm', 'storm'], 96 => ['Thunderstorm with hail', 'storm'], 99 => ['Severe thunderstorm', 'storm'],
    ];

    private PDO $db;

    public function __construct()
    {
        $this->db = getDBConnection();
    }

    private static function describe(?int $code): array
    {
        [$label, $icon] = self::CODES[$code] ?? ['Unknown', 'cloud'];
        return ['label' => $label, 'icon' => $icon];
    }

    private function http(string $url): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'CDIMS/1.0 (Zambia Meteorology Department)',
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $json = is_string($body) ? json_decode($body, true) : null;
        if ($status !== 200 || !is_array($json)) {
            throw new RuntimeException('Live weather is unavailable right now.', 503);
        }
        return $json;
    }

    /** Disk cache shared by all users. Falls back to the last good copy when the upstream service fails. */
    private function cached(string $key, int $ttl, callable $fetch): array
    {
        $file = cdims_storage_dir() . DIRECTORY_SEPARATOR . 'cdims_weather_' . md5($key) . '.json';
        $age = is_file($file) ? time() - filemtime($file) : PHP_INT_MAX;
        if ($age < $ttl) {
            $data = json_decode((string) file_get_contents($file), true);
            if (is_array($data)) {
                return $data + ['stale' => false, 'updated_at' => date('c', filemtime($file))];
            }
        }
        try {
            $data = $fetch();
            file_put_contents($file, json_encode($data), LOCK_EX);
            return $data + ['stale' => false, 'updated_at' => date('c')];
        } catch (RuntimeException $e) {
            if ($age < self::STALE_LIMIT) {
                $data = json_decode((string) file_get_contents($file), true);
                if (is_array($data)) {
                    return $data + ['stale' => true, 'updated_at' => date('c', filemtime($file))];
                }
            }
            throw $e;
        }
    }

    private function stations(): array
    {
        return $this->db->query(
            "SELECT id, code, name, province, latitude, longitude FROM stations WHERE status = 'active' ORDER BY name"
        )->fetchAll();
    }

    /** Current conditions at every active station, plus a national summary. */
    public function current(): array
    {
        $stations = $this->stations();
        if (!$stations) {
            return ['stations' => [], 'summary' => null, 'stale' => false, 'updated_at' => date('c'), 'source' => 'Open-Meteo'];
        }
        $lat = implode(',', array_map(fn($s) => $s['latitude'], $stations));
        $lng = implode(',', array_map(fn($s) => $s['longitude'], $stations));
        $key = "current|$lat|$lng";

        $data = $this->cached($key, self::TTL_CURRENT, function () use ($lat, $lng) {
            $url = self::BASE . '?' . http_build_query([
                'latitude' => $lat, 'longitude' => $lng, 'timezone' => 'Africa/Lusaka', 'wind_speed_unit' => 'ms',
                'current' => 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
            ], '', '&', PHP_QUERY_RFC3986);
            $res = $this->http($url);
            return ['raw' => isset($res['current']) ? [$res] : $res]; // one location returns an object, several return a list
        });

        $rows = [];
        foreach ($stations as $i => $s) {
            $c = $data['raw'][$i]['current'] ?? null;
            if (!$c) {
                continue;
            }
            $d = self::describe(isset($c['weather_code']) ? (int) $c['weather_code'] : null);
            $rows[] = [
                'id' => (int) $s['id'], 'code' => $s['code'], 'name' => $s['name'], 'province' => $s['province'],
                'latitude' => (float) $s['latitude'], 'longitude' => (float) $s['longitude'],
                'temperature' => $c['temperature_2m'] ?? null, 'feels_like' => $c['apparent_temperature'] ?? null,
                'humidity' => $c['relative_humidity_2m'] ?? null, 'rain_mm' => $c['precipitation'] ?? null,
                'wind_ms' => isset($c['wind_speed_10m']) ? round($c['wind_speed_10m'], 1) : null,
                'wind_dir' => $c['wind_direction_10m'] ?? null,
                'condition' => $d['label'], 'icon' => $d['icon'], 'observed' => $c['time'] ?? null,
            ];
        }

        $temps = array_filter(array_column($rows, 'temperature'), fn($v) => $v !== null);
        $avg = fn(string $k) => ($vals = array_filter(array_column($rows, $k), fn($v) => $v !== null)) ? round(array_sum($vals) / count($vals), 1) : null;
        $hot = $rows ? array_reduce($rows, fn($a, $r) => ($a === null || $r['temperature'] > $a['temperature']) ? $r : $a) : null;
        $cold = $rows ? array_reduce($rows, fn($a, $r) => ($a === null || $r['temperature'] < $a['temperature']) ? $r : $a) : null;

        return [
            'stations' => $rows,
            'summary' => $rows ? [
                'avg_temp' => $avg('temperature'), 'avg_humidity' => $avg('humidity'), 'avg_wind' => $avg('wind_ms'),
                'raining' => count(array_filter($rows, fn($r) => ($r['rain_mm'] ?? 0) > 0)),
                'hottest' => $hot ? ['name' => $hot['name'], 'temperature' => $hot['temperature']] : null,
                'coldest' => $cold ? ['name' => $cold['name'], 'temperature' => $cold['temperature']] : null,
                'count' => count($rows),
            ] : null,
            'stale' => $data['stale'], 'updated_at' => $data['updated_at'], 'source' => 'Open-Meteo',
        ];
    }

    /**
     * Daily outlook for every active station (one batched upstream request). Used by bulletins and by the
     * forecast side of alert rules. Returns [] if the weather service cannot be reached.
     *
     * @return array<int, array{id:int, code:string, name:string, province:string, days: array<int, array<string,mixed>>}>
     */
    public function outlook(int $days = 7): array
    {
        $stations = $this->stations();
        if (!$stations) {
            return [];
        }
        $days = max(1, min($days, 7));
        $lat = implode(',', array_map(fn($s) => $s['latitude'], $stations));
        $lng = implode(',', array_map(fn($s) => $s['longitude'], $stations));
        try {
            $data = $this->cached("outlook|$days|$lat|$lng", self::TTL_FORECAST, function () use ($lat, $lng, $days) {
                $url = self::BASE . '?' . http_build_query([
                    'latitude' => $lat, 'longitude' => $lng, 'timezone' => 'Africa/Lusaka', 'wind_speed_unit' => 'ms', 'forecast_days' => $days,
                    'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
                ], '', '&', PHP_QUERY_RFC3986);
                $res = $this->http($url);
                return ['raw' => isset($res['daily']) ? [$res] : $res];
            });
        } catch (RuntimeException) {
            return [];
        }
        $out = [];
        foreach ($stations as $i => $s) {
            $d = $data['raw'][$i]['daily'] ?? null;
            if (!$d) {
                continue;
            }
            $rows = [];
            foreach ($d['time'] as $k => $date) {
                $c = self::describe(isset($d['weather_code'][$k]) ? (int) $d['weather_code'][$k] : null);
                $rows[] = [
                    'date' => $date, 'condition' => $c['label'], 'icon' => $c['icon'],
                    'max' => $d['temperature_2m_max'][$k] ?? null, 'min' => $d['temperature_2m_min'][$k] ?? null,
                    'rain_mm' => $d['precipitation_sum'][$k] ?? null, 'rain_chance' => $d['precipitation_probability_max'][$k] ?? null,
                    'wind_max' => isset($d['wind_speed_10m_max'][$k]) ? round($d['wind_speed_10m_max'][$k], 1) : null,
                ];
            }
            $out[] = ['id' => (int) $s['id'], 'code' => $s['code'], 'name' => $s['name'], 'province' => $s['province'], 'days' => $rows];
        }
        return $out;
    }

    /** Next 24 hours and 7 days for one station. */
    public function forecast(int $stationId): array
    {
        $stmt = $this->db->prepare('SELECT id, name, latitude, longitude FROM stations WHERE id = ?');
        $stmt->execute([$stationId]);
        $s = $stmt->fetch();
        if (!$s) {
            throw new InvalidArgumentException('Unknown station.');
        }
        $data = $this->cached("forecast|{$s['latitude']}|{$s['longitude']}", self::TTL_FORECAST, function () use ($s) {
            $url = self::BASE . '?' . http_build_query([
                'latitude' => $s['latitude'], 'longitude' => $s['longitude'], 'timezone' => 'Africa/Lusaka', 'wind_speed_unit' => 'ms',
                'forecast_days' => 7, 'forecast_hours' => 24,
                'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
                'hourly' => 'temperature_2m,precipitation_probability',
            ], '', '&', PHP_QUERY_RFC3986);
            return ['raw' => $this->http($url)];
        });

        $raw = $data['raw'];
        $daily = [];
        foreach (($raw['daily']['time'] ?? []) as $i => $date) {
            $d = self::describe(isset($raw['daily']['weather_code'][$i]) ? (int) $raw['daily']['weather_code'][$i] : null);
            $daily[] = [
                'date' => $date, 'condition' => $d['label'], 'icon' => $d['icon'],
                'max' => $raw['daily']['temperature_2m_max'][$i] ?? null, 'min' => $raw['daily']['temperature_2m_min'][$i] ?? null,
                'rain_mm' => $raw['daily']['precipitation_sum'][$i] ?? null,
                'rain_chance' => $raw['daily']['precipitation_probability_max'][$i] ?? null,
                'wind_max' => isset($raw['daily']['wind_speed_10m_max'][$i]) ? round($raw['daily']['wind_speed_10m_max'][$i], 1) : null,
            ];
        }
        $hourly = [];
        foreach (($raw['hourly']['time'] ?? []) as $i => $t) {
            $hourly[] = ['time' => $t, 'temp' => $raw['hourly']['temperature_2m'][$i] ?? null, 'rain_chance' => $raw['hourly']['precipitation_probability'][$i] ?? null];
        }
        return [
            'station' => ['id' => (int) $s['id'], 'name' => $s['name']],
            'daily' => $daily, 'hourly' => $hourly,
            'stale' => $data['stale'], 'updated_at' => $data['updated_at'], 'source' => 'Open-Meteo',
        ];
    }
}
