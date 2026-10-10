<?php
/**
 * CDIMS web installer: creates the database tables and the first administrator from the browser.
 * For hosts without command-line access (typical cPanel shared hosting).
 *
 * SAFETY: it does nothing until CDIMS_INSTALL_TOKEN (12+ characters) is set in the private .env file, it needs that
 * token to open, it locks itself after a successful install, and it must be DELETED from the server afterwards.
 */
declare(strict_types=1);

// ---- locate the backend folder (same search order as api/index.php)
$core = null;
foreach ([getenv('CDIMS_CORE') ?: '', __DIR__ . '/../cdims-core', __DIR__ . '/cdims-core', __DIR__ . '/..', __DIR__ . '/../../cdims-core'] as $candidate) {
    if ($candidate !== '' && is_file($candidate . '/config/config.php')) {
        $core = $candidate;
        break;
    }
}

function page(string $title, string $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>CDIMS installer</title><style>'
        . 'body{font:16px/1.55 system-ui,Segoe UI,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:24px}'
        . '.box{max-width:640px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;box-shadow:0 8px 30px rgba(15,23,42,.08)}'
        . 'h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:22px 0 8px}p{margin:8px 0}label{display:block;font-weight:600;font-size:14px;margin:14px 0 4px}'
        . 'input[type=text],input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}'
        . 'button{margin-top:18px;padding:11px 20px;border:0;border-radius:8px;background:#0b6e99;color:#fff;font:inherit;font-weight:600;cursor:pointer}'
        . 'table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 0;border-bottom:1px solid #f1f5f9}.ok{color:#15803d;font-weight:600}.bad{color:#b91c1c;font-weight:600}'
        . '.err{background:#fee2e2;color:#991b1b;padding:10px 12px;border-radius:8px;margin:12px 0}.note{background:#e0f2fe;color:#075985;padding:10px 12px;border-radius:8px;margin:12px 0}'
        . 'small{color:#64748b}code{background:#f1f5f9;padding:1px 6px;border-radius:5px}'
        . '</style></head><body><div class="box"><h1>' . htmlspecialchars($title) . '</h1>' . $body . '</div></body></html>';
    exit;
}
$h = fn(?string $s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

if ($core === null) {
    page('Backend folder not found', '<div class="err">The <code>cdims-core</code> folder was not found next to this file or one level above it. Upload it as described in DEPLOYMENT.md, or set <code>CDIMS_CORE</code> to its path.</div>', 500);
}

require_once $core . '/config/config.php';        // also starts the session
require_once $core . '/includes/classes/PasswordPolicy.php';

$lock = cdims_storage_dir() . '/installed.lock';
if (is_file($lock)) {
    page('Already installed', '<p>CDIMS has already been installed on this server.</p><div class="note"><b>Please delete <code>install.php</code> from the server.</b> It is no longer needed.</div>');
}

$token = (string) cdims_env('CDIMS_INSTALL_TOKEN', '');
if (strlen($token) < 12) {
    page('Installer is switched off', '<p>For safety the installer stays disabled until you set a secret token.</p>'
        . '<p>Add this line to your private <code>.env</code> file, using your own long random value, then reload this page:</p>'
        . '<p><code>CDIMS_INSTALL_TOKEN=put-a-long-random-secret-here</code></p><small>At least 12 characters. Remove the line again after installing.</small>', 403);
}

if (empty($_SESSION['inst_csrf'])) {
    $_SESSION['inst_csrf'] = bin2hex(random_bytes(16));
}
$csrf = $_SESSION['inst_csrf'];
$post = $_SERVER['REQUEST_METHOD'] === 'POST';
if ($post && !hash_equals($csrf, (string) ($_POST['csrf'] ?? ''))) {
    page('Please try again', '<div class="err">The form expired. Reload the page and try again.</div>', 419);
}

// ---- step 1: token
if (empty($_SESSION['inst_ok'])) {
    $error = '';
    if ($post && isset($_POST['token'])) {
        $_SESSION['inst_tries'] = ($_SESSION['inst_tries'] ?? 0) + 1;
        if ($_SESSION['inst_tries'] > 8) {
            page('Too many attempts', '<div class="err">Too many wrong tokens. Close the browser and try again later.</div>', 429);
        }
        if (hash_equals($token, (string) $_POST['token'])) {
            $_SESSION['inst_ok'] = true;
            header('Location: ' . $_SERVER['REQUEST_URI']);
            exit;
        }
        sleep(2); // slow down guessing
        $error = '<div class="err">That token is not correct.</div>';
    }
    page('CDIMS installer', $error . '<p>Enter the installer token from your <code>.env</code> file.</p><form method="post">'
        . '<input type="hidden" name="csrf" value="' . $h($csrf) . '"><label for="t">Installer token</label>'
        . '<input id="t" name="token" type="password" autocomplete="off" required autofocus><button>Continue</button></form>');
}

// ---- step 2: checks and install
$checks = [];
$add = function (string $label, bool $ok, string $detail = '') use (&$checks) { $checks[] = [$label, $ok, $detail]; };
$add('PHP 8.1 or newer', PHP_VERSION_ID >= 80100, PHP_VERSION);
foreach (['pdo_mysql', 'curl', 'mbstring', 'json', 'openssl'] as $ext) {
    $add("PHP extension: $ext", extension_loaded($ext));
}
$add('Writable storage folder', is_writable(cdims_storage_dir()), cdims_storage_dir());
$dbOk = false;
$dbDetail = '';
try {
    $pdo = getDBConnection();
    $dbOk = true;
    $dbDetail = 'Connected to "' . DB_NAME . '" on ' . DB_SERVER . ' (MySQL/MariaDB ' . $pdo->query('SELECT VERSION()')->fetchColumn() . ')';
} catch (Throwable $e) {
    // The database may simply not exist yet (and the account may be allowed to create it): setup will try
    $dbDetail = 'Could not connect yet: ' . $e->getMessage();
    try {
        $probe = new PDO('mysql:host=' . DB_SERVER . ';charset=utf8mb4', DB_USERNAME, DB_PASSWORD, PDO_OPTIONS);
        $dbDetail = 'Server reachable, but the database "' . DB_NAME . '" does not exist or this account cannot open it. Create it in cPanel first.';
    } catch (Throwable $e2) {
        $dbDetail = 'Cannot connect to the database server: ' . $e2->getMessage() . ' Check CDIMS_DB_HOST, CDIMS_DB_USER and CDIMS_DB_PASS in .env.';
    }
}
$add('Database connection', $dbOk, $dbDetail);
$add('Production mode', cdims_env('CDIMS_ENV', 'development') === 'production', 'CDIMS_ENV=' . cdims_env('CDIMS_ENV', 'development') . ' (set it to production before going live)');
$ready = !array_filter($checks, fn($c) => !$c[1] && !str_starts_with($c[0], 'Production'));

$error = '';
$val = ['full_name' => '', 'email' => '', 'username' => 'admin'];
if ($post && isset($_POST['install'])) {
    $val = ['full_name' => trim((string) $_POST['full_name']), 'email' => trim((string) $_POST['email']), 'username' => trim((string) $_POST['username'])];
    $pw = (string) ($_POST['password'] ?? '');
    try {
        if (!$ready) {
            throw new InvalidArgumentException('Fix the failed checks first.');
        }
        if ($val['full_name'] === '' || !preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $val['username']) || !filter_var($val['email'], FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter your name, a valid email and a username of 3-50 letters, numbers, . _ -');
        }
        if ($pw !== (string) ($_POST['confirm'] ?? '')) {
            throw new InvalidArgumentException('The passwords do not match.');
        }
        PasswordPolicy::assert($pw, $val);
        $result = initializeDatabase(!empty($_POST['demo']), $val + ['password' => $pw]);
        file_put_contents($lock, 'installed ' . date('c') . "\n");
        unset($_SESSION['inst_ok']);
        page('Installation complete', '<p class="ok">The database is ready and your administrator account has been created.</p>'
            . ($result['readings'] ? '<p>Demonstration data was loaded (' . (int) $result['readings'] . ' sample readings).</p>' : '<p>No sample data was loaded.</p>')
            . '<div class="note"><b>Do these now:</b><ol><li>Delete <code>install.php</code> from the server.</li><li>Remove the <code>CDIMS_INSTALL_TOKEN</code> line from <code>.env</code>.</li><li>Sign in as <b>' . $h($val['username']) . '</b> and open <i>My account</i> to review your settings.</li></ol></div>'
            . '<p><a href="./">Open CDIMS</a></p>');
    } catch (Throwable $e) {
        $error = '<div class="err">' . $h($e instanceof InvalidArgumentException ? $e->getMessage() : 'Installation failed: ' . $e->getMessage()) . '</div>';
    }
}

$rows = '';
foreach ($checks as [$label, $ok, $detail]) {
    $rows .= '<tr><td>' . $h($label) . '<br><small>' . $h($detail) . '</small></td><td class="' . ($ok ? 'ok' : 'bad') . '" style="text-align:right;white-space:nowrap">' . ($ok ? 'OK' : (str_starts_with($label, 'Production') ? 'Check' : 'Fix')) . '</td></tr>';
}
page('Install CDIMS', $error . '<h2>Server checks</h2><table>' . $rows . '</table>'
    . ($ready ? '<h2>First administrator</h2><form method="post"><input type="hidden" name="csrf" value="' . $h($csrf) . '"><input type="hidden" name="install" value="1">'
        . '<label for="n">Full name</label><input id="n" name="full_name" type="text" required value="' . $h($val['full_name']) . '">'
        . '<label for="e">Email</label><input id="e" name="email" type="email" required value="' . $h($val['email']) . '">'
        . '<label for="u">Username</label><input id="u" name="username" type="text" required value="' . $h($val['username']) . '">'
        . '<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="new-password" required><small>At least 10 characters, three of lower case, upper case, numbers and symbols, not common, and not containing your name or username.</small>'
        . '<label for="c">Confirm password</label><input id="c" name="confirm" type="password" autocomplete="new-password" required>'
        . '<label><input type="checkbox" name="demo" value="1"> Also load two years of generated <b>demonstration</b> readings (leave unticked for a real installation)</label>'
        . '<button>Install</button></form>'
        : '<p class="bad">Fix the items marked "Fix", then reload this page.</p>'));
