<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Climate Data Integration and Management System (CDIMS)</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <!-- Custom CSS -->
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container">
            <a class="navbar-brand" href="index.php">
                <i class="fas fa-cloud-sun me-2"></i>CDIMS
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item">
                        <a class="nav-link active" href="#home">Home</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#features">Features</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#about">About</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#contact">Contact</a>
                    </li>
                    <li class="nav-item ms-lg-3">
                        <a href="login.php" class="btn btn-outline-light">Login</a>
                    </li>
                    <li class="nav-item ms-lg-2">
                        <a href="register.php" class="btn btn-light">Register</a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <header class="hero bg-light py-5" id="home">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-6">
                    <h1 class="display-4 fw-bold mb-4">Climate Data Integration and Management System</h1>
                    <p class="lead mb-4">A comprehensive platform for managing, analyzing, and visualizing climate data for Zambia.</p>
                    <div class="d-grid gap-2 d-md-flex">
                        <a href="#features" class="btn btn-primary btn-lg me-md-2">
                            <i class="fas fa-search me-2"></i>Explore Features
                        </a>
                        <a href="register.php" class="btn btn-outline-primary btn-lg">
                            <i class="fas fa-user-plus me-2"></i>Get Started
                        </a>
                    </div>
                </div>
                <div class="col-lg-6 mt-5 mt-lg-0">
                    <img src="assets/img/climate-dashboard.svg" alt="Climate Data Dashboard" class="img-fluid">
                </div>
            </div>
        </div>
    </header>

    <!-- Features Section -->
    <section class="py-5" id="features">
        <div class="container">
            <h2 class="text-center mb-5">Key Features</h2>
            <div class="row g-4">
                <div class="col-md-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon bg-primary bg-gradient text-white rounded-3 mb-3 p-3">
                                <i class="fas fa-database fa-2x"></i>
                            </div>
                            <h3 class="h4">Data Integration</h3>
                            <p class="text-muted">Seamlessly import climate data from multiple sources in various formats including CSV, Excel, and JSON.</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon bg-primary bg-gradient text-white rounded-3 mb-3 p-3">
                                <i class="fas fa-chart-line fa-2x"></i>
                            </div>
                            <h3 class="h4">Advanced Analytics</h3>
                            <p class="text-muted">Powerful tools for analyzing climate trends, generating reports, and visualizing complex datasets.</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon bg-primary bg-gradient text-white rounded-3 mb-3 p-3">
                                <i class="fas fa-shield-alt fa-2x"></i>
                            </div>
                            <h3 class="h4">Secure Access</h3>
                            <p class="text-muted">Role-based access control ensures data security and appropriate user permissions.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- About Section -->
    <section class="py-5 bg-light" id="about">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-6">
                    <h2 class="mb-4">About CDIMS</h2>
                    <p class="lead">The Climate Data Integration and Management System (CDIMS) is a comprehensive platform developed for the Zambia Meteorology Department to efficiently manage and analyze climate data.</p>
                    <p>Our mission is to provide accurate, timely, and accessible climate information to support decision-making, research, and public awareness in Zambia.</p>
                    <div class="mt-4">
                        <a href="#" class="btn btn-outline-primary">Learn More</a>
                    </div>
                </div>
                <div class="col-lg-6 mt-5 mt-lg-0">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body p-4">
                            <h3 class="h5 mb-4">Why Choose CDIMS?</h3>
                            <ul class="list-unstyled">
                                <li class="mb-3">
                                    <i class="fas fa-check-circle text-success me-2"></i>
                                    <strong>Comprehensive Data Management</strong> - Store and organize all your climate data in one place
                                </li>
                                <li class="mb-3">
                                    <i class="fas fa-check-circle text-success me-2"></i>
                                    <strong>User-Friendly Interface</strong> - Intuitive design for users of all technical levels
                                </li>
                                <li class="mb-3">
                                    <i class="fas fa-check-circle text-success me-2"></i>
                                    <strong>Real-time Analytics</strong> - Get instant insights from your climate data
                                </li>
                                <li>
                                    <i class="fas fa-check-circle text-success me-2"></i>
                                    <strong>Secure & Reliable</strong> - Built with security and reliability in mind
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Contact Section -->
    <section class="py-5" id="contact">
        <div class="container">
            <h2 class="text-center mb-5">Contact Us</h2>
            <div class="row justify-content-center">
                <div class="col-lg-8">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body p-4">
                            <form>
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label for="name" class="form-label">Full Name</label>
                                        <input type="text" class="form-control" id="name" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="email" class="form-label">Email Address</label>
                                        <input type="email" class="form-control" id="email" required>
                                    </div>
                                    <div class="col-12">
                                        <label for="subject" class="form-label">Subject</label>
                                        <input type="text" class="form-control" id="subject" required>
                                    </div>
                                    <div class="col-12">
                                        <label for="message" class="form-label">Message</label>
                                        <textarea class="form-control" id="message" rows="4" required></textarea>
                                    </div>
                                    <div class="col-12">
                                        <button type="submit" class="btn btn-primary">Send Message</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-dark text-white py-4">
        <div class="container">
            <div class="row">
                <div class="col-md-6">
                    <h5>CDIMS</h5>
                    <p class="text-muted">Climate Data Integration and Management System</p>
                </div>
                <div class="col-md-3">
                    <h6>Quick Links</h6>
                    <ul class="list-unstyled">
                        <li><a href="#home" class="text-decoration-none text-muted">Home</a></li>
                        <li><a href="#features" class="text-decoration-none text-muted">Features</a></li>
                        <li><a href="#about" class="text-decoration-none text-muted">About</a></li>
                        <li><a href="#contact" class="text-decoration-none text-muted">Contact</a></li>
                    </ul>
                </div>
                <div class="col-md-3">
                    <h6>Connect With Us</h6>
                    <div class="d-flex gap-3">
                        <a href="#" class="text-white"><i class="fab fa-facebook-f"></i></a>
                        <a href="#" class="text-white"><i class="fab fa-twitter"></i></a>
                        <a href="#" class="text-white"><i class="fab fa-linkedin-in"></i></a>
                        <a href="#" class="text-white"><i class="fab fa-github"></i></a>
                    </div>
                </div>
            </div>
            <hr class="my-4">
            <div class="text-center text-muted">
                <p class="mb-0">&copy; <?php echo date('Y'); ?> Zambia Meteorology Department. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <!-- Bootstrap JS Bundle with Popper -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <!-- Custom JS -->
    <script src="assets/js/main.js"></script>
</body>
</html>
