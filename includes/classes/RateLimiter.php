<?php
/** Thrown when a request exceeds a rate limit. Carries the number of seconds until the caller may retry. */
class RateLimitExceeded extends RuntimeException
{
    public function __construct(string $message, public readonly int $retryAfter)
    {
        parent::__construct($message, 429);
    }
}

/**
 * Database-backed fixed-window rate limiter (works on shared hosting: no Redis or APCu needed).
 *
 * Two styles:
 *  - enforce(): count every request and refuse once the limit is passed (API abuse, expensive endpoints).
 *  - blocked() / failure() / clear(): count only failures, used by sign-in so correct passwords are never penalised.
 */
class RateLimiter
{
    private static function key(string $bucket, string $subject): string
    {
        return sha1($bucket . '|' . $subject); // hashed so addresses and usernames are not stored in the clear
    }

    private static function retryText(int $seconds): string
    {
        return $seconds >= 90 ? 'about ' . (int) ceil($seconds / 60) . ' minutes' : "{$seconds} seconds";
    }

    /** Count one hit in the current window. Returns the state after counting. */
    private static function incr(string $key, int $window): array
    {
        $db = getDBConnection();
        $now = time();
        $db->prepare(
            'INSERT INTO rate_limits (rkey, hits, window_start) VALUES (?, 1, ?)
             ON DUPLICATE KEY UPDATE hits = IF(window_start <= ?, 1, hits + 1), window_start = IF(window_start <= ?, ?, window_start)'
        )->execute([$key, $now, $now - $window, $now - $window, $now]);
        $row = self::row($key);
        if (random_int(1, 200) === 1) {
            $db->prepare('DELETE FROM rate_limits WHERE window_start < ?')->execute([$now - 86400]); // housekeeping
        }
        return $row;
    }

    private static function row(string $key): array
    {
        $stmt = getDBConnection()->prepare('SELECT hits, window_start FROM rate_limits WHERE rkey = ?');
        $stmt->execute([$key]);
        return $stmt->fetch() ?: ['hits' => 0, 'window_start' => time()];
    }

    /**
     * Count this request and refuse it if the limit is exceeded. Sends X-RateLimit-* headers.
     *
     * @throws RateLimitExceeded
     */
    public static function enforce(string $bucket, string $subject, int $limit, int $windowSeconds, string $what = 'requests'): void
    {
        $r = self::incr(self::key($bucket, $subject), $windowSeconds);
        $reset = max(1, (int) $r['window_start'] + $windowSeconds - time());
        if (!headers_sent()) {
            header("X-RateLimit-Limit: $limit");
            header('X-RateLimit-Remaining: ' . max(0, $limit - (int) $r['hits']));
            header("X-RateLimit-Reset: $reset");
        }
        if ((int) $r['hits'] > $limit) {
            throw new RateLimitExceeded('Too many ' . $what . '. Please wait ' . self::retryText($reset) . ' and try again.', $reset);
        }
    }

    /** Seconds until the caller may try again, or 0 when not blocked. Does not count a hit. */
    public static function blocked(string $bucket, string $subject, int $limit, int $windowSeconds): int
    {
        $r = self::row(self::key($bucket, $subject));
        if ((int) $r['hits'] < $limit) {
            return 0;
        }
        $left = (int) $r['window_start'] + $windowSeconds - time();
        return $left > 0 ? $left : 0;
    }

    /** Record a failure (for example a wrong password). */
    public static function failure(string $bucket, string $subject, int $windowSeconds): void
    {
        self::incr(self::key($bucket, $subject), $windowSeconds);
    }

    public static function clear(string $bucket, string $subject): void
    {
        getDBConnection()->prepare('DELETE FROM rate_limits WHERE rkey = ?')->execute([self::key($bucket, $subject)]);
    }

    public static function waitText(int $seconds): string
    {
        return self::retryText($seconds);
    }
}
