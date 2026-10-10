<?php
/**
 * Scheduled preparation of alerts and bulletins. Run from cron (cPanel: Cron Jobs), for example every morning:
 *
 *   /usr/local/bin/php /home/ACCOUNT/cdims-core/cron/generate.php
 *
 * It prepares DRAFT alerts (never publishes them), a daily bulletin draft, and on Mondays a weekly summary draft.
 * A forecaster then reviews and publishes them in the app. To publish bulletins automatically (alerts never are),
 * set CDIMS_AUTO_PUBLISH_BULLETINS=1 in the environment file.
 *
 * It also tidies expired rate-limit counters and stale sessions.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../config/config.php';
require __DIR__ . '/../includes/classes/Audit.php';
require __DIR__ . '/../includes/classes/Weather.php';
require __DIR__ . '/../includes/classes/Warnings.php';
require __DIR__ . '/../includes/classes/Bulletins.php';
require __DIR__ . '/../includes/classes/SystemInfo.php';

$log = fn(string $m) => print('[' . date('Y-m-d H:i:s') . "] $m\n");
$exit = 0;

try {
    $res = (new Warnings())->generate(null);
    $log('Alert check: ' . $res['checked'] . ' finding(s), ' . count($res['created']) . ' new draft(s), ' . $res['skipped'] . ' already existed.');
    foreach ($res['notes'] as $n) {
        $log("  note: $n");
    }
    Audit::log(null, 'check_rules', 'alert', null, ['created' => count($res['created']), 'via' => 'cron']);
} catch (Throwable $e) {
    $log('Alert check failed: ' . $e->getMessage());
    $exit = 1;
}

$kinds = ['daily'];
if (date('N') === '1') { // Monday
    $kinds[] = 'weekly';
}
$bulletins = new Bulletins();
foreach ($kinds as $kind) {
    try {
        $r = $bulletins->generate($kind, null, null);
        $log(ucfirst($kind) . " bulletin draft ready: {$r['title']}" . ($r['replaced'] ? ' (replaced an earlier draft)' : ''));
        if (cdims_env_bool('CDIMS_AUTO_PUBLISH_BULLETINS')) {
            $bulletins->publish($r['id'], 0);
            $log('  published automatically.');
        }
        Audit::log(null, 'generate', 'bulletin', $r['id'], ['kind' => $kind, 'via' => 'cron']);
    } catch (InvalidArgumentException $e) {
        $log(ucfirst($kind) . ' bulletin skipped: ' . $e->getMessage()); // e.g. already published for that day
    } catch (Throwable $e) {
        $log(ucfirst($kind) . ' bulletin failed: ' . $e->getMessage());
        $exit = 1;
    }
}

$db = getDBConnection();
$db->exec('DELETE FROM rate_limits WHERE window_start < ' . (time() - 86400));
$db->prepare('DELETE FROM user_sessions WHERE last_seen < (NOW() - INTERVAL ? SECOND)')->execute([SESSION_MAX_SECONDS]);
$log('Housekeeping done.');
SystemInfo::heartbeat($exit === 0, 'Alerts and bulletins checked, housekeeping done.');
exit($exit);
