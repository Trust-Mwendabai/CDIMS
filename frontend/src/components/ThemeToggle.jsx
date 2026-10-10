import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { applyThemePref, currentTheme } from '../theme';

/** Light/dark switch. Signed-in users also save the choice to their profile so it follows them. */
export default function ThemeToggle({ className = '' }) {
  const { user, updateUser } = useAuth();
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const on = (e) => setTheme(e.detail);
    window.addEventListener('cdims-theme', on);
    return () => window.removeEventListener('cdims-theme', on);
  }, []);

  const toggle = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyThemePref(next);
    if (user) {
      try {
        const d = await api.savePreferences({ ...user.preferences, theme: next });
        updateUser(d.user);
      } catch { /* the local choice still applies */ }
    }
  };

  const dark = theme === 'dark';
  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
