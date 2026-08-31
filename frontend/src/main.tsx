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
import HotspotActivePage from './pages/HotspotActivePage';
import HotspotLogPage from './pages/HotspotLogPage';
import DhcpLeasesPage from './pages/DhcpLeasesPage';
import VoucherOperationsPage from './pages/VoucherOperationsPage';
import VoucherTypesPage from './pages/VoucherTypesPage';
import SchedulerPage from './pages/SchedulerPage';
import RouterSessionsPage from './pages/RouterSessionsPage';
import ResellersPage from './pages/ResellersPage';
import TelegramPage from './pages/TelegramPage';
import BotResellersPage from './pages/BotResellersPage';
import UsersPage from './pages/UsersPage';
import SystemResourcePage from './pages/SystemResourcePage';
import InterfacesPage from './pages/InterfacesPage';
import InterfaceTrafficPage from './pages/InterfaceTrafficPage';

// App.tsx still references the legacy page symbol directly; keep that shell compatible while
// the dedicated router entry points remain the preferred path.
globalThis.HotspotActivePage = HotspotActivePage;

function Root() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const session = new URLSearchParams(window.location.search).get('session') || '';
  if (path === '/billing') return <BillingPage />;
  if (path === '/payments') return <PaymentManagementPage />;
  if (path === '/pppoe-profiles') return <PppoeProfilesPage session={session} />;
  if (path === '/pppoe-secrets') return <PppoeSecretsPage session={session} />;
  if (path === '/pppoe-active') return <PppoeActivePage session={session} />;
  if (path === '/hotspot-active') return <HotspotActivePage session={session} />;
  if (path === '/hotspot-log') return <HotspotLogPage session={session} />;
  if (path === '/dhcp-leases') return <DhcpLeasesPage session={session} />;
  if (path === '/voucher-operations' || path === '/voucher-batches') return <VoucherOperationsPage session={session} />;
  if (path === '/voucher-types') return <VoucherTypesPage />;
  if (path === '/scheduler') return <SchedulerPage session={session} />;
  if (path === '/routers') return <RouterSessionsPage />;
  if (path === '/resellers') return <ResellersPage />;
  if (path === '/telegram') return <TelegramPage />;
  if (path === '/bot-resellers') return <BotResellersPage />;
  if (path === '/users') return <UsersPage />;
  if (path === '/system-resource') return <SystemResourcePage session={session} />;
  if (path === '/interfaces') return <InterfacesPage session={session} />;
  if (path === '/interface-traffic') return <InterfaceTrafficPage session={session} />;
  if (path === '/qris' || path === '/qris-ops') return <PaymentPage kind="qris" />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
