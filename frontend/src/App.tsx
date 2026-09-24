import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CircleGauge,
  Cpu,
  Database,
  FileText,
  KeyRound,
  LogOut,
  Menu,
  Network,
  Plus,
  QrCode,
  RefreshCw,
  Router as RouterIcon,
  Search,
  Server,
  ShoppingCart,
  Users,
  X,
  WalletCards,
} from "lucide-react";
import {
  auth,
  payment,
  qris,
  reports,
  reseller,
  router,
  users,
  voucher,
} from "./api";
import { ReportPageTabs } from "./pages/ReportPages";
import BillingPage from "./pages/BillingPage";
import PaymentManagementPage from "./pages/PaymentManagementPage";
import QrisMonitorPage from "./pages/QrisMonitorPage";
import PppoeProfilesPage from "./pages/PppoeProfilesPage";
import PppoeSecretsPage from "./pages/PppoeSecretsPage";
import PppoeActivePage from "./pages/PppoeActivePage";
import HotspotProfilesPage from "./pages/HotspotProfilesPage";
import HotspotUsersPage from "./pages/HotspotUsersPage";
import SchedulerPage from "./pages/SchedulerPage";
import DhcpLeasesPage from "./pages/DhcpLeasesPage";
import InterfaceTrafficPage from "./pages/InterfaceTrafficPage";
import InterfacesPage from "./pages/InterfacesPage";
import SystemResourcePage from "./pages/SystemResourcePage";
import UsersPage from "./pages/UsersPage";

type Session = { id: string; name?: string; ip?: string; port?: number };
type Page =
  | "dashboard"
  | "hotspot-users"
  | "hotspot-active"
  | "hotspot-profiles"
  | "hotspot-log"
  | "scheduler"
  | "dhcp-leases"
  | "system-resource"
  | "interface-traffic"
  | "pppoe-active"
  | "pppoe-profiles"
  | "pppoe-secrets"
  | "interfaces"
  | "voucher-generate"
  | "voucher-batches"
  | "voucher-types"
  | "qris"
  | "payment-orders"
  | "users"
  | "billing"
  | "resellers"
  | "live-report"
  | "selling-report"
  | "resume-report";
const nav: [string, Page, any][] = [
  ["Overview", "dashboard", CircleGauge],
  ["Hotspot Users", "hotspot-users", Users],
  ["Hotspot Active", "hotspot-active", Activity],
  ["Hotspot Profiles", "hotspot-profiles", Network],
  ["Hotspot Log", "hotspot-log", FileText],
  ["Scheduler", "scheduler", Activity],
  ["DHCP Leases", "dhcp-leases", Network],
  ["System Resource", "system-resource", Cpu],
  ["Interface Traffic", "interface-traffic", Activity],
  ["PPPoE Active", "pppoe-active", Activity],
  ["PPPoE Profiles", "pppoe-profiles", Server],
  ["PPPoE Secrets", "pppoe-secrets", Users],
  ["Interfaces", "interfaces", RouterIcon],
  ["Voucher Generate", "voucher-generate", Plus],
  ["Voucher Batches", "voucher-batches", FileText],
  ["Voucher Types", "voucher-types", BarChart3],
  ["Payment Orders", "payment-orders", KeyRound],
  ["System Users", "users", Users],
  ["Billing", "billing", WalletCards],
  ["Selling Report", "selling-report", BarChart3],
  ["Resume Report", "resume-report", BarChart3],
  ["Live Report", "live-report", BarChart3],
  ["QRIS Monitor", "qris", QrCode],
  ["Resellers", "resellers", ShoppingCart],
];
export default function App() {
  const [me, setMe] = useState<any>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState("");
  const [page, setPage] = useState<Page>("dashboard");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const current = useMemo(
    () => sessions.find((s) => s.id === session),
    [sessions, session],
  );
  const title = nav.find((n) => n[1] === page)?.[0] || "Overview";
  const load = async () => {
    if (
      !session &&
      ![
        "qris",
        "voucher-types",
        "voucher-generate",
        "payment-orders",
        "users",
        "billing",
      ].includes(page)
    )
      return;
    setLoading(true);
    setError("");
    try {
      let result: any;
      switch (page) {
        case "dashboard":
          result = await router.dashboard(session);
          break;
        case "hotspot-users":
          result = await router.hotspotUsers(session, "all");
          break;
        case "hotspot-active":
          result = await router.hotspotActive(session);
          break;
        case "hotspot-profiles":
          result = await router.hotspotProfiles(session);
          break;
        case "hotspot-log":
          result = await router.hotspotLog(session);
          break;
        case "scheduler":
          result = await router.scheduler(session);
          break;
        case "dhcp-leases":
          result = await router.dhcpLeases(session);
          break;
        case "system-resource":
          result = await router.systemResource(session);
          break;
        case "interface-traffic":
          result = await router.interfaces(session);
          break;
        case "interfaces":
          result = await router.interfaces(session);
          break;
        case "pppoe-active":
          result = await router.pppActive(session);
          break;
        case "pppoe-profiles":
          result = await router.pppProfiles(session);
          break;
        case "pppoe-secrets":
          result = await router.pppSecrets(session);
          break;
        case "voucher-batches":
          result = await voucher.batches(session);
          break;
        case "voucher-types":
          result = await voucher.voucherTypes();
          break;
        case "qris":
          result = await Promise.all([
            qris.stats(),
            qris.orders(),
            qris.callbacks(50),
          ]);
          break;
        case "payment-orders":
          result = await payment.list();
          break;
        case "users":
          result = await users.list();
          break;
        case "resellers":
          result = await reseller.session(session);
          break;
        case "live-report":
          result = await reports.live(session);
          break;
      }
      setData(result);
    } catch (e: any) {
      setError(
        e?.message === "UNAUTHORIZED"
          ? "Session expired."
          : e?.message || "Unable to load data.",
      );
    } finally {
      setLoading(false);
    }
  };
  const boot = async () => {
    try {
      const m = await auth.me();
      setMe(m);
      const r = await router.sessions();
      const rows = (r?.sessions ?? r ?? []) as Session[];
      setSessions(rows);
      setSession(rows[0]?.id || "");
      setLogin(false);
    } catch {
      setLogin(true);
    }
  };
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    if (!login) void load();
  }, [page, session, login]);
  if (login)
    return (
      <Login
        c={credentials}
        setC={setCredentials}
        error={error}
        onDone={boot}
      />
    );
  const reportPage =
    page === "selling-report" ? (
      <ReportPageTabs session={session} initial="selling" />
    ) : page === "resume-report" ? (
      <ReportPageTabs session={session} initial="resume" />
    ) : (
      <ReportPageTabs session={session} initial="live" />
    );
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Brand close={() => setOpen(false)} />
        <div className="router-box">
          <span>ACTIVE ROUTER</span>
          <select
            value={session}
            onChange={async (e) => {
              setSession(e.target.value);
              await router.set(e.target.value);
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
          <small>
            {current?.ip || "No address"}
            {current?.port ? `:${current.port}` : ""}
          </small>
        </div>
        <nav>
          {nav.map(([label, key, Icon]) => (
            <button
              key={key}
              className={page === key ? "nav active" : "nav"}
              onClick={() => {
                setPage(key);
                setOpen(false);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-mini">
            <div className="avatar">
              {String(me?.username || "A")[0].toUpperCase()}
            </div>
            <div>
              <b>{me?.username || "Admin"}</b>
              <span>Administrator</span>
            </div>
          </div>
          <button
            className="logout"
            onClick={async () => {
              await auth.logout();
              setLogin(true);
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <button className="icon mobile-only" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div>
            <span className="eyebrow">NETWORK OPERATIONS</span>
            <h2>{title}</h2>
          </div>
          <div className="top-actions">
            <div className="search">
              <Search size={16} />
              <input placeholder="Search current page..." />
            </div>
            <button className="icon" onClick={() => void load()}>
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>
        <section className="content">
          {error && <div className="error banner">{error}</div>}
          {page === "dashboard" ? (
            <Dashboard data={data} session={current} />
          ) : page === "hotspot-users" ? (
            <HotspotUsersPage session={session} />
          ) : page === "hotspot-active" ? (
            <HotspotActivePage session={session} />
          ) : page === "hotspot-profiles" ? (
            <HotspotProfilesPage session={session} />
          ) : page === "scheduler" ? (
            <SchedulerPage session={session} />
          ) : page === "dhcp-leases" ? (
            <DhcpLeasesPage session={session} />
          ) : page === "interface-traffic" ? (
            <InterfaceTrafficPage session={session} />
          ) : page === "interfaces" ? (
            <InterfacesPage
              session={session}
              onTraffic={() => setPage("interface-traffic")}
            />
          ) : page === "system-resource" ? (
            <SystemResourcePage session={session} />
          ) : page === "users" ? (
            <UsersPage />
          ) : page === "billing" ? (
            <BillingPage />
          ) : page === "payment-orders" ? (
            <PaymentManagementPage />
          ) : page === "pppoe-active" ? (
            <PppoeActivePage session={session} />
          ) : page === "pppoe-profiles" ? (
            <PppoeProfilesPage session={session} />
          ) : page === "pppoe-secrets" ? (
            <PppoeSecretsPage session={session} />
          ) : page === "qris" ? (
            <QrisMonitorPage data={data} loading={loading} />
          ) : page === "selling-report" ? (
            reportPage
          ) : page === "resume-report" ? (
            reportPage
          ) : page === "live-report" ? (
            reportPage
          ) : page === "voucher-generate" ? (
            <VoucherGeneratePage
              session={session}
              onGenerated={(r) => {
                setData(r);
                setError("");
              }}
            />
          ) : (
            <ParityTable page={page} data={data} loading={loading} />
          )}
        </section>
      </main>
    </div>
  );
}
function Brand({ close }: { close: () => void }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <RouterIcon size={18} />
      </div>
      <div>
        <b>NODEMON</b>
        <span>NETWORK CONTROL</span>
      </div>
      <button className="icon mobile-only" onClick={close}>
        <X size={18} />
      </button>
    </div>
  );
}
function Login({ c, setC, error, onDone }: any) {
  return (
    <div className="login">
      <div className="login-card">
        <Brand close={() => {}} />
        <h1>Welcome back</h1>
        <p>Sign in to manage routers and services.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await auth.login(c.username, c.password);
              await onDone();
            } catch {
              setC(c);
            }
          }}
        >
          <label>
            Username
            <input
              value={c.username}
              onChange={(e) => setC({ ...c, username: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={c.password}
              onChange={(e) => setC({ ...c, password: e.target.value })}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary">Sign in</button>
        </form>
      </div>
    </div>
  );
}
function Dashboard({ data, session }: any) {
  const stats: any[] = [
    ["Active Hotspot", data?.activeHotspotUsers ?? "—", Users],
    ["Total Hotspot", data?.totalHotspotUsers ?? "—", Network],
    ["CPU Load", data?.cpuLoad ? `${data.cpuLoad}%` : "—", Cpu],
    ["Free Memory", data?.freeMemory || "—", Database],
  ];
  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow">LIVE ROUTER</span>
          <h3>{session?.name || session?.id || "Router"}</h3>
          <p>{session?.ip || "No address"} · RouterOS monitoring</p>
        </div>
        <div className="status">
          <i />
          Connected
        </div>
      </div>
      <div className="stats">
        {stats.map(([label, value, Icon]) => (
          <div className="stat" key={label}>
            <div className="stat-icon"><Icon size={18} /></div>
            <div><span>{label}</span><strong>{value}</strong></div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head">
          <div><h3>Router Overview</h3><span>Current router snapshot</span></div>
          <span className="badge">{loading ? "LOADING" : "LIVE"}</span>
        </div>
        <div className="grid">
          <Metric n="Router" v={session?.name || session?.id || "—"} />
          <Metric n="Address" v={session?.ip || "—"} />
          <Metric n="Port" v={session?.port || 8728} />
          <Metric n="Status" v="Connected" />
        </div>
      </div>
    </>
  );
}
function Metric({ n, v }: { n: string; v: unknown }) {
  return <div className="metric"><span>{n}</span><strong>{String(v)}</strong></div>;
}
function ParityTable({ page, data, loading }: any) {
  const rows = Array.isArray(data) ? data : data?.data || data?.rows || data?.items || [];
  const cols: Record<string, string[]> = {
    "voucher-batches": ["id", "name", "status", "profile", "qty", "createdAt"],
    "voucher-types": ["id", "name", "price", "duration", "profile", "enabled"],
    "payment-orders": ["orderId", "username", "profile", "amount", "status", "createdAt"],
    resellers: ["id", "name", "username", "sessionId", "status"],
  };
  const columns = cols[page] || Object.keys(rows[0] || {}).slice(0, 8);
  const humanize = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  const formatCell = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>{nav.find((n) => n[1] === page)?.[0]}</h3>
          <span>{rows.length} records</span>
        </div>
        <span className="badge">{loading ? "LOADING" : "LIVE"}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((c) => <th key={c}>{humanize(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r: any, i: number) => <tr key={String(r.id || r.name || r.address || i)}>{columns.map((c) => <td key={c}>{formatCell(r[c])}</td>)}</tr>)}</tbody>
        </table>
        {!rows.length && <div className="empty">No records found.</div>}
      </div>
    </div>
  );
}
function VoucherGeneratePage({
  session,
  onGenerated,
}: {
  session: string;
  onGenerated: (value: any) => void;
}) {
  const [profile, setProfile] = useState("");
  const [count, setCount] = useState("10");
  const [prefix, setPrefix] = useState("");
  const [price, setPrice] = useState("0");
  const [validity, setValidity] = useState("1h");
  const [caption, setCaption] = useState("");
  const [color, setColor] = useState("#1f6feb");
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generate = async () => {
    if (!session || !profile) {
      setError("Router and profile are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await voucher.generate({
        session,
        profile,
        count: Number(count),
        prefix,
        price: Number(price),
        validity,
        caption,
        color,
        createdBy: "Admin",
      });
      setVouchers(result?.vouchers || []);
      onGenerated(result);
    } catch (e: any) {
      setError(e?.message || "Unable to generate vouchers.");
    } finally {
      setBusy(false);
    }
  };
  const csv = async () => {
    if (!session || !profile) {
      setError("Router and profile are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await voucher.generateCsv({
        session,
        profile,
        count: Number(count),
        prefix,
        price: Number(price),
        validity,
        caption,
        color,
        createdBy: "Admin",
      });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Unable to generate CSV.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel">
      <div className="panel-head">
        <div><h3>Voucher Generate</h3><span>Generate and export hotspot vouchers</span></div>
        <span className="badge">{busy ? "WORKING" : "READY"}</span>
      </div>
      {error && <div className="error banner">{error}</div>}
      <div className="grid">
        <label className="metric"><span>Profile</span><input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="hotspot profile" /></label>
        <label className="metric"><span>Count</span><input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <label className="metric"><span>Prefix</span><input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. V" /></label>
        <label className="metric"><span>Price</span><input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="metric"><span>Validity</span><input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="1h / 1d" /></label>
        <label className="metric"><span>Caption</span><input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Optional caption" /></label>
        <label className="metric"><span>Color</span><input type="text" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      <div className="top-actions" style={{ marginTop: 16 }}>
        <button className="primary" disabled={busy} onClick={() => void generate()}>{busy ? "Generating…" : "Generate"}</button>
        <button className="button" disabled={busy} onClick={() => void csv()}>Export CSV</button>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h3>Generated Vouchers</h3><span>{vouchers.length} generated</span></div></div>
        <div className="table-wrap">
          <table><thead><tr><th>Username</th><th>Password</th><th>Profile</th></tr></thead>
            <tbody>{vouchers.map((v, i) => <tr key={i}><td>{v.username || v.user || "—"}</td><td>{v.password || "—"}</td><td>{v.profile || profile || "—"}</td></tr>)}</tbody>
          </table>
          {!vouchers.length && <div className="empty">No generated vouchers yet.</div>}
        </div>
      </div>
    </div>
  );
}
