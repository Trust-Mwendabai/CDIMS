<?php
/**
 * User: authentication, registration and administration.
 */
class User
{
    public const ROLES = ['admin', 'analyst', 'stakeholder', 'public'];
    private const LOCKOUT_SECONDS = 900; // window for counting failed sign-ins (15 minutes)
    private const IP_FAILURES = 20;      // failed attempts per address per window (generous: offices share one address)
    private const ID_FAILURES = 8;       // failed attempts per username/email per window
    private const ACCOUNT_FAILURES = 5;  // consecutive failures that lock the real account

    /** Role => permissions. The API enforces these; the UI mirrors them from the user object. */
    public const PERMISSIONS = [
        'admin'       => ['view_dashboard', 'view_analysis', 'view_readings', 'export', 'view_reports', 'write_readings', 'manage_stations', 'manage_bulletins', 'manage_users', 'view_audit'],
        'analyst'     => ['view_dashboard', 'view_analysis', 'view_readings', 'export', 'view_reports', 'write_readings', 'manage_stations', 'manage_bulletins'],
        'stakeholder' => ['view_dashboard', 'view_analysis', 'view_readings', 'export', 'view_reports'],
        'public'      => ['view_dashboard', 'view_analysis'],
    ];

    public const START_PAGES = ['/app', '/app/analysis', '/app/data', '/app/stations', '/app/reports'];
    public const AVATARS = ['ocean', 'sunset', 'forest', 'violet', 'rose', 'amber', 'slate', 'teal'];
    public const DEFAULT_PREFERENCES = ['theme' => 'system', 'start_page' => '/app', 'default_station' => null, 'sidebar' => 'expanded', 'avatar' => 'ocean'];

    private PDO $db;

    public function __construct()
    {
        $this->db = getDBConnection();
    }

    private static function preferencesOf(array $u): array
    {
        $saved = json_decode((string) ($u['preferences'] ?? ''), true);
        return array_merge(self::DEFAULT_PREFERENCES, is_array($saved) ? $saved : []);
    }

    public function updateProfile(int $id, string $fullName, string $email): void
    {
        $fullName = trim($fullName);
        $email = trim($email);
        if ($fullName === '' || mb_strlen($fullName) > 100) {
            throw new InvalidArgumentException('Enter your full name (up to 100 characters).');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 100) {
            throw new InvalidArgumentException('Enter a valid email address.');
        }
        $stmt = $this->db->prepare('SELECT 1 FROM users WHERE email = ? AND user_id <> ?');
        $stmt->execute([$email, $id]);
        if ($stmt->fetchColumn()) {
            throw new InvalidArgumentException('That email is already used by another account.');
        }
        $this->db->prepare('UPDATE users SET full_name = ?, email = ? WHERE user_id = ?')->execute([$fullName, $email, $id]);
    }

    /** Validate and store display preferences (theme, start page, default dashboard station, sidebar). */
    public function updatePreferences(int $id, array $in): array
    {
        $prefs = self::DEFAULT_PREFERENCES;
        $theme = $in['theme'] ?? 'system';
        $start = $in['start_page'] ?? '/app';
        $sidebar = $in['sidebar'] ?? 'expanded';
        if (!in_array($theme, ['system', 'light', 'dark'], true)) {
            throw new InvalidArgumentException('Unknown theme.');
        }
        if (!in_array($start, self::START_PAGES, true)) {
            throw new InvalidArgumentException('Unknown start page.');
        }
        if (!in_array($sidebar, ['expanded', 'collapsed'], true)) {
            throw new InvalidArgumentException('Unknown sidebar setting.');
        }
        $station = $in['default_station'] ?? null;
        if ($station !== null && $station !== '') {
            $stmt = $this->db->prepare('SELECT 1 FROM stations WHERE id = ?');
            $stmt->execute([(int) $station]);
            if (!$stmt->fetchColumn()) {
                throw new InvalidArgumentException('Unknown station.');
            }
            $station = (int) $station;
        } else {
            $station = null;
        }
        $avatar = $in['avatar'] ?? 'ocean';
        if (!in_array($avatar, self::AVATARS, true)) {
            throw new InvalidArgumentException('Unknown avatar colour.');
        }
        $prefs = ['theme' => $theme, 'start_page' => $start, 'default_station' => $station, 'sidebar' => $sidebar, 'avatar' => $avatar];
        $this->db->prepare('UPDATE users SET preferences = ? WHERE user_id = ?')->execute([json_encode($prefs), $id]);
        return $prefs;
    }

    public static function roleCan(string $role, string $permission): bool
    {
        return in_array($permission, self::PERMISSIONS[$role] ?? [], true);
    }

    /** Public view of a user row. */
    private static function present(array $u): array
    {
        return [
            'permissions' => self::PERMISSIONS[$u['role']] ?? [],
            'preferences' => self::preferencesOf($u),
            'id'         => (int) $u['user_id'],
            'username'   => $u['username'],
            'email'      => $u['email'],
            'full_name'  => $u['full_name'],
            'role'       => $u['role'],
            'is_active'  => (bool) $u['is_active'],
            'last_login' => $u['last_login'],
            'created_at' => $u['created_at'],
            'locked_until' => (!empty($u['locked_until']) && strtotime($u['locked_until']) > time()) ? $u['locked_until'] : null,
            'password_changed_at' => $u['password_changed_at'] ?? null,
        ];
    }

    private static function sessionKey(): string
    {
        return hash('sha256', session_id()); // only a hash is stored, so a database leak cannot be replayed as a cookie
    }

    private function forgetSession(): void
    {
        unset($_SESSION['user_id'], $_SESSION['csrf_token']);
    }

    /**
     * The signed-in user, or null. A session is valid only while its row exists, it has not been idle for too long
     * (SESSION_IDLE_SECONDS) and it is not older than the absolute limit (SESSION_MAX_SECONDS).
     * Pass $touch = false for background requests (polling), so they do not keep an unattended session alive.
     */
    public function current(bool $touch = true): ?array
    {
        if (empty($_SESSION['user_id'])) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT user_id, created_at, last_seen FROM user_sessions WHERE id = ?');
        $stmt->execute([self::sessionKey()]);
        $s = $stmt->fetch();
        if (!$s || (int) $s['user_id'] !== (int) $_SESSION['user_id']) {
            $this->forgetSession(); // revoked, expired and cleaned up, or never issued
            return null;
        }
        $now = time();
        $created = strtotime($s['created_at']);
        $seen = strtotime($s['last_seen']);
        if ($now - $seen > SESSION_IDLE_SECONDS || $now - $created > SESSION_MAX_SECONDS) {
            $this->db->prepare('DELETE FROM user_sessions WHERE id = ?')->execute([self::sessionKey()]);
            $this->forgetSession();
            return null;
        }
        $stmt = $this->db->prepare('SELECT * FROM users WHERE user_id = ? AND is_active = 1');
        $stmt->execute([$_SESSION['user_id']]);
        $row = $stmt->fetch();
        if (!$row) {
            $this->db->prepare('DELETE FROM user_sessions WHERE user_id = ?')->execute([$_SESSION['user_id']]);
            $this->forgetSession();
            return null;
        }
        if ($touch && $now - $seen >= 20) { // at most one write per 20 seconds
            $this->db->prepare('UPDATE user_sessions SET last_seen = NOW() WHERE id = ?')->execute([self::sessionKey()]);
            $seen = $now;
        }
        $user = self::present($row);
        $user['session'] = [
            'idle_seconds' => SESSION_IDLE_SECONDS,
            'expires_in' => max(0, min($created + SESSION_MAX_SECONDS, $seen + SESSION_IDLE_SECONDS) - $now),
        ];
        return $user;
    }

    /** Summarise a User-Agent string for display ("Edge on Windows"). */
    private static function describeAgent(?string $ua): string
    {
        $ua = (string) $ua;
        $browser = match (true) {
            (bool) preg_match('/Edg\//', $ua) => 'Edge', (bool) preg_match('/OPR\/|Opera/', $ua) => 'Opera',
            (bool) preg_match('/Firefox\//', $ua) => 'Firefox', (bool) preg_match('/Chrome\//', $ua) => 'Chrome',
            (bool) preg_match('/Safari\//', $ua) => 'Safari', default => 'Browser',
        };
        $os = match (true) {
            (bool) preg_match('/Windows/', $ua) => 'Windows', (bool) preg_match('/Android/', $ua) => 'Android',
            (bool) preg_match('/iPhone|iPad|iOS/', $ua) => 'iOS', (bool) preg_match('/Mac OS X|Macintosh/', $ua) => 'macOS',
            (bool) preg_match('/Linux/', $ua) => 'Linux', default => 'unknown device',
        };
        return "$browser on $os";
    }

    /** Active sessions of one user, newest activity first. The handle identifies a session for revoking. */
    public function sessions(int $userId): array
    {
        $this->db->prepare('DELETE FROM user_sessions WHERE last_seen < (NOW() - INTERVAL ? SECOND)')->execute([SESSION_IDLE_SECONDS]);
        $stmt = $this->db->prepare('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY last_seen DESC');
        $stmt->execute([$userId]);
        $mine = self::sessionKey();
        return array_map(fn($r) => [
            'handle' => substr($r['id'], 0, 16),
            'device' => self::describeAgent($r['user_agent']),
            'ip' => $r['ip_address'],
            'created_at' => $r['created_at'],
            'last_seen' => $r['last_seen'],
            'current' => $r['id'] === $mine,
        ], $stmt->fetchAll());
    }

    /** End one of the user's other sessions. The current session cannot be revoked this way (use sign out). */
    public function revokeSession(int $userId, string $handle): bool
    {
        if (!preg_match('/^[a-f0-9]{16}$/', $handle)) {
            return false;
        }
        $stmt = $this->db->prepare('DELETE FROM user_sessions WHERE user_id = ? AND id LIKE ? AND id <> ?');
        $stmt->execute([$userId, $handle . '%', self::sessionKey()]);
        return $stmt->rowCount() > 0;
    }

    /** End every session of a user. Pass keepCurrent to leave the caller's own session signed in. */
    public function signOutEverywhere(int $id, bool $keepCurrent = true): void
    {
        if ($keepCurrent) {
            $this->db->prepare('DELETE FROM user_sessions WHERE user_id = ? AND id <> ?')->execute([$id, self::sessionKey()]);
        } else {
            $this->db->prepare('DELETE FROM user_sessions WHERE user_id = ?')->execute([$id]);
        }
    }

    private static ?string $dummyHash = null;

    /**
     * Sign in. Defences, in order: per-address and per-identifier rate limits (failures only), a per-account lock that
     * lengthens with repeat offences, and a dummy password check for unknown users so timing does not reveal who exists.
     *
     * @throws RateLimitExceeded when too many attempts have failed
     */
    public function login(string $identifier, string $password): array
    {
        $ip = clientIp();
        $idKey = strtolower(trim($identifier));
        foreach ([['login_ip', $ip, self::IP_FAILURES], ['login_id', $idKey, self::ID_FAILURES]] as [$bucket, $subject, $limit]) {
            $wait = RateLimiter::blocked($bucket, $subject, $limit, self::LOCKOUT_SECONDS);
            if ($wait > 0) {
                throw new RateLimitExceeded('Too many sign-in attempts. Please wait ' . RateLimiter::waitText($wait) . ' and try again.', $wait);
            }
        }

        $stmt = $this->db->prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1 LIMIT 1');
        $stmt->execute([$identifier, $identifier]);
        $user = $stmt->fetch();

        if ($user && $user['locked_until'] && strtotime($user['locked_until']) > time()) {
            $wait = strtotime($user['locked_until']) - time();
            throw new RateLimitExceeded('This account is temporarily locked after repeated failed sign-ins. Please wait ' . RateLimiter::waitText($wait) . ' or ask an administrator.', $wait);
        }

        self::$dummyHash ??= password_hash(bin2hex(random_bytes(8)), PASSWORD_BCRYPT);
        $ok = password_verify($password, $user['password_hash'] ?? self::$dummyHash) && $user;

        if (!$ok) {
            RateLimiter::failure('login_ip', $ip, self::LOCKOUT_SECONDS);
            RateLimiter::failure('login_id', $idKey, self::LOCKOUT_SECONDS);
            if ($user) {
                $fails = (int) $user['failed_logins'] + 1;
                if ($fails >= self::ACCOUNT_FAILURES) {
                    $lockMinutes = min(1440, 15 * (2 ** (int) $user['lock_count'])); // 15 min, 30, 60, ... up to a day
                    $this->db->prepare('UPDATE users SET failed_logins = 0, lock_count = lock_count + 1, locked_until = (NOW() + INTERVAL ? MINUTE) WHERE user_id = ?')
                        ->execute([$lockMinutes, $user['user_id']]);
                } else {
                    $this->db->prepare('UPDATE users SET failed_logins = ? WHERE user_id = ?')->execute([$fails, $user['user_id']]);
                }
            }
            throw new RuntimeException('Invalid username/email or password.', 401);
        }

        RateLimiter::clear('login_id', $idKey);
        $this->db->prepare('UPDATE users SET last_login = NOW(), failed_logins = 0, lock_count = 0, locked_until = NULL WHERE user_id = ?')
            ->execute([$user['user_id']]);
        if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT)) {
            $this->db->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?')->execute([password_hash($password, PASSWORD_BCRYPT), $user['user_id']]);
        }

        session_regenerate_id(true); // a new id on privilege change defeats session fixation
        $_SESSION['user_id'] = (int) $user['user_id'];
        unset($_SESSION['csrf_token']);
        $this->db->prepare('INSERT INTO user_sessions (id, user_id, ip_address, user_agent, created_at, last_seen) VALUES (?,?,?,?,NOW(),NOW())')
            ->execute([self::sessionKey(), $user['user_id'], $ip, mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
        // keep at most the 10 most recent sessions per user
        $this->db->prepare(
            'DELETE FROM user_sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM user_sessions WHERE user_id = ? ORDER BY last_seen DESC LIMIT 10) keep)'
        )->execute([$user['user_id'], $user['user_id']]);

        return self::present($user);
    }

    public function logout(): void
    {
        if (!empty($_SESSION['user_id'])) {
            $this->db->prepare('DELETE FROM user_sessions WHERE id = ?')->execute([self::sessionKey()]);
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    /** Create an account with a chosen role (administrators only; the caller checks permission). */
    public function create(string $username, string $email, string $password, string $fullName, string $role): array
    {
        if (!in_array($role, self::ROLES, true)) {
            throw new InvalidArgumentException('Unknown role.');
        }
        $user = $this->register($username, $email, $password, $fullName);
        if ($role !== 'public') {
            $this->db->prepare('UPDATE users SET role = ? WHERE user_id = ?')->execute([$role, $user['id']]);
            $user['role'] = $role;
            $user['permissions'] = self::PERMISSIONS[$role];
        }
        return $user;
    }

    public function register(string $username, string $email, string $password, string $fullName): array
    {
        $username = trim($username);
        $email = trim($email);
        $fullName = trim($fullName);

        if ($username === '' || $email === '' || $fullName === '' || $password === '') {
            throw new InvalidArgumentException('All fields are required.');
        }
        if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)) {
            throw new InvalidArgumentException('Username must be 3-50 characters: letters, numbers, . _ -');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid email address.');
        }
        PasswordPolicy::assert($password, ['username' => $username, 'email' => $email, 'full_name' => $fullName]);

        $stmt = $this->db->prepare('SELECT 1 FROM users WHERE username = ? OR email = ?');
        $stmt->execute([$username, $email]);
        if ($stmt->fetchColumn()) {
            throw new InvalidArgumentException('Username or email is already registered.');
        }

        $this->db->prepare('INSERT INTO users (username, email, password_hash, full_name) VALUES (?,?,?,?)')
            ->execute([$username, $email, password_hash($password, PASSWORD_BCRYPT), $fullName]);

        $stmt = $this->db->prepare('SELECT * FROM users WHERE user_id = ?');
        $stmt->execute([$this->db->lastInsertId()]);
        return self::present($stmt->fetch());
    }

    public function changePassword(int $id, string $current, string $new): void
    {
        $stmt = $this->db->prepare('SELECT username, email, full_name, password_hash FROM users WHERE user_id = ?');
        $stmt->execute([$id]);
        $u = $stmt->fetch();
        if (!$u || !password_verify($current, $u['password_hash'])) {
            throw new InvalidArgumentException('Current password is incorrect.');
        }
        if (hash_equals($current, $new)) {
            throw new InvalidArgumentException('Choose a password different from the current one.');
        }
        PasswordPolicy::assert($new, $u);
        $this->db->prepare('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE user_id = ?')
            ->execute([password_hash($new, PASSWORD_BCRYPT), $id]);
        $this->signOutEverywhere($id); // other devices must sign in again; this one stays signed in
    }

    /** Administrator sets a new password for another user (e.g. a forgotten password). */
    public function resetPassword(int $id, string $new): string
    {
        $stmt = $this->db->prepare('SELECT username, email, full_name FROM users WHERE user_id = ?');
        $stmt->execute([$id]);
        $u = $stmt->fetch();
        if (!$u) {
            throw new InvalidArgumentException('User not found.');
        }
        PasswordPolicy::assert($new, $u);
        $this->db->prepare('UPDATE users SET password_hash = ?, password_changed_at = NOW(), failed_logins = 0, lock_count = 0, locked_until = NULL WHERE user_id = ?')
            ->execute([password_hash($new, PASSWORD_BCRYPT), $id]);
        $this->signOutEverywhere($id, false); // the user's existing sessions end; the admin's session is unaffected
        return $u['username'];
    }

    public function all(): array
    {
        $rows = $this->db->query('SELECT * FROM users ORDER BY created_at DESC')->fetchAll();
        return array_map([self::class, 'present'], $rows);
    }

    public function update(int $id, string $role, bool $active, int $actingId): void
    {
        if (!in_array($role, self::ROLES, true)) {
            throw new InvalidArgumentException('Unknown role.');
        }
        if ($id === $actingId && ($role !== 'admin' || !$active)) {
            throw new InvalidArgumentException('You cannot demote or deactivate your own account.');
        }
        $stmt = $this->db->prepare('SELECT role, is_active FROM users WHERE user_id = ?');
        $stmt->execute([$id]);
        $before = $stmt->fetch();
        $this->db->prepare('UPDATE users SET role = ?, is_active = ? WHERE user_id = ?')
            ->execute([$role, (int) $active, $id]);
        // A change of role or access takes effect immediately: the person must sign in again
        if ($before && ($before['role'] !== $role || (bool) $before['is_active'] !== $active) && $id !== $actingId) {
            $this->db->prepare('DELETE FROM user_sessions WHERE user_id = ?')->execute([$id]);
        }
    }

    /** Unlock an account that was locked by repeated failed sign-ins. */
    public function unlock(int $id): void
    {
        $this->db->prepare('UPDATE users SET failed_logins = 0, lock_count = 0, locked_until = NULL WHERE user_id = ?')->execute([$id]);
    }
}
