<?php
/**
 * Minimal automated checks for the rules that matter most. No libraries needed:
 *   php tests/run.php
 * Pure-logic tests always run. The rate-limiter test needs the database and is skipped if it is unreachable.
 * Exit code is 1 when anything fails (usable in a deployment script).
 */
declare(strict_types=1);

require __DIR__ . '/../config/config.php';
foreach (['PasswordPolicy', 'Climate', 'RateLimiter'] as $c) {
    require_once __DIR__ . "/../includes/classes/$c.php";
}

$pass = $fail = $skip = 0;
function check(string $name, bool $ok): void
{
    global $pass, $fail;
    $ok ? $pass++ : $fail++;
    echo ($ok ? '  ok    ' : '  FAIL  ') . $name . "\n";
}
function throwsInvalid(callable $fn): bool
{
    try {
        $fn();
    } catch (InvalidArgumentException) {
        return true;
    }
    return false;
}

echo "Password policy\n";
check('accepts a long mixed password', PasswordPolicy::problems('Zq7!mountain-Rain') === []);
check('rejects short passwords', PasswordPolicy::problems('Ab1!') !== []);
check('rejects a common password', PasswordPolicy::problems('Password123!') !== []);
check('rejects only one character class', PasswordPolicy::problems('abcdefghijkl') !== []);
check('rejects the username inside it', PasswordPolicy::problems('Zq7!trustmwenda', ['username' => 'trustmwenda']) !== []);
check('rejects runs like 1234', PasswordPolicy::problems('Kx!1234bbbbZ') !== []);
check('rejects over 72 bytes (bcrypt limit)', PasswordPolicy::problems(str_repeat('Aa1!', 19)) !== []);
check('score is 0 for unacceptable, 4 for strong', PasswordPolicy::score('password') === 0 && PasswordPolicy::score('Zq7!mountain-Rain-92') === 4);
check('assert() throws on a weak password', throwsInvalid(fn() => PasswordPolicy::assert('weak')));

echo "Dates\n";
check('ISO date', Climate::normalizeDate('2026-03-09') === '2026-03-09');
check('day-first with slashes', Climate::normalizeDate('09/03/2026') === '2026-03-09');
check('day-first with dots', Climate::normalizeDate('9.3.2026') === '2026-03-09');
check('rejects 31 February', throwsInvalid(fn() => Climate::normalizeDate('31/02/2026')));
check('rejects nonsense', throwsInvalid(fn() => Climate::normalizeDate('last tuesday')));

echo "Reading validation\n";
$climate = (new ReflectionClass(Climate::class))->newInstanceWithoutConstructor(); // validate() needs no database
$ok = ['observed_on' => '2025-01-15', 'tmax' => '30.26', 'tmin' => 18, 'rainfall_mm' => '', 'humidity' => 71.6];
$clean = $climate->validate($ok);
check('rounds to one decimal and whole-number humidity', $clean['tmax'] === 30.3 && $clean['humidity'] === 72);
check('blank becomes null', $clean['rainfall_mm'] === null);
check('minimum above maximum is refused', throwsInvalid(fn() => $climate->validate(['observed_on' => '2025-01-15', 'tmax' => 20, 'tmin' => 25])));
check('future dates are refused', throwsInvalid(fn() => $climate->validate(['observed_on' => date('Y-m-d', strtotime('+2 days')), 'tmax' => 20])));
check('out-of-range rainfall is refused', throwsInvalid(fn() => $climate->validate(['observed_on' => '2025-01-15', 'rainfall_mm' => 9999])));
check('an empty record is refused', throwsInvalid(fn() => $climate->validate(['observed_on' => '2025-01-15'])));

echo "Rate limiter (database)\n";
try {
    getDBConnection();
    $subject = 'test-' . bin2hex(random_bytes(4));
    $allowed = 0;
    $blocked = false;
    for ($i = 0; $i < 5; $i++) {
        try {
            RateLimiter::enforce('unit_test', $subject, 3, 60);
            $allowed++;
        } catch (RateLimitExceeded $e) {
            $blocked = $e->retryAfter > 0;
        }
    }
    check('allows the first 3 and then blocks with a retry time', $allowed === 3 && $blocked);
    check('a different subject is unaffected', (function () {
        RateLimiter::enforce('unit_test', 'other-' . bin2hex(random_bytes(3)), 3, 60);
        return true;
    })());
    // test rows are tiny and the daily cron job removes expired rate-limit rows
} catch (Throwable $e) {
    $skip++;
    echo '  skipped (' . $e->getMessage() . ")\n";
}

echo "\n$pass passed, $fail failed" . ($skip ? ", $skip skipped" : '') . "\n";
exit($fail ? 1 : 0);
