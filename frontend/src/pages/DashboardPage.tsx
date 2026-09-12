import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, CircleDollarSign, Cpu, HardDrive, Laptop, List, Pause, Play, Plug, RefreshCw, Server, Ticket, Users, Wifi } from 'lucide-react';
import { reports, router } from '../api';
import './dashboard-parity.css';

type Row = Record<string, any>;

type Props = { session?: string };

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function numberValue(value: any) {
  const n = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatBytes(value: any) {
  const n = numberValue(value);
  if (!n) return '0 B';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

function formatRate(value: any) {
  const n = numberValue(value);
  if (!n) return '0 Mbps';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)} Mbps`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)} Kbps`;
  return `${n.toFixed(0)} bps`;
}

function currency(value: any, symbol = 'Rp') {
  return `${symbol} ${Math.round(numberValue(value)).toLocaleString('id-ID')}`;
}

function readSessionFromDom() {
  return document.querySelector<HTMLSelectElement>('.router-box select')?.value || '';
}

function StatBox({ kind, value, label, icon }: { kind: string; value: string; label: string; icon: React.ReactNode }) {
  return <div className={`dashboard-sbc ${kind}`}><div className="dashboard-sbc-icon">{icon}</div><div><div className="dashboard-sbc-val">{value}</div><div className="dashboard-sbc-lbl">{label}</div></div></div>;
}

function NetStat({ kind, value, label, icon }: { kind: string; value: string | number; label: string; icon: React.ReactNode }) {
  return <div className="dashboard-ns"><div className={`dashboard-ns-ico ${kind}`}>{icon}</div><div><div className="dashboard-ns-val">{value}</div><div className="dashboard-ns-lbl">{label}</div></div></div>;
}

function Progress({ label, value, percent, danger }: { label: string; value: string; percent: number; danger?: boolean }) {
  return <div className="dashboard-bar-row"><div className="dashboard-bar-label"><span>{label}</span><b>{value}</b></div><div className="dashboard-bar"><div className={`dashboard-bar-fill ${danger ? 'red' : percent > 80 ? 'yellow' : 'green'}`} style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}/></div></div>;
}

function TrafficCard({ session }: { session: string }) {
  const [interfaces, setInterfaces] = useState<Row[]>([]);
  const [selected, setSelected] = useState('');
  const [traffic, setTraffic] = useState<Row | null>(null);
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState<{ tx: number; rx: number }[]>([]);
  const [countdown, setCountdown] = useState(5);

  const loadInterfaces = async () => {
    if (!session) return;
    try {
      const result = await router.interfaces(session);
      const rows = Array.isArray(result) ? result : result?.interfaces || result?.data || [];
      setInterfaces(rows);
      setSelected(current => current && rows.some((r: Row) => String(r.name || r.id) === current) ? current : String(rows[0]?.name || rows[0]?.id || ''));
    } catch { setInterfaces([]); setSelected(''); setTraffic(null); }
  };

  const loadTraffic = async () => {
    if (!session || !selected || paused) return;
    try {
      const result = await router.interfaceTraffic(session, selected);
      const next = result?.traffic || result?.data || result || null;
      setTraffic(next);
      const tx = numberValue(next?.tx ?? next?.txRate ?? next?.tx_rate ?? next?.txBps);
      const rx = numberValue(next?.rx ?? next?.rxRate ?? next?.rx_rate ?? next?.rxBps);
      setHistory(current => [...current.slice(-19), { tx, rx }]);
      setCountdown(5);
    } catch { /* keep last good sample */ }
  };

  useEffect(() => { setInterfaces([]); setSelected(''); setTraffic(null); setHistory([]); void loadInterfaces(); }, [session]);
  useEffect(() => {
    if (!session || !selected) return;
    void loadTraffic();
    if (paused) return;
    const timer = window.setInterval(() => { setCountdown(v => v <= 1 ? 5 : v - 1); }, 1000);
    const poll = window.setInterval(() => { void loadTraffic(); }, 5000);
    return () => { window.clearInterval(timer); window.clearInterval(poll); };
  }, [session, selected, paused]);

  const field = (keys: string[]) => { for (const key of keys) if (traffic?.[key] !== undefined && traffic?.[key] !== null && traffic?.[key] !== '') return traffic[key]; return 0; };
  const max = Math.max(1, ...history.flatMap(p => [p.tx, p.rx]));
  const chartPoints = (key: 'tx' | 'rx') => history.map((p, i) => `${(i / Math.max(1, history.length - 1)) * 100},${100 - (p[key] / max) * 82}`).join(' ');
  const currentName = selected || '—';

  return <section className="dashboard-traffic-card">
    <div className="dashboard-traffic-head">
      <div className="dashboard-traffic-title-wrap"><div className="dashboard-traffic-icon"><Activity size={15}/></div><div><div className="dashboard-traffic-title">Trafik Interface</div><div className="dashboard-traffic-live">Live · 5s</div></div></div>
      <div className="dashboard-traffic-actions">
        <select value={selected} onChange={e => { setSelected(e.target.value); setTraffic(null); setHistory([]); }}><option value="">— Pilih Interface —</option>{interfaces.map((r, i) => <option key={String(r.name || r.id || i)} value={String(r.name || r.id || '')}>{r.name || r.id || `Interface ${i + 1}`}</option>)}</select>
        <span className="dashboard-countdown">{countdown}s</span>
        <button className="dashboard-icon-btn" onClick={() => setPaused(v => !v)} title={paused ? 'Resume' : 'Pause'}>{paused ? <Play size={13}/> : <Pause size={13}/>}</button>
        <button className="dashboard-icon-btn" onClick={() => void loadTraffic()} title="Refresh"><RefreshCw size={13}/></button>
      </div>
    </div>
    {!selected ? <div className="dashboard-traffic-empty"><Plug size={28}/><span>Pilih router dan interface untuk melihat trafik realtime</span></div> : <>
      <div className="dashboard-speed-grid"><div className="dashboard-speed-pill tx"><i/><div><b>{formatRate(field(['tx', 'txRate', 'tx_rate', 'txBps']))}</b><span>UPLOAD (TX)</span></div></div><div className="dashboard-speed-pill rx"><i/><div><b>{formatRate(field(['rx', 'rxRate', 'rx_rate', 'rxBps']))}</b><span>DOWNLOAD (RX)</span></div></div></div>
      <div className="dashboard-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Interface traffic chart"><path d="M0 20H100 M0 40H100 M0 60H100 M0 80H100" className="grid-line"/><polyline points={chartPoints('tx') || '0,100 100,100'} className="tx-line" fill="none"/><polyline points={chartPoints('rx') || '0,100 100,100'} className="rx-line" fill="none"/></svg></div>
      <div className="dashboard-traffic-stats"><div><span>Peak TX</span><b>{formatRate(Math.max(0, ...history.map(p => p.tx)))}</b></div><div><span>Peak RX</span><b>{formatRate(Math.max(0, ...history.map(p => p.rx)))}</b></div><div><span>Avg TX</span><b>{formatRate(history.length ? history.reduce((s, p) => s + p.tx, 0) / history.length : 0)}</b></div><div><span>Avg RX</span><b>{formatRate(history.length ? history.reduce((s, p) => s + p.rx, 0) / history.length : 0)}</b></div><div className="dashboard-iface-name"><span>Interface</span><b>{currentName}</b></div></div>
    </>}
  </section>;
}

export default function DashboardPage({ session: propSession = '' }: Props) {
  const [session, setSession] = useState(propSession || readSessionFromDom());
  const [dash, setDash] = useState<Row | null>(null);
  const [live, setLive] = useState<Row | null>(null);
  const [pppActive, setPppActive] = useState<Row[]>([]);
  const [pppSecrets, setPppSecrets] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | 'hs' | 'ppp'>('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (propSession) { setSession(propSession); return; }
    const select = document.querySelector<HTMLSelectElement>('.router-box select');
    if (!select) return;
    const sync = () => setSession(select.value || '');
    sync(); select.addEventListener('change', sync); return () => select.removeEventListener('change', sync);
  }, [propSession]);

  const load = async () => {
    if (!session) return;
    setBusy(true);
    const [dashboard, liveReport, active, secrets, hotspotLogs] = await Promise.all([
      router.dashboard(session).catch(() => null), reports.live(session).catch(() => null), router.pppActive(session).catch(() => []), router.pppSecrets(session).catch(() => []), router.hotspotLog(session).catch(() => []),
    ]);
    setDash(dashboard || null); setLive(liveReport || null);
    setPppActive(Array.isArray(active) ? active : active?.connections || []);
    setPppSecrets(Array.isArray(secrets) ? secrets : secrets?.secrets || []);
    setLogs((Array.isArray(hotspotLogs) ? hotspotLogs : hotspotLogs?.logs || []).slice(0, 100));
    setBusy(false);
  };

  useEffect(() => { setDash(null); setLive(null); setPppActive([]); setPppSecrets([]); setLogs([]); void load(); const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer); }, [session]);

  const resource = dash?.resource || {};
  const currencyCode = live?.currency || 'Rp';
  const today = live?.today || {};
  const month = live?.month || {};
  const cpu = numberValue(resource['cpu-load'] ?? resource.cpuLoad);
  const memFree = numberValue(resource['free-memory'] ?? resource.freeMemory);
  const memTotal = Math.max(1, numberValue(resource['total-memory'] ?? resource.totalMemory));
  const hddFree = numberValue(resource['free-hdd-space'] ?? resource.freeHdd);
  const hddTotal = Math.max(1, numberValue(resource['total-hdd-space'] ?? resource.totalHdd));
  const memPct = Math.round((1 - memFree / memTotal) * 100);
  const hddPct = Math.round((1 - hddFree / hddTotal) * 100);
  const visibleLogs = useMemo(() => logs.filter(log => { const msg = String(log.message || ''); if (filter === 'hs') return !/ppp|pppoe/i.test(msg); if (filter === 'ppp') return /ppp|pppoe/i.test(msg); return true; }), [logs, filter]);
  const identity = dash?.identity || '—';
  const board = [resource['board-name'] || resource.boardName, resource['architecture-name'] || resource.architectureName].filter(Boolean).join(' · ');

  return <div className="dashboard-parity">
    <div className="dashboard-stat-bar"><StatBox kind="green" value={currency(today.income, currencyCode)} label="Revenue Hari Ini" icon={<CircleDollarSign size={17}/>}/><StatBox kind="cyan" value={currency(month.income, currencyCode)} label="Revenue Bulan Ini" icon={<CalendarDays size={17}/>}/></div>
    <div className="dashboard-stat-bar"><StatBox kind="blue" value={String(today.vouchers ?? '—')} label="Voucher Hari Ini" icon={<Ticket size={17}/>}/><StatBox kind="purple" value={String(month.vouchers ?? '—')} label="Voucher Bulan Ini" icon={<Ticket size={17}/>}/></div>
    <div className="dashboard-main-grid">
      <div>
        <div className="dashboard-net-grid">
          <div className="dashboard-net-panel"><div className="dashboard-net-label"><Wifi size={13}/> HOTSPOT</div><div className="dashboard-net-stats"><NetStat kind="green" value={dash?.hotspot?.total ?? '—'} label="Total User" icon={<Users size={16}/>}/><NetStat kind="blue" value={dash?.hotspot?.active ?? '—'} label="Online" icon={<Laptop size={16}/>}/></div></div>
          <div className="dashboard-net-panel"><div className="dashboard-net-label"><Plug size={13}/> PPPOE</div><div className="dashboard-net-stats"><NetStat kind="purple" value={pppSecrets.length || '—'} label="Total User" icon={<Users size={16}/>}/><NetStat kind="orange" value={pppActive.length || '—'} label="Online" icon={<Plug size={16}/>}/></div></div>
        </div>
        <div className="dashboard-card"><div className="dashboard-card-head"><span><List size={15}/> Log Aktivitas Sistem</span><button className="dashboard-icon-btn" onClick={() => void load()}><RefreshCw size={13} className={busy ? 'spin' : ''}/></button></div><div className="dashboard-log-filters">{(['all', 'hs', 'ppp'] as const).map(k => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{k === 'all' ? 'Semua' : k === 'hs' ? 'Hotspot' : 'PPPoE'} <b>{k === 'all' ? logs.length : logs.filter(l => k === 'ppp' ? /ppp|pppoe/i.test(String(l.message || '')) : !/ppp|pppoe/i.test(String(l.message || ''))).length}</b></button>)}</div><div className="dashboard-log-list">{visibleLogs.length ? visibleLogs.map((log, i) => <div className="dashboard-log-item" key={String(log.id || i)}><span className="dashboard-log-time">{log.time || '—'}</span><span className={`dashboard-log-tag ${/ppp|pppoe/i.test(String(log.message || '')) ? 'ppp' : 'hs'}`}>{/ppp|pppoe/i.test(String(log.message || '')) ? 'PPPoE' : 'Hotspot'}</span><span>{log.message || '—'}</span></div>) : <div className="dashboard-empty">{busy ? 'Loading...' : 'Belum ada aktivitas.'}</div>}</div></div>
      </div>
      <div>
        <div className="dashboard-card dashboard-router-card"><div className="dashboard-card-head"><span><Server size={15}/> Status Router</span><button className="dashboard-icon-btn" onClick={() => void load()}><RefreshCw size={13} className={busy ? 'spin' : ''}/></button></div>{!session ? <div className="dashboard-empty">Pilih router dulu</div> : <div className="dashboard-router-status"><div className="dashboard-router-head"><div><b>{identity}</b><small>{board || 'RouterOS'}</small></div><span><i/> Online</span></div><div className="dashboard-router-info">RouterOS {resource.version || dash?.rosVersion || '—'} · Uptime {resource.uptime || '—'}</div><Progress label="CPU" value={`${cpu}%`} percent={cpu} danger={cpu > 90}/><Progress label="Memory" value={`${formatBytes(memFree)} free / ${formatBytes(memTotal)}`} percent={memPct} danger={memPct > 90}/><Progress label="Storage" value={`${formatBytes(hddFree)} free / ${formatBytes(hddTotal)}`} percent={hddPct} danger={hddPct > 90}/></div>}</div>
        <TrafficCard session={session}/>
      </div>
    </div>
    <div className="dashboard-footer-note"><Cpu size={12}/> {months[new Date().getMonth()]} {new Date().getFullYear()} · {session || 'No router selected'} · {busy ? 'Syncing…' : 'Live'}</div>
  </div>;
}
