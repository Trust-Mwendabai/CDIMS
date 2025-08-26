<?php
/**
 * Logout Script
 * 
 * This script handles user logout functionality by destroying the current session
 * and redirecting to the login page.
 */

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Include configuration
require_once 'config/config.php';

// Unset all session variables
$_SESSION = [];

// Delete the session cookie
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params["path"],
        $params["domain"],
        $params["secure"],
        $params["httponly"]
    );
}

// Delete remember me cookie if it exists
if (isset($_COOKIE['remember_token'])) {
    setcookie('remember_token', '', time() - 3600, '/', '', true, true);
}

// Destroy the session
session_destroy();

// Redirect to login page with a success message
$_SESSION['success'] = 'You have been successfully logged out.';
redirect('login.php');
?>
