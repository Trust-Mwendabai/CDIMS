import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList, CloudSun, Database, FileText, FileUp, LayoutDashboard, LifeBuoy, LineChart, LogOut, Map, MapPin, Megaphone, Menu,
  PanelLeftClose, PanelLeftOpen, ScrollText, Server, UserCircle, Users, X,
} from 'lucide-react';
import { useAuth } from '../auth';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';
import { InstallButton, SyncStatus } from './pwa';
import SessionGuard from './SessionGuard';
import { GuardedLink, UnsavedProvider } from './unsaved';

const COLLAPSE_KEY = 'cdims-sidebar-collapsed';
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

/** A choice made with the toggle wins; otherwise use the saved profile preference. */
function readCollapsed(prefs) {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    if (v !== null) return v === '1';
  } catch { /* storage unavailable */ }
  return prefs?.sidebar === 'collapsed';
}

function Shell({ children }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);          // mobile drawer
  const [collapsed, setCollapsed] = useState(() => readCollapsed(user.preferences)); // desktop rail

  // Pick up changes saved from the profile page
  useEffect(() => {
    const sync = () => setCollapsed(readCollapsed(user.preferences));
    window.addEventListener('cdims-prefs', sync);
    return () => window.removeEventListener('cdims-prefs', sync);
  }, [user.preferences]);

  // Close the drawer after navigating, and on Escape
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stop the page scrolling behind an open drawer
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const toggleMenu = () => {
    if (isDesktop()) {
      const next = !collapsed;
      setCollapsed(next);
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
    } else {
      setOpen(!open);
    }
  };

  // `tab` marks the items shown in the mobile bottom bar (the rest live behind "More")
  const links = [
    { to: '/app', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true, tab: true },
    can('view_analysis') && { to: '/app/analysis', label: 'Analysis', icon: LineChart, tab: true },
    can('view_readings') && { to: '/app/data', label: 'Climate data', short: 'Data', icon: Database, tab: true },
    can('write_readings') && { to: '/app/field-entry', label: 'Field entry', short: 'Field', icon: ClipboardList, tab: true },
    can('write_readings') && { to: '/app/import', label: 'Import data', icon: FileUp },
    { to: '/app/map', label: 'Station map', short: 'Map', icon: Map, tab: !can('write_readings') },
    { to: '/app/stations', label: 'Stations', icon: MapPin },
    can('view_reports') && { to: '/app/reports', label: 'Reports', icon: FileText },
    can('manage_bulletins') && { to: '/app/bulletins', label: 'Bulletins and alerts', short: 'Alerts', icon: Megaphone },
    can('manage_users') && { to: '/app/users', label: 'Users', icon: Users, group: 'Administration' },
    can('view_audit') && { to: '/app/audit', label: 'Audit log', icon: ScrollText },
    can('manage_users') && { to: '/app/system', label: 'System', icon: Server },
    { to: '/app/help', label: 'User guide', short: 'Guide', icon: LifeBuoy, group: 'Support' },
    { to: '/app/profile', label: 'My account', short: 'Account', icon: UserCircle },
  ].filter(Boolean);
  const tabs = links.filter((l) => l.tab);

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  const MenuIcon = open ? X : Menu;

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <SessionGuard />
      {open && <button className="backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside id="sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-head">
          <div className="brand"><CloudSun size={22} /> <span>CDIMS</span></div>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav>
          {links.map(({ to, label, icon: Icon, end, group }) => (
            <div key={to} className="nav-item">
              {group && <div className="nav-group nav-label">{group}</div>}
              <GuardedLink to={to} end={end} title={label}>
                <Icon size={20} /> <span className="nav-label">{label}</span>
              </GuardedLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <Avatar user={user} />
            <div>
              <div className="who-name">{user.full_name}</div>
              <div className="who-role">{user.role}</div>
            </div>
          </div>
          <InstallButton />
          <button className="btn ghost block" onClick={signOut} title="Sign out"><LogOut size={16} /> <span>Sign out</span></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={toggleMenu} aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded={open}>
            <span className="menu-mobile"><MenuIcon size={22} /></span>
            <span className="menu-desktop">{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</span>
          </button>
          <span className="topbar-brand"><CloudSun size={20} /> CDIMS</span>
          <span className="topbar-title">· Zambia Meteorology Department</span>
          <span className="topbar-spacer" />
          <SyncStatus />
          <GuardedLink to="/app/profile" className="topbar-user" title="My account">
            <Avatar user={user} size={28} />
            <span>{user.full_name.split(' ')[0]}</span>
            <small>{user.role}</small>
          </GuardedLink>
          <ThemeToggle />
        </header>
        <main className="content" key={location.pathname}>{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {tabs.map(({ to, label, short, icon: Icon, end }) => (
          <GuardedLink key={to} to={to} end={end}>
            <span className="bn-ico"><Icon size={22} /></span>
            <span>{short || label}</span>
          </GuardedLink>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-label="More options" aria-expanded={open}>
          <span className="bn-ico"><Menu size={22} /></span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

export default function Layout({ children }) {
  return <UnsavedProvider><Shell>{children}</Shell></UnsavedProvider>;
}
