import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CircleGauge, Cpu, Database, FileText, LogOut, Menu, Network, QrCode, RefreshCw, Router as RouterIcon, Search, Server, ShoppingCart, Users, X } from 'lucide-react';
import { auth, qris, reports, reseller, router, voucher } from './api';

type Session = { id: string; name?: string; ip?: string; port?: number };
type Page = 'dashboard' | 'hotspot-users' | 'hotspot-profiles' | 'pppoe-active' | 'pppoe-profiles' | 'pppoe-secrets' | 'interfaces' | 'voucher-batches' | 'voucher-types' | 'qris' | 'resellers' | 'live-report';
type Item = Record<string, any>;

const nav: [string, Page, any][] = [
  ['Overview', 'dashboard', CircleGauge], ['Hotspot Users', 'hotspot-users', Users], ['Hotspot Profiles', 'hotspot-profiles', Network],
  ['PPPoE Active', 'pppoe-active', Activity], ['PPPoE Profiles', 'pppoe-profiles', Server], ['PPPoE Secrets', 'pppoe-secrets', Users],
  ['Interfaces', 'interfaces', RouterIcon], ['Voucher Batches', 'voucher-batches', FileText], ['Voucher Types', 'voucher-types', BarChart3],
  ['QRIS Monitor', 'qris', QrCode], ['Resellers', 'resellers', ShoppingCart], ['Live Report', 'live-report', BarChart3],
];

export default function App() {
  const [me, setMe] = useState<any>(); const [sessions, setSessions] = useState<Session[]>([]); const [session, setSession] = useState('');
  const [page, setPage] = useState<Page>('dashboard'); const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(); const [error, setError] = useState(''); const [login, setLogin] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const current = useMemo(() => sessions.find((s) => s.id === session), [sessions, session]);
  const title = nav.find((n) => n[1] === page)?.[0] || 'Overview';

  const load = async () => {
    if (!session && page !== 'qris') return; setLoading(true); setError('');
    try {
      let result: any;
      switch (page) {
        case 'dashboard': result = await router.dashboard(session); break;
        case 'hotspot-users': result = await router.hotspotUsers(session, 'all'); break;
        case 'hotspot-profiles': result = await router.hotspotProfiles(session); break;
        case 'pppoe-active': result = await router.pppActive(session); break;
        case 'pppoe-profiles': result = await router.pppProfiles(session); break;
        case 'pppoe-secrets': result = await router.pppSecrets(session); break;
        case 'interfaces': result = await router.interfaces(session); break;
        case 'voucher-batches': result = await voucher.batches(session); break;
        case 'voucher-types': result = await voucher.voucherTypes(); break;
        case 'qris': result = await Promise.all([qris.stats(), qris.orders(), qris.callbacks(50)]); break;
        case 'resellers': result = await reseller.session(session); break;
        case 'live-report': result = await reports.live(session); break;
      }
      setData(result);
    } catch (e: any) { setError(e?.message === 'UNAUTHORIZED' ? 'Session expired.' : e?.message || 'Unable to load data.'); }
    finally { setLoading(false); }
  };

  const boot = async () => {
    try { const m = await auth.me(); setMe(m); const r = await router.sessions(); const rows = (r?.sessions ?? r ?? []) as Session[]; setSessions(rows); setSession(rows[0]?.id || ''); setLogin(false); }
    catch { setLogin(true); }
  };
  useEffect(() => { void boot(); }, []); useEffect(() => { if (!login) void load(); }, [page, session, login]);
  if (login) return <Login c={credentials} setC={setCredentials} error={error} onDone={boot} />;

  return <div className="app-shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}><Brand close={() => setOpen(false)} />
      <div className="router-box"><span>ACTIVE ROUTER</span><select value={session} onChange={async (e) => { setSession(e.target.value); await router.set(e.target.value); }}>
        {sessions.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
      </select><small>{current?.ip || 'No address'}{current?.port ? `:${current.port}` : ''}</small></div>
      <nav>{nav.map(([label, key, Icon]) => <button key={key} className={page === key ? 'nav active' : 'nav'} onClick={() => { setPage(key); setOpen(false); }}><Icon size={17} />{label}</button>)}</nav>
      <div className="sidebar-foot"><div className="user-mini"><div className="avatar">{String(me?.username || 'A')[0].toUpperCase()}</div><div><b>{me?.username || 'Admin'}</b><span>Administrator</span></div></div><button className="logout" onClick={async () => { await auth.logout(); setLogin(true); }}><LogOut size={16} /></button></div>
    </aside>
    <main><header><button className="icon mobile-only" onClick={() => setOpen(true)}><Menu size={20} /></button><div><span className="eyebrow">NETWORK OPERATIONS</span><h2>{title}</h2></div><div className="top-actions"><div className="search"><Search size={16} /><input placeholder="Search current page..." /></div><button className="icon" onClick={() => void load()}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></div></header>
      <section className="content">{error && <div className="error banner">{error}</div>}{page === 'dashboard' ? <Dashboard data={data} session={current} /> : page === 'qris' ? <QrisPage data={data} loading={loading} /> : page === 'live-report' ? <ReportPage data={data} loading={loading} /> : <TablePage page={page} data={data} loading={loading} />}</section>
    </main>
  </div>;
}

function Brand({ close }: { close: () => void }) { return <div className="brand"><div className="brand-mark"><RouterIcon size={18} /></div><div><b>NODEMON</b><span>NETWORK CONTROL</span></div><button className="icon mobile-only" onClick={close}><X size={18} /></button></div>; }
function Login({ c, setC, error, onDone }: any) { return <div className="login"><div className="login-card"><Brand close={() => {}} /><h1>Welcome back</h1><p>Sign in to manage routers and services.</p><form onSubmit={async (e) => { e.preventDefault(); try { await auth.login(c.username, c.password); await onDone(); } catch { setC(c); } }}><label>Username<input value={c.username} onChange={(e) => setC({ ...c, username: e.target.value })} /></label><label>Password<input type="password" value={c.password} onChange={(e) => setC({ ...c, password: e.target.value })} /></label>{error && <div className="error">{error}</div>}<button className="primary">Sign in</button></form></div></div>; }
function Dashboard({ data, session }: any) { const stats: any[] = [['Active Hotspot', data?.activeHotspotUsers ?? '—', Users], ['Total Hotspot', data?.totalHotspotUsers ?? '—', Network], ['CPU Load', data?.cpuLoad ? `${data.cpuLoad}%` : '—', Cpu], ['Free Memory', data?.freeMemory || '—', Database]]; return <><div className="hero"><div><span className="eyebrow">LIVE ROUTER</span><h3>{session?.name || session?.id || 'Router'}</h3><p>{session?.ip || 'No address'} · RouterOS monitoring</p></div><div className="status"><i />Connected</div></div><div className="stats">{stats.map(([label, value, Icon]) => <div className="stat" key={label}><div className="stat-icon"><Icon size={18} /></div><div><span>{label}</span><strong>{value}</strong></div></div>)}</div><div className="panel"><div className="panel-head"><div><h3>System snapshot</h3><span>Current router telemetry</span></div><span className="badge">LIVE</span></div><div className="grid"><Metric n="RouterOS" v={data?.rosVersion || data?.version || '—'} /><Metric n="Uptime" v={data?.uptime || '—'} /><Metric n="Free HDD" v={data?.freeHdd || '—'} /><Metric n="Interfaces" v={data?.interfaces || '—'} /></div></div></>; }
const Metric = ({ n, v }: any) => <div className="metric"><span>{n}</span><b>{String(v)}</b></div>;

function TablePage({ page, data, loading }: any) {
  let rows: Item[] = data?.users || data?.profiles || data?.connections || data?.secrets || data?.batches || data?.voucherTypes || data?.resellers || data || [];
  if (!Array.isArray(rows)) rows = data?.data && Array.isArray(data.data) ? data.data : [];
  const cols: Record<string, string[]> = {
    'hotspot-users': ['name', 'profile', 'comment', 'disabled'], 'hotspot-profiles': ['name', 'rateLimit', 'sharedUsers', 'addressPool'],
    'pppoe-active': ['name', 'address', 'uptime', 'service'], 'pppoe-profiles': ['name', 'localAddress', 'remoteAddress', 'rateLimit', 'dns'],
    'pppoe-secrets': ['name', 'service', 'profile', 'remoteAddress', 'disabled'], interfaces: ['name', 'type', 'macAddress', 'tx', 'rx', 'running'],
    'voucher-batches': ['id', 'name', 'status', 'profile', 'qty', 'createdAt'], 'voucher-types': ['id', 'name', 'price', 'duration', 'profile'],
    resellers: ['id', 'name', 'username', 'sessionId', 'status'],
  };
  const columns = cols[page] || Object.keys(rows[0] || {}).slice(0, 8);
  return <div className="panel"><div className="panel-head"><div><h3>{nav.find((n) => n[1] === page)?.[0]}</h3><span>{rows.length} records</span></div><span className="badge">{loading ? 'LOADING' : 'LIVE'}</span></div><div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={c}>{humanize(c)}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={String(r.id || r.name || i)}>{columns.map((c) => <td key={c}>{formatCell(r[c])}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty">No records found.</div>}</div></div>;
}
function QrisPage({ data, loading }: any) { const [stats, orders, callbacks] = Array.isArray(data) ? data : [null, [], []]; return <><div className="stats"><MetricCard title="Orders" value={orders?.length ?? stats?.totalOrders ?? '—'} /><MetricCard title="Success" value={stats?.success ?? stats?.paid ?? '—'} /><MetricCard title="Pending" value={stats?.pending ?? '—'} /><MetricCard title="Callbacks" value={callbacks?.length ?? '—'} /></div><div className="panel"><div className="panel-head"><div><h3>QRIS Orders</h3><span>Recent orders and callbacks</span></div><span className="badge">{loading ? 'LOADING' : 'LIVE'}</span></div><div className="table-wrap"><table><thead><tr>{['orderId', 'amount', 'status', 'createdAt'].map((c) => <th key={c}>{humanize(c)}</th>)}</tr></thead><tbody>{(orders || []).map((r: any, i: number) => <tr key={r.orderId || r.id || i}>{['orderId', 'amount', 'status', 'createdAt'].map((c) => <td key={c}>{formatCell(r?.[c])}</td>)}</tr>)}</tbody></table></div></div></>; }
function ReportPage({ data, loading }: any) { const rows = Array.isArray(data) ? data : (data?.scripts || data?.rows || data?.data || []); return <div className="panel"><div className="panel-head"><div><h3>Live Selling Report</h3><span>{Array.isArray(rows) ? rows.length : 0} records</span></div><span className="badge">{loading ? 'LOADING' : 'LIVE'}</span></div><div className="table-wrap"><table><thead><tr>{['date', 'time', 'username', 'price', 'profile', 'comment'].map((c) => <th key={c}>{humanize(c)}</th>)}</tr></thead><tbody>{rows.map((r: any, i: number) => <tr key={r.id || i}>{['date', 'time', 'username', 'price', 'profile', 'comment'].map((c) => <td key={c}>{formatCell(r?.[c])}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty">No live report data.</div>}</div></div>; }
const MetricCard = ({ title, value }: { title: string; value: any }) => <div className="stat"><div className="stat-icon"><BarChart3 size={18} /></div><div><span>{title}</span><strong>{String(value)}</strong></div></div>;
const humanize = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase());
const formatCell = (value: any) => value === undefined || value === null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
