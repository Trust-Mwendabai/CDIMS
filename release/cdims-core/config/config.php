<?php
/**
 * Application bootstrap: environment, session, and shared helpers.
 */

require_once __DIR__ . '/env.php';

define('APP_ROOT', dirname(__DIR__));
define('APP_ENV', cdims_env('CDIMS_ENV', 'development'));

error_reporting(E_ALL);
ini_set('display_errors', APP_ENV === 'development' ? '1' : '0');
ini_set('log_errors', '1');

date_default_timezone_set(cdims_env('CDIMS_TIMEZONE', 'Africa/Lusaka'));
header_remove('X-Powered-By'); // do not advertise the PHP version

/**
 * Whether to believe X-Forwarded-* headers. Turn on ONLY when the app sits behind a proxy you control
 * (Cloudflare, a load balancer); otherwise visitors could fake their address and bypass rate limits.
 */
define('TRUST_PROXY', cdims_env_bool('CDIMS_TRUST_PROXY', false));

/** The visitor's IP address, as seen by the server (or by the trusted proxy in front of it). */
function clientIp(): string
{
    if (TRUST_PROXY) {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR'] as $h) {
            if (!empty($_SERVER[$h])) {
                $ip = trim(explode(',', $_SERVER[$h])[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function isHttps(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return TRUST_PROXY && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

// Session lifetime: signed out after this much inactivity, and never kept longer than the absolute limit
define('SESSION_IDLE_SECONDS', max(5, (int) cdims_env('CDIMS_SESSION_IDLE_MIN', '60')) * 60);
define('SESSION_MAX_SECONDS', max(1, (int) cdims_env('CDIMS_SESSION_MAX_HOURS', '12')) * 3600);

// Session hardening (must be configured before session_start)
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_strict_mode', '1');      // never accept a session id the server did not issue
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string) SESSION_MAX_SECONDS);
    session_name(isHttps() ? '__Host-cdims_session' : 'cdims_session'); // __Host- pins the cookie to this exact host over HTTPS
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => isHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

require_once __DIR__ . '/database.php';

function csrfToken(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validCsrf(?string $token): bool
{
    return !empty($_SESSION['csrf_token']) && is_string($token) && hash_equals($_SESSION['csrf_token'], $token);
}
