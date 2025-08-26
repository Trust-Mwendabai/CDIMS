<?php
/**
 * User Class
 * 
 * Handles user authentication and management
 */

class User {
    private $db;
    private $id;
    private $username;
    private $email;
    private $role;
    private $isLoggedIn = false;
    private $maxLoginAttempts = 5;
    private $lockoutTime = 900; // 15 minutes in seconds

    public function __construct($userId = null) {
        $this->db = getDBConnection();
        
        if ($userId) {
            $this->loadUserById($userId);
        } elseif (isset($_SESSION['user_id'])) {
            $this->loadUserById($_SESSION['user_id']);
        }
    }

    /**
     * Load user by ID
     */
    private function loadUserById($userId) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM users WHERE user_id = :id AND is_active = 1 LIMIT 1");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch();
            
            if ($user) {
                $this->id = $user['user_id'];
                $this->username = $user['username'];
                $this->email = $user['email'];
                $this->role = $user['role'];
                $this->isLoggedIn = true;
                
                // Update last login time
                $this->updateLastLogin();
            }
        } catch (PDOException $e) {
            error_log("User Load Error: " . $e->getMessage());
        }
    }

    /**
     * Login user with username/email and password
     */
    public function login($identifier, $password) {
        // Check for too many login attempts
        if ($this->isBruteForce()) {
            throw new Exception('Too many failed login attempts. Please try again later.');
        }
        
        try {
            // Check if identifier is email or username
            $field = filter_var($identifier, FILTER_VALIDATE_EMAIL) ? 'email' : 'username';
            
            $stmt = $this->db->prepare("SELECT * FROM users WHERE $field = :identifier AND is_active = 1 LIMIT 1");
            $stmt->execute([':identifier' => $identifier]);
            $user = $stmt->fetch();
            
            if ($user && password_verify($password, $user['password_hash'])) {
                // Check if password needs rehashing
                if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) {
                    $this->updatePassword($user['user_id'], $password);
                }
                
                // Set session variables
                $this->id = $user['user_id'];
                $this->username = $user['username'];
                $this->email = $user['email'];
                $this->role = $user['role'];
                $this->isLoggedIn = true;
                
                $_SESSION['user_id'] = $this->id;
                $_SESSION['username'] = $this->username;
                $_SESSION['user_role'] = $this->role;
                
                // Regenerate session ID to prevent session fixation
                session_regenerate_id(true);
                
                // Clear any failed login attempts
                $this->clearLoginAttempts();
                
                // Update last login time
                $this->updateLastLogin();
                
                return true;
            }
            
            // Record failed login attempt
            $this->recordLoginAttempt();
            
            return false;
            
        } catch (PDOException $e) {
            error_log("Login Error: " . $e->getMessage());
            throw new Exception('An error occurred while trying to log in.');
        }
    }

    /**
     * Logout user
     */
    public function logout() {
        // Unset all session variables
        $_SESSION = [];
        
        // Delete the session cookie
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        
        // Destroy the session
        session_destroy();
        
        $this->isLoggedIn = false;
        return true;
    }

    /**
     * Register a new user
     */
    public function register($username, $email, $password, $fullName, $role = 'public') {
        try {
            // Validate input
            if (empty($username) || empty($email) || empty($password) || empty($fullName)) {
                throw new Exception('All fields are required.');
            }
            
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new Exception('Invalid email format.');
            }
            
            if (strlen($password) < 8) {
                throw new Exception('Password must be at least 8 characters long.');
            }
            
            // Check if username or email already exists
            $stmt = $this->db->prepare("SELECT user_id FROM users WHERE username = :username OR email = :email LIMIT 1");
            $stmt->execute([':username' => $username, ':email' => $email]);
            
            if ($stmt->rowCount() > 0) {
                throw new Exception('Username or email already exists.');
            }
            
            // Hash password
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            
            // Insert new user
            $stmt = $this->db->prepare("
                INSERT INTO users (username, email, password_hash, full_name, role)
                VALUES (:username, :email, :password_hash, :full_name, :role)
            ");
            
            $result = $stmt->execute([
                ':username' => $username,
                ':email' => $email,
                ':password_hash' => $hashedPassword,
                ':full_name' => $fullName,
                ':role' => $role
            ]);
            
            if ($result) {
                return $this->db->lastInsertId();
            }
            
            return false;
            
        } catch (PDOException $e) {
            error_log("Registration Error: " . $e->getMessage());
            throw new Exception('An error occurred while registering. Please try again.');
        }
    }

    /**
     * Update user password
     */
    public function updatePassword($userId, $newPassword) {
        try {
            $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
            
            $stmt = $this->db->prepare("UPDATE users SET password_hash = :password WHERE user_id = :id");
            return $stmt->execute([
                ':password' => $hashedPassword,
                ':id' => $userId
            ]);
            
        } catch (PDOException $e) {
            error_log("Password Update Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Generate password reset token
     */
    public function generatePasswordResetToken($email) {
        try {
            $user = $this->findByEmail($email);
            
            if (!$user) {
                return false;
            }
            
            // Generate token
            $token = bin2hex(random_bytes(32));
            $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
            
            // Delete any existing tokens for this email
            $this->db->prepare("DELETE FROM password_reset_tokens WHERE email = :email")
                ->execute([':email' => $email]);
            
            // Insert new token
            $stmt = $this->db->prepare("
                INSERT INTO password_reset_tokens (email, token, expires_at)
                VALUES (:email, :token, :expires_at)
            ");
            
            $result = $stmt->execute([
                ':email' => $email,
                ':token' => $token,
                ':expires_at' => $expires
            ]);
            
            return $result ? $token : false;
            
        } catch (PDOException $e) {
            error_log("Password Reset Token Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Reset password using token
     */
    public function resetPassword($token, $newPassword) {
        try {
            // Find valid token
            $stmt = $this->db->prepare("
                SELECT * FROM password_reset_tokens 
                WHERE token = :token AND expires_at > NOW()
                LIMIT 1
            ");
            
            $stmt->execute([':token' => $token]);
            $tokenData = $stmt->fetch();
            
            if (!$tokenData) {
                return false;
            }
            
            // Update password
            $success = $this->updatePasswordByEmail($tokenData['email'], $newPassword);
            
            // Delete token
            if ($success) {
                $this->db->prepare("DELETE FROM password_reset_tokens WHERE token = :token")
                    ->execute([':token' => $token]);
            }
            
            return $success;
            
        } catch (PDOException $e) {
            error_log("Password Reset Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Update last login time
     */
    private function updateLastLogin() {
        try {
            $stmt = $this->db->prepare("UPDATE users SET last_login = NOW() WHERE user_id = :id");
            return $stmt->execute([':id' => $this->id]);
        } catch (PDOException $e) {
            error_log("Last Login Update Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Check for brute force login attempts
     */
    private function isBruteForce() {
        $ip = $_SERVER['REMOTE_ADDR'];
        
        try {
            // Delete old attempts
            $this->db->exec("DELETE FROM login_attempts WHERE last_attempt < DATE_SUB(NOW(), INTERVAL " . $this->lockoutTime . " SECOND)");
            
            // Check current attempts
            $stmt = $this->db->prepare("SELECT attempts FROM login_attempts WHERE ip_address = :ip");
            $stmt->execute([':ip' => $ip]);
            $result = $stmt->fetch();
            
            if ($result && $result['attempts'] >= $this->maxLoginAttempts) {
                return true;
            }
            
            return false;
            
        } catch (PDOException $e) {
            error_log("Brute Force Check Error: " . $e->getMessage());
            return true; // Fail securely
        }
    }

    /**
     * Record a failed login attempt
     */
    private function recordLoginAttempt() {
        $ip = $_SERVER['REMOTE_ADDR'];
        
        try {
            $stmt = $this->db->prepare("
                INSERT INTO login_attempts (ip_address, attempts, last_attempt)
                VALUES (:ip, 1, NOW())
                ON DUPLICATE KEY UPDATE 
                    attempts = attempts + 1,
                    last_attempt = NOW()
            ");
            
            return $stmt->execute([':ip' => $ip]);
            
        } catch (PDOException $e) {
            error_log("Login Attempt Record Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Clear login attempts for IP
     */
    private function clearLoginAttempts() {
        $ip = $_SERVER['REMOTE_ADDR'];
        
        try {
            $stmt = $this->db->prepare("DELETE FROM login_attempts WHERE ip_address = :ip");
            return $stmt->execute([':ip' => $ip]);
        } catch (PDOException $e) {
            error_log("Clear Login Attempts Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Find user by email
     */
    public function findByEmail($email) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
            $stmt->execute([':email' => $email]);
            return $stmt->fetch();
        } catch (PDOException $e) {
            error_log("Find User By Email Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Update password by email
     */
    private function updatePasswordByEmail($email, $password) {
        try {
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            
            $stmt = $this->db->prepare("UPDATE users SET password_hash = :password WHERE email = :email");
            return $stmt->execute([
                ':password' => $hashedPassword,
                ':email' => $email
            ]);
            
        } catch (PDOException $e) {
            error_log("Update Password By Email Error: " . $e->getMessage());
            return false;
        }
    }

    // Getters
    public function getId() { return $this->id; }
    public function getUsername() { return $this->username; }
    public function getEmail() { return $this->email; }
    public function getRole() { return $this->role; }
    public function isLoggedIn() { return $this->isLoggedIn; }

    /**
     * Check if user has a specific role
     */
    public function hasRole($role) {
        if (is_array($role)) {
            return in_array($this->role, $role);
        }
        return $this->role === $role;
    }
}
