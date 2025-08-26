<?php
// Include configuration and user class
require_once 'config/config.php';
require_once 'includes/classes/User.php';

// Initialize user object
$user = new User();

// Redirect if already logged in
if ($user->isLoggedIn()) {
    redirect('dashboard.php');
}

// Process registration form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Validate CSRF token
    if (!isset($_POST['csrf_token']) || !validateCSRFToken($_POST['csrf_token'])) {
        $error = 'Invalid request. Please try again.';
    } else {
        // Sanitize input
        $username = sanitize($_POST['username'] ?? '');
        $email = sanitize($_POST['email'] ?? '');
        $fullName = sanitize($_POST['full_name'] ?? '');
        $password = $_POST['password'] ?? '';
        $confirmPassword = $_POST['confirm_password'] ?? '';
        
        // Validate input
        if (empty($username) || empty($email) || empty($fullName) || empty($password) || empty($confirmPassword)) {
            $error = 'All fields are required.';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Please enter a valid email address.';
        } elseif (strlen($password) < 8) {
            $error = 'Password must be at least 8 characters long.';
        } elseif ($password !== $confirmPassword) {
            $error = 'Passwords do not match.';
        } else {
            try {
                // Attempt registration
                $userId = $user->register($username, $email, $password, $fullName);
                
                if ($userId) {
                    // Registration successful
                    $_SESSION['success'] = 'Registration successful! You can now login.';
                    redirect('login.php');
                } else {
                    $error = 'Registration failed. Please try again.';
                }
            } catch (Exception $e) {
                $error = $e->getMessage();
            }
        }
    }
}

// Generate CSRF token
$csrfToken = generateCSRFToken();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register - CDIMS</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <!-- Custom CSS -->
    <link href="assets/css/style.css" rel="stylesheet">
    <style>
        body {
            background-color: #f8f9fa;
        }
        .register-container {
            max-width: 500px;
            margin: 50px auto;
            padding: 30px;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
        }
        .register-header {
            text-align: center;
            margin-bottom: 30px;
        }
        .register-header i {
            font-size: 3rem;
            color: #0d6efd;
            margin-bottom: 15px;
        }
        .form-floating {
            margin-bottom: 1rem;
        }
        .btn-register {
            width: 100%;
            padding: 12px;
            font-size: 1.1rem;
        }
        .password-strength {
            height: 5px;
            margin-top: 5px;
            border-radius: 5px;
            transition: all 0.3s ease;
        }
        .strength-0 { width: 20%; background-color: #dc3545; }
        .strength-1 { width: 40%; background-color: #ffc107; }
        .strength-2 { width: 60%; background-color: #ffc107; }
        .strength-3 { width: 80%; background-color: #198754; }
        .strength-4 { width: 100%; background-color: #198754; }
    </style>
</head>
<body>
    <div class="container">
        <div class="register-container">
            <div class="register-header">
                <i class="fas fa-cloud-sun"></i>
                <h2>Create an Account</h2>
                <p class="text-muted">Join CDIMS to access climate data and tools</p>
            </div>
            
            <?php if (isset($error)): ?>
                <div class="alert alert-danger alert-dismissible fade show" role="alert">
                    <?php echo htmlspecialchars($error); ?>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            <?php endif; ?>
            
            <form method="POST" action="register.php" id="registrationForm">
                <input type="hidden" name="csrf_token" value="<?php echo $csrfToken; ?>">
                
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-floating mb-3">
                            <input type="text" class="form-control" id="username" name="username" placeholder="johndoe" 
                                   value="<?php echo isset($_POST['username']) ? htmlspecialchars($_POST['username']) : ''; ?>" required>
                            <label for="username">Username</label>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-floating mb-3">
                            <input type="email" class="form-control" id="email" name="email" placeholder="name@example.com"
                                   value="<?php echo isset($_POST['email']) ? htmlspecialchars($_POST['email']) : ''; ?>" required>
                            <label for="email">Email address</label>
                        </div>
                    </div>
                </div>
                
                <div class="form-floating mb-3">
                    <input type="text" class="form-control" id="full_name" name="full_name" placeholder="John Doe"
                           value="<?php echo isset($_POST['full_name']) ? htmlspecialchars($_POST['full_name']) : ''; ?>" required>
                    <label for="full_name">Full Name</label>
                </div>
                
                <div class="form-floating mb-2">
                    <input type="password" class="form-control" id="password" name="password" placeholder="Password" 
                           minlength="8" required>
                    <label for="password">Password</label>
                    <div id="password-strength" class="password-strength"></div>
                    <small class="form-text text-muted">Must be at least 8 characters long</small>
                </div>
                
                <div class="form-floating mb-4">
                    <input type="password" class="form-control" id="confirm_password" name="confirm_password" 
                           placeholder="Confirm Password" minlength="8" required>
                    <label for="confirm_password">Confirm Password</label>
                    <div id="password-match" class="form-text"></div>
                </div>
                
                <div class="d-grid gap-2">
                    <button type="submit" class="btn btn-primary btn-register" id="registerButton">
                        <i class="fas fa-user-plus me-2"></i> Create Account
                    </button>
                </div>
                
                <div class="text-center mt-4">
                    <p class="mb-0">Already have an account? <a href="login.php" class="text-decoration-none">Sign in</a></p>
                </div>
            </form>
        </div>
    </div>

    <!-- Bootstrap JS Bundle with Popper -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <!-- Password Strength Checker -->
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const passwordInput = document.getElementById('password');
            const confirmPasswordInput = document.getElementById('confirm_password');
            const passwordStrength = document.getElementById('password-strength');
            const passwordMatch = document.getElementById('password-match');
            const registerButton = document.getElementById('registerButton');
            
            // Password strength checker
            passwordInput.addEventListener('input', function() {
                const password = this.value;
                let strength = 0;
                
                // Check length
                if (password.length >= 8) strength++;
                
                // Check for lowercase letters
                if (password.match(/[a-z]+/)) strength++;
                
                // Check for uppercase letters
                if (password.match(/[A-Z]+/)) strength++;
                
                // Check for numbers
                if (password.match(/[0-9]+/)) strength++;
                
                // Check for special characters
                if (password.match(/[!@#$%^&*(),.?":{}|<>]+/)) strength++;
                
                // Update strength indicator
                passwordStrength.className = 'password-strength';
                if (password.length > 0) {
                    passwordStrength.classList.add(`strength-${Math.min(4, strength)}`);
                }
                
                // Validate password match
                validatePasswordMatch();
            });
            
            // Confirm password validation
            confirmPasswordInput.addEventListener('input', validatePasswordMatch);
            
            function validatePasswordMatch() {
                const password = passwordInput.value;
                const confirmPassword = confirmPasswordInput.value;
                
                if (confirmPassword.length === 0) {
                    passwordMatch.textContent = '';
                    passwordMatch.className = 'form-text';
                    return;
                }
                
                if (password === confirmPassword) {
                    passwordMatch.textContent = 'Passwords match';
                    passwordMatch.className = 'form-text text-success';
                    registerButton.disabled = false;
                } else {
                    passwordMatch.textContent = 'Passwords do not match';
                    passwordMatch.className = 'form-text text-danger';
                    registerButton.disabled = true;
                }
            }
            
            // Form validation
            const form = document.getElementById('registrationForm');
            form.addEventListener('submit', function(e) {
                const password = passwordInput.value;
                const confirmPassword = confirmPasswordInput.value;
                
                if (password !== confirmPassword) {
                    e.preventDefault();
                    passwordMatch.textContent = 'Passwords do not match';
                    passwordMatch.className = 'form-text text-danger';
                    passwordInput.focus();
                }
                
                // Additional validation can be added here
            });
        });
    </script>
</body>
</html>
