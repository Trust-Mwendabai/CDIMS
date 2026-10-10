<?php
/**
 * Configuration lookup: real environment variables first, then a private .env file.
 *
 * Shared hosting (cPanel) usually cannot set environment variables, so settings can live in a file instead. The file
 * is searched for, in order: $CDIMS_ENV_FILE, <app>/.env, then ".cdims.env" or ".env" in the two parent folders.
 * Keep it OUTSIDE the web root where possible (for example in your home folder). A copy inside the web root is
 * still blocked from the web by .htaccess.
 */
function cdims_env(string $key, ?string $default = null): ?string
{
    static $file = null;
    if ($file === null) {
        $file = [];
        $candidates = array_filter([
            getenv('CDIMS_ENV_FILE') ?: null,
            dirname(__DIR__) . '/.env',
            dirname(__DIR__, 2) . '/.cdims.env',
            dirname(__DIR__, 2) . '/.env',
            dirname(__DIR__, 3) . '/.cdims.env',
        ]);
        foreach ($candidates as $path) {
            if (!is_file($path) || !is_readable($path)) {
                continue;
            }
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = array_map('trim', explode('=', $line, 2));
                if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[0] === substr($v, -1)) {
                    $v = substr($v, 1, -1);
                }
                $file[$k] ??= $v; // the first file that defines a key wins
            }
        }
    }
    $env = getenv($key);
    if ($env !== false && $env !== '') {
        return $env;
    }
    return $file[$key] ?? $default;
}

/**
 * A folder the app can write to (cache, installer lock). It lives in <app>/storage, which is blocked from the web.
 * Falls back to the system temp folder when that is not writable.
 */
function cdims_storage_dir(): string
{
    static $dir = null;
    if ($dir === null) {
        $dir = dirname(__DIR__) . '/storage';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        if (!is_dir($dir) || !is_writable($dir)) {
            $dir = sys_get_temp_dir();
        }
    }
    return $dir;
}

/** Truthy values: 1, true, yes, on. */
function cdims_env_bool(string $key, bool $default = false): bool
{
    $v = cdims_env($key);
    return $v === null ? $default : in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
}
