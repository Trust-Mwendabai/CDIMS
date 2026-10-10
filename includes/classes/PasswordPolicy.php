<?php
/**
 * Password rules, applied identically wherever a password is set (register, change, admin create, admin reset).
 * The browser shows the same checks live, but only this class is authoritative.
 *
 * Rules: at least 10 characters; at least three of lower case, upper case, number and symbol; not a very common
 * password; does not contain the person's username, name or email; no long repeats or runs (aaaa, 12345);
 * at most 72 bytes, because bcrypt silently ignores anything longer.
 */
class PasswordPolicy
{
    public const MIN_LENGTH = 10;
    public const MAX_BYTES = 72;

    private const COMMON = [
        'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein', 'welcome', 'welcome1', 'welcome123',
        'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'iloveyou', 'admin', 'admin123', 'administrator', 'root', 'toor',
        'abc123', 'abcd1234', '123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '123123', '654321',
        'monkey', 'dragon', 'football', 'baseball', 'master', 'sunshine', 'princess', 'shadow', 'superman', 'batman', 'trustno1',
        'zambia', 'zambia123', 'lusaka', 'lusaka123', 'cdims', 'cdims123', 'zmd', 'zmd123', 'weather', 'climate', 'meteo', 'rainfall',
        'changeme', 'changeit', 'default', 'secret', 'test', 'test123', 'testing', 'guest', 'user', 'login', 'access', 'hello123',
    ];

    /** The sensitive words a password must not contain. */
    private static function forbidden(array $ctx): array
    {
        $words = [];
        foreach (['username', 'full_name', 'email'] as $k) {
            $v = strtolower((string) ($ctx[$k] ?? ''));
            if ($k === 'email') {
                $v = explode('@', $v)[0];
            }
            foreach (preg_split('/[^a-z0-9]+/', $v) ?: [] as $part) {
                if (strlen($part) >= 4) {
                    $words[] = $part;
                }
            }
        }
        return array_unique($words);
    }

    private static function classes(string $pw): int
    {
        return (int) preg_match('/[a-z]/', $pw) + (int) preg_match('/[A-Z]/', $pw) + (int) preg_match('/\d/', $pw) + (int) preg_match('/[^A-Za-z0-9]/', $pw);
    }

    private static function isCommon(string $pw): bool
    {
        $lower = strtolower($pw);
        $stripped = rtrim($lower, '0123456789!@#$%^&*._-');          // "password2024!" -> "password"
        $deleet = strtr($lower, ['0' => 'o', '1' => 'l', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);
        return in_array($lower, self::COMMON, true) || in_array($stripped, self::COMMON, true) || in_array(rtrim($deleet, 'l!'), self::COMMON, true);
    }

    private static function hasRunOrRepeat(string $pw): bool
    {
        if (preg_match('/(.)\1{3,}/', $pw)) { // aaaa
            return true;
        }
        $lower = strtolower($pw);
        for ($i = 0; $i + 4 <= strlen($lower); $i++) { // 1234, abcd, dcba
            $a = ord($lower[$i]);
            $step = ord($lower[$i + 1]) - $a;
            if (abs($step) === 1 && ord($lower[$i + 2]) - ord($lower[$i + 1]) === $step && ord($lower[$i + 3]) - ord($lower[$i + 2]) === $step) {
                return true;
            }
        }
        return false;
    }

    /** @return string[] reasons the password is not acceptable (empty when it is fine) */
    public static function problems(string $pw, array $ctx = []): array
    {
        $out = [];
        if (strlen($pw) > self::MAX_BYTES) {
            return ['Use at most ' . self::MAX_BYTES . ' characters.'];
        }
        if (mb_strlen($pw) < self::MIN_LENGTH) {
            $out[] = 'Use at least ' . self::MIN_LENGTH . ' characters.';
        }
        if (self::classes($pw) < 3) {
            $out[] = 'Mix at least three of: lower case, upper case, numbers and symbols.';
        }
        if (self::isCommon($pw)) {
            $out[] = 'That password is too common. Choose something less guessable.';
        }
        foreach (self::forbidden($ctx) as $w) {
            if (str_contains(strtolower($pw), $w)) {
                $out[] = 'The password must not contain your name, username or email.';
                break;
            }
        }
        if (self::hasRunOrRepeat($pw)) {
            $out[] = 'Avoid repeated characters or runs such as aaaa or 1234.';
        }
        return $out;
    }

    /** 0 (unacceptable) to 4 (strong). */
    public static function score(string $pw, array $ctx = []): int
    {
        if ($pw === '' || strlen($pw) > self::MAX_BYTES || self::isCommon($pw)) {
            return 0;
        }
        $len = mb_strlen($pw);
        $classes = self::classes($pw);
        $s = ($len >= self::MIN_LENGTH ? 1 : 0) + ($classes >= 3 ? 1 : 0) + (($len >= 14 || $classes === 4) ? 1 : 0);
        $clean = !self::problems($pw, $ctx);
        return $clean ? min(4, $s + 1) : min(2, $s);
    }

    /** Throw InvalidArgumentException when the password breaks the rules. */
    public static function assert(string $pw, array $ctx = []): void
    {
        $p = self::problems($pw, $ctx);
        if ($p) {
            throw new InvalidArgumentException(implode(' ', $p));
        }
    }
}
