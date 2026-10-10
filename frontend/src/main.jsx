import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import BackToTop from './components/BackToTop';
import { OfflineProvider } from './offline/OfflineProvider';
import { OfflineBanner, registerServiceWorker } from './components/pwa';
import { ToastProvider } from './components/toast';
import { initTheme } from './theme';
import './styles.css';

registerServiceWorker();
initTheme();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <AuthProvider>
          <OfflineProvider>
            <OfflineBanner />
            <App />
            <BackToTop />
          </OfflineProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
