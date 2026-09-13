import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BarChart3, CreditCard, FileText, KeyRound, LogOut, Network, QrCode, Router as RouterIcon, Server, Settings, ShoppingCart, Ticket, Users, WalletCards } from "lucide-react";
import App from "./App";
import { auth } from "./api";
import RouterSessionsPage from "./pages/RouterSessionsPage";
import DashboardPage from "./pages/DashboardPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import MobileApiPage from "./pages/MobileApiPage";
import "./grouped-navigation.css";

type ExistingTarget = { label: string; target: string; icon: any; requiresSession?: boolean; disabled?: boolean };
type RouteTarget = { label: string; path: string; icon: any; requiresSession?: boolean; disabled?: boolean };
type MenuItem = ExistingTarget | RouteTarget;
type MenuGroup = { label: string; items: MenuItem[] };
const existing = (label: string, target: string, icon: any, requiresSession = false, disabled = false): ExistingTarget => ({ label, target, icon, requiresSession, disabled });
const route = (label: string, path: string, icon: any, requiresSession = false, disabled = false): RouteTarget => ({ label, path, icon, requiresSession, disabled });
const hasPath = (item: MenuItem): item is RouteTarget => "path" in item;
const groups: MenuGroup[] = [
  { label: "Utama", items: [existing("Dashboard", "Overview", Activity, true)] },
  { label: "Hotspot", items: [existing("Active Users", "Hotspot Active", Activity, true), existing("User List", "Hotspot Users", Users, true), existing("User Profiles", "Hotspot Profiles", Network, true), existing("Hotspot Log", "Hotspot Log", FileText, true)] },
  { label: "PPPoE", items: [existing("PPPoE Active", "PPPoE Active", Activity, true), existing("PPPoE Users", "PPPoE Secrets", Users, true), existing("PPPoE Profiles", "PPPoE Profiles", Server, true)] },
  { label: "Voucher", items: [existing("Reseller", "Resellers", ShoppingCart), existing("Generate Voucher", "Voucher Generate", Ticket, true), existing("Daftar Batch", "Voucher Batches", FileText, true), existing("Settings Voucher", "Voucher Types", Settings)] },
  { label: "Report", items: [existing("Selling Report", "Selling Report", BarChart3, true), existing("Resume Report", "Resume Report", BarChart3, true), existing("Live Report", "Live Report", Activity, true)] },
  { label: "Telegram Bot", items: [route("Reseller Bot", "/bot-resellers", Users), route("Tools & Settings", "/telegram", Settings)] },
  { label: "Billing", items: [existing("Pelanggan Billing", "Billing", WalletCards), existing("Tagihan / Invoice", "Billing", FileText)] },
  { label: "Pembayaran", items: [existing("Transaksi Pembayaran", "Payment Orders", CreditCard), existing("Payment Settings", "Payment Orders", Settings), existing("QRIS Monitor", "QRIS Monitor", QrCode)] },
  { label: "System", items: [existing("User Management", "System Users", Users), existing("Ganti Password", "Ganti Password", KeyRound), existing("Mobile API", "Mobile API", Server), existing("Sessions", "Sessions", RouterIcon), existing("Scheduler", "Scheduler", Activity, true), existing("DHCP Leases", "DHCP Leases", Network, true), existing("Interfaces", "Interfaces", RouterIcon, true), existing("Interface Traffic", "Interface Traffic", Activity, true), existing("System Resource", "System Resource", Server, true), existing("Logout", "Logout", LogOut)] },
];

function SidebarBridge({ sessionMode = false }: { sessionMode?: boolean }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [contentNode, setContentNode] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(sessionMode ? "Sessions" : "Dashboard");
  const labelByTarget = useMemo(() => new Map(groups.flatMap((group) => group.items.map((item) => [hasPath(item) ? item.path : item.target, item.label]))), []);
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const attach = () => {
      if (cancelled) return true;
      const sidebar = document.querySelector<HTMLElement>(".sidebar");
      const content = document.querySelector<HTMLElement>(".content");
      if (!sidebar || !content) return false;
      setMountNode(sidebar);
      setContentNode(content);
      const syncActive = () => {
        if (sessionMode) return;
        const activeButton = sidebar.querySelector<HTMLElement>("nav:not(.grouped-nav) .nav.active");
        const text = activeButton?.textContent?.trim() || "Overview";
        setActive(labelByTarget.get(text) || (text === "Overview" ? "Dashboard" : text));
      };
      syncActive();
      const observer = new MutationObserver(syncActive);
      observer.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ["class"] });
      cleanup = () => observer.disconnect();
      return true;
    };
    if (!attach()) {
      const observer = new MutationObserver(() => { if (attach()) observer.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
      cleanup = () => observer.disconnect();
    }
    return () => { cancelled = true; cleanup?.(); };
  }, [labelByTarget, sessionMode]);
  useEffect(() => {
    if (!contentNode) return;
    contentNode.classList.toggle("grouped-dashboard-active", !sessionMode && active === "Dashboard");
    return () => contentNode.classList.remove("grouped-dashboard-active");
  }, [contentNode, active, sessionMode]);
  if (!mountNode) return null;
  return (
    <>
      {createPortal(<nav className="grouped-nav" aria-label="Main navigation">{groups.map((group) => <div className="nav-group" key={group.label}><div className="nav-section">{group.label}</div>{group.items.map((item) => { const Icon = item.icon; return <button key={`${group.label}:${item.label}`} type="button" disabled={item.disabled} className={`${active === item.label ? "nav grouped-item active" : "nav grouped-item"}${item.disabled ? " disabled" : ""}`} title={item.disabled ? "Module entry is not implemented yet" : undefined} onClick={async () => {
        if (item.disabled) return;
        if (item.label === "Logout") { try { await auth.logout(); } finally { window.location.reload(); } return; }
        if (item.requiresSession) {
          const selector = document.querySelector<HTMLSelectElement>(".router-box select");
          if (!selector?.value) { window.location.assign("/routers"); return; }
        }
        setActive(item.label);
        if (item.label === "Ganti Password" || item.label === "Mobile API") return;
        if (hasPath(item)) { window.location.assign(item.path); return; }
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar > nav:not(.grouped-nav) .nav"));
        const button = buttons.find((candidate) => candidate.textContent?.trim() === item.target);
        if (button) button.click();
      }}><Icon size={17} /><span>{item.label}</span></button>; })}</div>)}</nav>, mountNode)}
      {!sessionMode && active === "Dashboard" && contentNode ? createPortal(<div className="dashboard-parity-host"><DashboardPage /></div>, contentNode) : null}
      {sessionMode && contentNode ? createPortal(<div className="session-overlay"><RouterSessionsPage /></div>, contentNode) : null}
      {!sessionMode && active === "Ganti Password" && contentNode ? createPortal(<div className="dashboard-parity-host"><ChangePasswordPage /></div>, contentNode) : null}
      {!sessionMode && active === "Mobile API" && contentNode ? createPortal(<div className="dashboard-parity-host"><MobileApiPage /></div>, contentNode) : null}
    </>
  );
}
export default function GroupedApp({ sessionMode = false }: { sessionMode?: boolean }) {
  return <div className={sessionMode ? "grouped-shell session-overlay-active" : "grouped-shell"}><App /><SidebarBridge sessionMode={sessionMode} /></div>;
}
