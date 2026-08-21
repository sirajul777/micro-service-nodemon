import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import PaymentPage from './PaymentPage';

function Root() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/payments') return <PaymentPage kind="payments" data={[]} loading={false} onReload={() => window.location.reload()} />;
  if (path === '/qris-ops') return <PaymentPage kind="qris" data={{ stats: null, orders: [], callbacks: [] }} loading={false} onReload={() => window.location.reload()} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
