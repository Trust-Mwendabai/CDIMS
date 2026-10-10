import { Check, Circle } from 'lucide-react';

// Mirrors PasswordPolicy.php so people see the same verdict while typing. The server remains the authority.
export const MIN_LENGTH = 10;
const MAX_BYTES = 72;
const LEVELS = ['Not acceptable', 'Weak', 'Fair', 'Good', 'Strong'];

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein', 'welcome', 'welcome1', 'welcome123',
  'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'iloveyou', 'admin', 'admin123', 'administrator', 'root', 'toor',
  'abc123', 'abcd1234', '123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '123123', '654321',
  'monkey', 'dragon', 'football', 'baseball', 'master', 'sunshine', 'princess', 'shadow', 'superman', 'batman', 'trustno1',
  'zambia', 'zambia123', 'lusaka', 'lusaka123', 'cdims', 'cdims123', 'zmd', 'zmd123', 'weather', 'climate', 'meteo', 'rainfall',
  'changeme', 'changeit', 'default', 'secret', 'test', 'test123', 'testing', 'guest', 'user', 'login', 'access', 'hello123',
]);

const classes = (pw) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;

function isCommon(pw) {
  const lower = pw.toLowerCase();
  const stripped = lower.replace(/[0-9!@#$%^&*._-]+$/, '');
  const deleet = lower.replace(/[01345@$7]/g, (c) => ({ 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' }[c])).replace(/[l!]+$/, '');
  return COMMON.has(lower) || COMMON.has(stripped) || COMMON.has(deleet);
}

function forbiddenWords(ctx) {
  const words = new Set();
  ['username', 'full_name', 'email'].forEach((k) => {
    let v = String(ctx?.[k] || '').toLowerCase();
    if (k === 'email') v = v.split('@')[0];
    v.split(/[^a-z0-9]+/).forEach((p) => { if (p.length >= 4) words.add(p); });
  });
  return [...words];
}

function hasRunOrRepeat(pw) {
  if (/(.)\1{3,}/.test(pw)) return true;
  const s = pw.toLowerCase();
  for (let i = 0; i + 4 <= s.length; i++) {
    const step = s.charCodeAt(i + 1) - s.charCodeAt(i);
    if (Math.abs(step) === 1 && s.charCodeAt(i + 2) - s.charCodeAt(i + 1) === step && s.charCodeAt(i + 3) - s.charCodeAt(i + 2) === step) return true;
  }
  return false;
}

/** Rules, problems and a 0-4 score for a password. `ctx` is { username, email, full_name } of the account. */
export function analyse(pw, ctx = {}) {
  const bytes = new TextEncoder().encode(pw).length;
  const lengthOk = [...pw].length >= MIN_LENGTH;
  const classCount = classes(pw);
  const common = isCommon(pw);
  const personal = forbiddenWords(ctx).some((w) => pw.toLowerCase().includes(w));
  const pattern = hasRunOrRepeat(pw);
  const rules = [
    { label: `At least ${MIN_LENGTH} characters`, ok: lengthOk },
    { label: `Three of: lower case, upper case, number, symbol (${classCount} of 4)`, ok: classCount >= 3 },
    { label: 'Not a common password', ok: !common },
    { label: 'Does not contain your name, username or email', ok: !personal },
    { label: 'No repeats or runs like aaaa or 1234', ok: !pattern },
  ];
  let score = 0;
  if (pw && bytes <= MAX_BYTES && !common) {
    const base = (lengthOk ? 1 : 0) + (classCount >= 3 ? 1 : 0) + (([...pw].length >= 14 || classCount === 4) ? 1 : 0);
    score = rules.every((r) => r.ok) ? Math.min(4, base + 1) : Math.min(2, base);
  }
  return { score, rules, ok: rules.every((r) => r.ok) && bytes <= MAX_BYTES, tooLong: bytes > MAX_BYTES };
}

/** Back-compatible helper: 0-4 score. */
export const strength = (pw, ctx) => (pw ? analyse(pw, ctx).score : 0);

/** Strength bar with an optional live checklist of the rules. */
export default function StrengthMeter({ password, context, checklist = false }) {
  if (!password) return null;
  const a = analyse(password, context);
  return (
    <>
      <div className="meter" aria-live="polite">
        <div className="meter-track"><div className={`meter-fill lvl-${a.score}`} style={{ width: `${Math.max(1, a.score) * 25}%` }} /></div>
        <span className={`meter-label lvl-${a.score}`}>{LEVELS[a.score]}</span>
      </div>
      {a.tooLong && <small className="hint bad">Use at most {MAX_BYTES} characters.</small>}
      {checklist && (
        <ul className="checklist">
          {a.rules.map((r) => (
            <li key={r.label} className={r.ok ? 'ok' : ''}>{r.ok ? <Check size={13} /> : <Circle size={13} />} {r.label}</li>
          ))}
        </ul>
      )}
    </>
  );
}
