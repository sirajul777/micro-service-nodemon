import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import BillingPage from './pages/BillingPage';
import PaymentManagementPage from './pages/PaymentManagementPage';
import PaymentPage from './PaymentPage';
import PppoeProfilesPage from './pages/PppoeProfilesPage';
import PppoeSecretsPage from './pages/PppoeSecretsPage';
import PppoeActivePage from './pages/PppoeActivePage';
import VoucherOperationsPage from './pages/VoucherOperationsPage';
import SchedulerPage from './pages/SchedulerPage';

function Root() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const session = new URLSearchParams(window.location.search).get('session') || '';
  if (path === '/billing') return <BillingPage />;
  if (path === '/payments') return <PaymentManagementPage />;
  if (path === '/pppoe-profiles') return <PppoeProfilesPage session={session} />;
  if (path === '/pppoe-secrets') return <PppoeSecretsPage session={session} />;
  if (path === '/pppoe-active') return <PppoeActivePage session={session} />;
  if (path === '/voucher-operations') return <VoucherOperationsPage session={session} />;
  if (path === '/scheduler') return <SchedulerPage session={session} />;
  if (path === '/qris-ops') return <PaymentPage kind="qris" />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
