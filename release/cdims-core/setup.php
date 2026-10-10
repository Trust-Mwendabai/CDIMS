<?php
/**
 * One-time setup. Run from the command line:
 *   php setup.php            create database, tables, stations, admin user and sample data
 *   php setup.php --no-seed  skip the sample climate readings
 *   php setup.php --demo-users  also create demo accounts for the analyst, stakeholder and public roles
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/config/config.php';

try {
    $result = initializeDatabase(!in_array('--no-seed', $argv, true));
} catch (Throwable $e) {
    fwrite(STDERR, 'Setup failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

echo 'Database "' . DB_NAME . "\" is ready.\n";
if ($result['readings'] > 0) {
    echo "Seeded {$result['readings']} sample readings (source = 'sample').\n";
}
if (in_array('--demo-users', $argv, true)) {
    $demo = createDemoUsers();
    if ($demo['created']) {
        echo "\nDemo accounts created (development use only):\n";
        foreach ($demo['created'] as $line) {
            echo "  $line\n";
        }
        echo "  shared password: {$demo['password']}\n";
    } else {
        echo "\nDemo accounts already exist; nothing changed.\n";
    }
}
if ($result['admin_password'] !== null) {
    echo "\nAdmin account created:\n  username: admin\n  password: {$result['admin_password']}\n";
    echo "Save this password now - it is not stored anywhere in plain text.\n";
} else {
    echo "An admin account already exists; no credentials were changed.\n";
}
