import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, BarChart3, CreditCard, FileText, KeyRound, Network, QrCode, Router as RouterIcon, Server, Settings, ShoppingCart, Ticket, Users, WalletCards } from 'lucide-react';
import App from './App';
import './grouped-navigation.css';

type ExistingTarget = { label: string; target: string; icon: any; requiresSession?: boolean; disabled?: boolean };
type RouteTarget = { label: string; path: string; icon: any; requiresSession?: boolean; disabled?: boolean };
type MenuItem = ExistingTarget | RouteTarget;
type MenuGroup = { label: string; items: MenuItem[] };

const existing = (label: string, target: string, icon: any, requiresSession = false, disabled = false): ExistingTarget => ({ label, target, icon, requiresSession, disabled });
const route = (label: string, path: string, icon: any, requiresSession = false, disabled = false): RouteTarget => ({ label, path, icon, requiresSession, disabled });
const hasPath = (item: MenuItem): item is RouteTarget => 'path' in item;

const groups: MenuGroup[] = [
  { label: 'Utama', items: [existing('Dashboard', 'Overview', Activity, true)] },
  { label: 'Hotspot', items: [
    existing('Active Users', 'Hotspot Active', Activity, true),
    existing('User List', 'Hotspot Users', Users, true),
    existing('User Profiles', 'Hotspot Profiles', Network, true),
    existing('Hotspot Log', 'Hotspot Log', FileText, true),
  ] },
  { label: 'PPPoE', items: [
    existing('PPPoE Active', 'PPPoE Active', Activity, true),
    existing('PPPoE Users', 'PPPoE Secrets', Users, true),
    existing('PPPoE Profiles', 'PPPoE Profiles', Server, true),
  ] },
  { label: 'Voucher', items: [
    existing('Reseller', 'Resellers', ShoppingCart),
    existing('Generate Voucher', 'Voucher Generate', Ticket, true),
    existing('Daftar Batch', 'Voucher Batches', FileText, true),
    existing('Settings Voucher', 'Voucher Types', Settings),
  ] },
  { label: 'Report', items: [
    existing('Selling Report', 'Selling Report', BarChart3, true),
    existing('Resume Report', 'Resume Report', BarChart3, true),
    existing('Live Report', 'Live Report', Activity, true),
  ] },
  { label: 'Telegram Bot', items: [
    route('Reseller Bot', '/bot-resellers', Users),
    route('Tools & Settings', '/telegram', Settings),
  ] },
  { label: 'Billing', items: [
    existing('Pelanggan Billing', 'Billing', WalletCards),
    route('Tagihan / Invoice', '/billing', FileText, false, true),
  ] },
  { label: 'Pembayaran', items: [
    existing('Transaksi Pembayaran', 'Payment Orders', CreditCard),
    route('Payment Settings', '/payments', Settings, false, true),
    existing('QRIS Monitor', 'QRIS Monitor', QrCode),
  ] },
  { label: 'System', items: [
    existing('User Management', 'System Users', Users),
    route('Ganti Password', '/users', KeyRound, false, true),
    route('Mobile API', '/users', Server, false, true),
    route('Sessions', '/routers', RouterIcon),
    existing('Scheduler', 'Scheduler', Activity, true),
    existing('DHCP Leases', 'DHCP Leases', Network, true),
    existing('Interfaces', 'Interfaces', RouterIcon, true),
    existing('Interface Traffic', 'Interface Traffic', Activity, true),
    existing('System Resource', 'System Resource', Server, true),
  ] },
];

function SidebarBridge() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState('Dashboard');
  const labelByTarget = useMemo(() => new Map(groups.flatMap(group => group.items.map(item => [hasPath(item) ? item.path : item.target, item.label]))), []);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    if (!sidebar) return;
    setMountNode(sidebar);
    const syncActive = () => {
      const activeButton = sidebar.querySelector<HTMLElement>('nav:not(.grouped-nav) .nav.active');
      const text = activeButton?.textContent?.trim() || 'Overview';
      setActive(labelByTarget.get(text) || (text === 'Overview' ? 'Dashboard' : text));
    };
    syncActive();
    const observer = new MutationObserver(syncActive);
    observer.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [labelByTarget]);

  if (!mountNode) return null;
  return createPortal(
    <nav className="grouped-nav" aria-label="Main navigation">
      {groups.map(group => (
        <div className="nav-group" key={group.label}>
          <div className="nav-section">{group.label}</div>
          {group.items.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={`${group.label}:${item.label}`}
                type="button"
                disabled={item.disabled}
                className={`${active === item.label ? 'nav grouped-item active' : 'nav grouped-item'}${item.disabled ? ' disabled' : ''}`}
                title={item.disabled ? 'Module entry is not implemented yet' : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.requiresSession) {
                    const selector = document.querySelector<HTMLSelectElement>('.router-box select');
                    if (!selector?.value) {
                      window.location.assign('/routers');
                      return;
                    }
                  }
                  setActive(item.label);
                  if (hasPath(item)) {
                    window.location.assign(item.path);
                    return;
                  }
                  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar > nav:not(.grouped-nav) .nav'));
                  const button = buttons.find(candidate => candidate.textContent?.trim() === item.target);
                  if (button) button.click();
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>,
    mountNode,
  );
}

export default function GroupedApp() {
  return (
    <div className="grouped-shell">
      <App />
      <SidebarBridge />
    </div>
  );
}
