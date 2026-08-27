import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import BillingPage from './pages/BillingPage';
import PaymentManagementPage from './pages/PaymentManagementPage';
import PaymentPage from './PaymentPage';

function Root() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/billing') return <BillingPage />;
  if (path === '/payments') return <PaymentManagementPage />;
  if (path === '/qris-ops') return <PaymentPage kind="qris" />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
