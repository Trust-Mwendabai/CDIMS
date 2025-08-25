<?php
/**
 * Database Configuration
 * 
 * This file contains the database connection settings for the CDIMS application.
 */

define('DB_SERVER', 'localhost');

define('DB_USERNAME', 'root');     // Default XAMPP username
define('DB_PASSWORD', '');         // Default XAMPP password is empty
define('DB_NAME', 'cdims_db');     // Database name

/**
 * Create database connection using PDO
 * 
 * @return PDO Returns a PDO connection object
 * @throws PDOException If connection fails
 */
function getDBConnection() {
    try {
        $dsn = "mysql:host=" . DB_SERVER . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        
        $pdo = new PDO($dsn, DB_USERNAME, DB_PASSWORD, $options);
        return $pdo;
    } catch (PDOException $e) {
        // Log the error and display a user-friendly message
        error_log("Database Connection Error: " . $e->getMessage());
        die("Connection failed. Please try again later.");
    }
}

/**
 * Initialize the database by creating necessary tables if they don't exist
 */
function initializeDatabase() {
    try {
        // First, connect without database name to create the database if it doesn't exist
        $dsn = "mysql:host=" . DB_SERVER . ";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USERNAME, DB_PASSWORD, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        
        // Create database if not exists
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        
        // Select the database
        $pdo->exec("USE `" . DB_NAME . "`");
        
        // Create users table
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `users` (
                `user_id` INT AUTO_INCREMENT PRIMARY KEY,
                `username` VARCHAR(50) NOT NULL UNIQUE,
                `email` VARCHAR(100) NOT NULL UNIQUE,
                `password_hash` VARCHAR(255) NOT NULL,
                `full_name` VARCHAR(100) NOT NULL,
                `role` ENUM('admin', 'analyst', 'stakeholder', 'public') NOT NULL DEFAULT 'public',
                `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
                `last_login` DATETIME DEFAULT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_email` (`email`),
                INDEX `idx_username` (`username`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        
        // Create password_reset_tokens table
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `email` VARCHAR(100) NOT NULL,
                `token` VARCHAR(100) NOT NULL,
                `expires_at` DATETIME NOT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_token` (`token`),
                INDEX `idx_email` (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        
        // Create login_attempts table for brute force protection
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `login_attempts` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `ip_address` VARCHAR(45) NOT NULL,
                `attempts` INT NOT NULL DEFAULT 1,
                `last_attempt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_ip` (`ip_address`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        
        // Create sessions table for custom session handling
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `sessions` (
                `id` VARCHAR(128) NOT NULL PRIMARY KEY,
                `user_id` INT DEFAULT NULL,
                `ip_address` VARCHAR(45) NOT NULL,
                `user_agent` TEXT,
                `payload` TEXT NOT NULL,
                `last_activity` INT NOT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `user_id` (`user_id`),
                INDEX `last_activity` (`last_activity`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        
        // Insert default admin user if not exists
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE `role` = 'admin'");
        $stmt->execute();
        $adminCount = $stmt->fetchColumn();
        
        if ($adminCount == 0) {
            $defaultAdmin = [
                'username' => 'admin',
                'email' => 'admin@cdims.zm',
                'password' => 'Admin@123', // Should be changed after first login
                'full_name' => 'System Administrator',
                'role' => 'admin'
            ];
            
            $hashedPassword = password_hash($defaultAdmin['password'], PASSWORD_BCRYPT, ['cost' => 12]);
            
            $stmt = $pdo->prepare("
                INSERT INTO `users` (username, email, password_hash, full_name, role, is_active)
                VALUES (:username, :email, :password_hash, :full_name, :role, 1)
            ");
            
            $stmt->execute([
                ':username' => $defaultAdmin['username'],
                ':email' => $defaultAdmin['email'],
                ':password_hash' => $hashedPassword,
                ':full_name' => $defaultAdmin['full_name'],
                ':role' => $defaultAdmin['role']
            ]);
        }
        
        return true;
    } catch (PDOException $e) {
        error_log("Database Initialization Error: " . $e->getMessage());
        return false;
    }
}

// Initialize the database when this file is included
// Comment this out in production after first run
// initializeDatabase();
?>
