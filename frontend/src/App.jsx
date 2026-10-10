import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import { Login, Register } from './pages/AuthPages';

// Chart-heavy and secondary pages load on demand to keep the first bundle small
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analysis = lazy(() => import('./pages/Analysis'));
const Data = lazy(() => import('./pages/Data'));
const Stations = lazy(() => import('./pages/Stations'));
const Users = lazy(() => import('./pages/Users'));
const Profile = lazy(() => import('./pages/Profile'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Reports = lazy(() => import('./pages/Reports'));
const Help = lazy(() => import('./pages/Help'));
const FieldEntry = lazy(() => import('./pages/FieldEntry'));
const BulletinsAdmin = lazy(() => import('./pages/BulletinsAdmin'));
const PublicIndex = lazy(() => import('./pages/PublicBulletins').then((m) => ({ default: m.PublicIndex })));
const PublicBulletin = lazy(() => import('./pages/PublicBulletins').then((m) => ({ default: m.PublicBulletin })));
const PublicAlert = lazy(() => import('./pages/PublicBulletins').then((m) => ({ default: m.PublicAlert })));
const ImportWizard = lazy(() => import('./pages/ImportWizard'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const SystemPage = lazy(() => import('./pages/SystemPage'));

const Loading = () => <div className="empty"><span className="spinner" /></div>;

function Protected({ permission }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <div className="splash"><span className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (permission && !can(permission)) return <Navigate to="/app" replace />;
  return <Layout><Suspense fallback={<Loading />}><Outlet /></Suspense></Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/bulletins" element={<Suspense fallback={<Loading />}><PublicIndex /></Suspense>} />
      <Route path="/bulletins/:id" element={<Suspense fallback={<Loading />}><PublicBulletin /></Suspense>} />
      <Route path="/alerts/:id" element={<Suspense fallback={<Loading />}><PublicAlert /></Suspense>} />
      <Route path="/app" element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="stations" element={<Stations />} />
        <Route path="map" element={<MapPage />} />
        <Route path="help" element={<Help />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/app" element={<Protected permission="write_readings" />}>
        <Route path="field-entry" element={<FieldEntry />} />
        <Route path="import" element={<ImportWizard />} />
      </Route>
      <Route path="/app" element={<Protected permission="manage_bulletins" />}>
        <Route path="bulletins" element={<BulletinsAdmin />} />
        <Route path="bulletins/:id" element={<PublicBulletin staffPreview />} />
      </Route>
      <Route path="/app" element={<Protected permission="view_reports" />}>
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="/app" element={<Protected permission="manage_users" />}>
        <Route path="system" element={<SystemPage />} />
      </Route>
      <Route path="/app" element={<Protected permission="view_audit" />}>
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="/app" element={<Protected permission="view_analysis" />}>
        <Route path="analysis" element={<Analysis />} />
      </Route>
      <Route path="/app" element={<Protected permission="view_readings" />}>
        <Route path="data" element={<Data />} />
      </Route>
      <Route path="/app" element={<Protected permission="manage_users" />}>
        <Route path="users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
