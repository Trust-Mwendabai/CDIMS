<?php
// Include configuration and user class
require_once 'config/config.php';
require_once 'includes/classes/User.php';

// Initialize user object
$user = new User();

// Redirect to login if not logged in
if (!$user->isLoggedIn()) {
    $_SESSION['redirect_after_login'] = 'dashboard.php';
    redirect('login.php');
}

// Set page title based on user role
$pageTitle = 'Dashboard';
if ($user->hasRole('admin')) {
    $pageTitle = 'Admin ' . $pageTitle;
} elseif ($user->hasRole('analyst')) {
    $pageTitle = 'Analyst ' . $pageTitle;
} elseif ($user->hasRole('stakeholder')) {
    $pageTitle = 'Stakeholder ' . $pageTitle;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($pageTitle); ?> - CDIMS</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- Custom CSS -->
    <link href="assets/css/style.css" rel="stylesheet">
    <style>
        .sidebar {
            min-height: calc(100vh - 56px);
            background-color: #f8f9fa;
            border-right: 1px solid #dee2e6;
        }
        .sidebar .nav-link {
            color: #333;
            border-radius: 0.25rem;
            margin: 0.25rem 0;
        }
        .sidebar .nav-link.active {
            background-color: #0d6efd;
            color: white;
        }
        .sidebar .nav-link:hover:not(.active) {
            background-color: #e9ecef;
        }
        .sidebar .nav-link i {
            width: 20px;
            margin-right: 10px;
            text-align: center;
        }
        .card {
            border: none;
            box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
            margin-bottom: 1.5rem;
            transition: transform 0.2s ease-in-out;
        }
        .card:hover {
            transform: translateY(-5px);
        }
        .card-icon {
            font-size: 2rem;
            color: #0d6efd;
            margin-bottom: 1rem;
        }
        .welcome-card {
            background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%);
            color: white;
        }
        .welcome-card .card-icon {
            color: white;
        }
    </style>
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container-fluid">
            <a class="navbar-brand" href="dashboard.php">
                <i class="fas fa-cloud-sun me-2"></i>CDIMS
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="fas fa-user-circle me-1"></i> 
                            <?php echo htmlspecialchars($user->getUsername()); ?>
                        </a>
                        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
                            <li><a class="dropdown-item" href="profile.php"><i class="fas fa-user me-2"></i>Profile</a></li>
                            <li><a class="dropdown-item" href="settings.php"><i class="fas fa-cog me-2"></i>Settings</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item" href="logout.php"><i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar -->
            <div class="col-md-3 col-lg-2 d-md-block sidebar py-3">
                <div class="position-sticky">
                    <ul class="nav flex-column">
                        <li class="nav-item">
                            <a class="nav-link active" href="dashboard.php">
                                <i class="fas fa-tachometer-alt"></i> Dashboard
                            </a>
                        </li>
                        
                        <?php if ($user->hasRole(['admin', 'analyst'])): ?>
                        <li class="nav-item">
                            <a class="nav-link" href="data-upload.php">
                                <i class="fas fa-upload"></i> Upload Data
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="data-management.php">
                                <i class="fas fa-database"></i> Data Management
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="analysis.php">
                                <i class="fas fa-chart-line"></i> Analysis
                            </a>
                        </li>
                        <?php endif; ?>
                        
                        <li class="nav-item">
                            <a class="nav-link" href="reports.php">
                                <i class="fas fa-file-alt"></i> Reports
                            </a>
                        </li>
                        
                        <?php if ($user->hasRole('admin')): ?>
                        <li class="nav-item mt-3">
                            <h6 class="px-3 text-uppercase text-muted small fw-bold">Administration</h6>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="users.php">
                                <i class="fas fa-users"></i> User Management
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="system-settings.php">
                                <i class="fas fa-cogs"></i> System Settings
                            </a>
                        </li>
                        <?php endif; ?>
                        
                        <li class="nav-item mt-3">
                            <h6 class="px-3 text-uppercase text-muted small fw-bold">Account</h6>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="profile.php">
                                <i class="fas fa-user"></i> My Profile
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="settings.php">
                                <i class="fas fa-cog"></i> Settings
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="logout.php">
                                <i class="fas fa-sign-out-alt"></i> Logout
                            </a>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Main Content -->
            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4 py-4">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2">Dashboard</h1>
                    <div class="btn-toolbar mb-2 mb-md-0">
                        <div class="btn-group me-2">
                            <button type="button" class="btn btn-sm btn-outline-secondary">Share</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary">Export</button>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle">
                            <i class="fas fa-calendar-alt me-1"></i> This week
                        </button>
                    </div>
                </div>

                <!-- Welcome Card -->
                <div class="row mb-4">
                    <div class="col-12">
                        <div class="card welcome-card text-white">
                            <div class="card-body">
                                <div class="row align-items-center">
                                    <div class="col-md-8">
                                        <h5 class="card-title">Welcome back, <?php echo htmlspecialchars($user->getUsername()); ?>!</h5>
                                        <p class="card-text">
                                            <?php 
                                            $hour = (int)date('H');
                                            if ($hour < 12) {
                                                echo 'Good morning';
                                            } elseif ($hour < 18) {
                                                echo 'Good afternoon';
                                            } else {
                                                echo 'Good evening';
                                            }
                                            ?>. Here's what's happening with your account today.
                                        </p>
                                        <a href="#" class="btn btn-light">View notifications</a>
                                    </div>
                                    <div class="col-md-4 text-center d-none d-md-block">
                                        <i class="fas fa-cloud-sun fa-5x"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Stats Cards -->
                <div class="row">
                    <div class="col-md-6 col-lg-3 mb-4">
                        <div class="card h-100">
                            <div class="card-body text-center">
                                <div class="card-icon">
                                    <i class="fas fa-database"></i>
                                </div>
                                <h5 class="card-title">Data Records</h5>
                                <h2 class="mb-0">1,254</h2>
                                <p class="text-muted small mt-2">+12% from last month</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6 col-lg-3 mb-4">
                        <div class="card h-100">
                            <div class="card-body text-center">
                                <div class="card-icon">
                                    <i class="fas fa-chart-line"></i>
                                </div>
                                <h5 class="card-title">Analyses</h5>
                                <h2 class="mb-0">42</h2>
                                <p class="text-muted small mt-2">+3 new this week</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6 col-lg-3 mb-4">
                        <div class="card h-100">
                            <div class="card-body text-center">
                                <div class="card-icon">
                                    <i class="fas fa-file-alt"></i>
                                </div>
                                <h5 class="card-title">Reports</h5>
                                <h2 class="mb-0">18</h2>
                                <p class="text-muted small mt-2">+2 from last week</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6 col-lg-3 mb-4">
                        <div class="card h-100">
                            <div class="card-body text-center">
                                <div class="card-icon">
                                    <i class="fas fa-bell"></i>
                                </div>
                                <h5 class="card-title">Alerts</h5>
                                <h2 class="mb-0">3</h2>
                                <p class="text-muted small mt-2">Require attention</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Charts Row -->
                <div class="row">
                    <div class="col-lg-8 mb-4">
                        <div class="card h-100">
                            <div class="card-header">
                                <h6 class="card-title mb-0">Temperature Trends</h6>
                            </div>
                            <div class="card-body">
                                <canvas id="temperatureChart" height="300"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-4 mb-4">
                        <div class="card h-100">
                            <div class="card-header">
                                <h6 class="card-title mb-0">Data Distribution</h6>
                            </div>
                            <div class="card-body">
                                <canvas id="dataDistributionChart" height="300"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h6 class="card-title mb-0">Recent Activity</h6>
                                <a href="activity.php" class="btn btn-sm btn-outline-primary">View All</a>
                            </div>
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>Activity</th>
                                                <th>User</th>
                                                <th>Time</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>Data import completed</td>
                                                <td>You</td>
                                                <td>2 minutes ago</td>
                                                <td><span class="badge bg-success">Completed</span></td>
                                            </tr>
                                            <tr>
                                                <td>New report generated</td>
                                                <td>John Doe</td>
                                                <td>1 hour ago</td>
                                                <td><span class="badge bg-success">Completed</span></td>
                                            </tr>
                                            <tr>
                                                <td>Scheduled analysis</td>
                                                <td>System</td>
                                                <td>3 hours ago</td>
                                                <td><span class="badge bg-warning">Pending</span></td>
                                            </tr>
                                            <tr>
                                                <td>User login</td>
                                                <td>You</td>
                                                <td>5 hours ago</td>
                                                <td><span class="badge bg-info">Info</span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </div>

    <!-- Bootstrap JS Bundle with Popper -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <!-- Custom JS -->
    <script>
        // Temperature Chart
        const tempCtx = document.getElementById('temperatureChart').getContext('2d');
        const tempChart = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Average Temperature (°C)',
                    data: [22.1, 22.3, 22.0, 21.4, 20.1, 18.5, 18.3, 19.8, 22.5, 24.1, 23.8, 22.5],
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });

        // Data Distribution Chart
        const distCtx = document.getElementById('dataDistributionChart').getContext('2d');
        const distChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: ['Temperature', 'Precipitation', 'Humidity', 'Wind Speed', 'Other'],
                datasets: [{
                    data: [35, 25, 20, 15, 5],
                    backgroundColor: [
                        '#0d6efd',
                        '#198754',
                        '#ffc107',
                        '#fd7e14',
                        '#6c757d'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    </script>
</body>
</html>
