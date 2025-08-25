<?php
/**
 * Application Configuration
 * 
 * This file contains the main configuration settings for the CDIMS application.
 */

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Application root
define('APP_ROOT', dirname(dirname(__FILE__)));

// Site URL - Update this to your actual domain in production
define('SITE_URL', 'http://' . $_SERVER['HTTP_HOST'] . '/CDIMS');

// Application environment (development, testing, production)
define('APP_ENV', 'development');

// Error reporting based on environment
if (APP_ENV === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}

// Timezone
date_default_timezone_set('Africa/Lusaka');

// Session configuration
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_secure', isset($_SERVER['HTTPS']));
ini_set('session.cookie_samesite', 'Strict');

// Security settings
ini_set('expose_php', 'Off');
header_remove('X-Powered-By');

// Include database configuration
require_once __DIR__ . '/database.php';

/**
 * Generate a CSRF token and store it in the session
 * 
 * @return string The generated CSRF token
 */
function generateCSRFToken() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Validate a CSRF token
 * 
 * @param string $token The token to validate
 * @return bool True if valid, false otherwise
 */
function validateCSRFToken($token) {
    if (empty($_SESSION['csrf_token']) || empty($token)) {
        return false;
    }
    return hash_equals($_SESSION['csrf_token'], $token);
}

/**
 * Sanitize input data
 * 
 * @param mixed $data The data to sanitize
 * @return mixed The sanitized data
 */
function sanitize($data) {
    if (is_array($data)) {
        return array_map('sanitize', $data);
    }
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

/**
 * Redirect to a URL
 * 
 * @param string $url The URL to redirect to
 * @param int $statusCode HTTP status code (default: 302)
 */
function redirect($url, $statusCode = 302) {
    header('Location: ' . $url, true, $statusCode);
    exit();
}

/**
 * Check if user is logged in
 * 
 * @return bool True if user is logged in, false otherwise
 */
function isLoggedIn() {
    return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']);
}

/**
 * Check if user has a specific role
 * 
 * @param string $role The role to check
 * @return bool True if user has the role, false otherwise
 */
function hasRole($role) {
    return isset($_SESSION['user_role']) && $_SESSION['user_role'] === $role;
}

/**
 * Require user to be logged in
 * 
 * @param string $redirect URL to redirect to if not logged in
 */
function requireLogin($redirect = 'login.php') {
    if (!isLoggedIn()) {
        $_SESSION['redirect_after_login'] = $_SERVER['REQUEST_URI'];
        redirect($redirect);
    }
}

/**
 * Require user to have a specific role
 * 
 * @param string|array $roles Role or array of roles to check
 * @param string $redirect URL to redirect to if user doesn't have the role
 */
function requireRole($roles, $redirect = 'unauthorized.php') {
    if (!is_array($roles)) {
        $roles = [$roles];
    }
    
    if (!isLoggedIn() || !in_array($_SESSION['user_role'], $roles)) {
        $_SESSION['error'] = 'You do not have permission to access this page.';
        redirect($redirect);
    }
}

/**
 * Set a flash message
 * 
 * @param string $key The message key
 * @param string $message The message content
 */
function setFlash($key, $message) {
    $_SESSION['flash'][$key] = $message;
}

/**
 * Get a flash message
 * 
 * @param string $key The message key
 * @param string $default Default value if key doesn't exist
 * @return string The flash message or default value
 */
function getFlash($key, $default = '') {
    if (isset($_SESSION['flash'][$key])) {
        $message = $_SESSION['flash'][$key];
        unset($_SESSION['flash'][$key]);
        return $message;
    }
    return $default;
}

/**
 * Generate a random string
 * 
 * @param int $length Length of the string to generate
 * @return string The generated string
 */
function generateRandomString($length = 32) {
    return bin2hex(random_bytes($length / 2));
}

/**
 * Format date in a user-friendly way
 * 
 * @param string $date The date string
 * @param string $format The format to use (default: 'd M Y H:i')
 * @return string Formatted date string
 */
function formatDate($date, $format = 'd M Y H:i') {
    $timestamp = is_numeric($date) ? $date : strtotime($date);
    return date($format, $timestamp);
}

// Initialize CSRF token if not exists
if (empty($_SESSION['csrf_token'])) {
    generateCSRFToken();
}
?>
