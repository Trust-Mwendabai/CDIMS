# Climate Data Integration and Management System (CDIMS)

A comprehensive platform for the Zambia Meteorology Department to manage, analyze, and visualize climate data.

## Features

- **User Management**: Secure authentication and role-based access control
- **Data Integration**: Import data from various sources (CSV, Excel, JSON)
- **Data Management**: Store and organize climate datasets
- **Data Analysis**: Perform statistical analysis and generate reports
- **Visualization**: Interactive dashboards with charts and graphs
- **Administration**: Manage users, roles, and system settings

## Technology Stack

- **Frontend**: HTML5, CSS3, Bootstrap 5, JavaScript, Chart.js
- **Backend**: PHP 8 (Object-Oriented)
- **Database**: MySQL
- **Security**: PHP password_hash(), prepared statements, CSRF protection

## Getting Started

### Prerequisites

- PHP 8.0 or higher
- MySQL 5.7 or higher
- Web server (Apache/Nginx)
- Composer (for dependency management)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/cdims.git
   cd cdims
   ```

2. Install dependencies:
   ```bash
   composer install
   ```

3. Create a copy of the `.env.example` file and configure your environment variables:
   ```bash
   cp .env.example .env
   ```

4. Generate application key:
   ```bash
   php artisan key:generate
   ```

5. Run database migrations:
   ```bash
   php artisan migrate
   ```

6. Start the development server:
   ```bash
   php artisan serve
   ```

7. Open your browser and visit: `http://localhost:8000`

## Project Structure

```
cdims/
├── assets/              # Frontend assets
│   ├── css/            # Stylesheets
│   ├── js/             # JavaScript files
│   └── img/            # Images and icons
├── config/             # Configuration files
├── includes/           # PHP includes and utilities
├── uploads/            # File uploads directory
└── reports/            # Generated reports
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Bootstrap 5](https://getbootstrap.com/)
- [Chart.js](https://www.chartjs.org/)
- [Font Awesome](https://fontawesome.com/)
