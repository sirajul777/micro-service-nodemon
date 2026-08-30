import { useEffect, useState } from 'react';
import { Cpu, HardDrive, MemoryStick, RefreshCw, Server } from 'lucide-react';
import { router } from '../api';

type Props = { session: string };
type Row = Record<string, any>;

const pick = (row: Row, keys: string[], fallback = '—') => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return fallback;
};

const formatBytes = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '—');
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = n / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i += 1; }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[i]}`;
};

export default function SystemResourcePage({ session }: Props) {
  const [resource, setResource] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const result = await router.systemResource(session);
      setResource((result?.resource || result?.data || result || {}) as Row);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load system resource.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const cpu = pick(resource, ['cpuLoad', 'cpu-load', 'cpu']);
  const freeMemory = pick(resource, ['freeMemory', 'free-memory']);
  const totalMemory = pick(resource, ['totalMemory', 'total-memory']);
  const freeHdd = pick(resource, ['freeHdd', 'free-hdd', 'freeDisk']);
  const totalHdd = pick(resource, ['totalHdd', 'total-hdd', 'totalDisk']);

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">ROUTEROS HEALTH</span><h3>System Resource</h3><p>Inspect CPU, memory, storage, uptime and RouterOS version for the active router.</p></div>
      <div className="top-actions"><button className="button" disabled={busy || !session} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="stats">
      <div className="stat"><div className="stat-icon"><Cpu size={18}/></div><div><span>CPU Load</span><strong>{String(cpu)}{String(cpu) !== '—' && !String(cpu).includes('%') ? '%' : ''}</strong></div></div>
      <div className="stat"><div className="stat-icon"><MemoryStick size={18}/></div><div><span>Free Memory</span><strong>{formatBytes(freeMemory)}</strong></div><small>Total {formatBytes(totalMemory)}</small></div>
      <div className="stat"><div className="stat-icon"><HardDrive size={18}/></div><div><span>Free Storage</span><strong>{formatBytes(freeHdd)}</strong></div><small>Total {formatBytes(totalHdd)}</small></div>
      <div className="stat"><div className="stat-icon"><Server size={18}/></div><div><span>Uptime</span><strong>{String(pick(resource, ['uptime']))}</strong></div><small>Version {String(pick(resource, ['version']))}</small></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Router Details</h3><span>Current RouterOS system resource snapshot</span></div><span className="badge">{busy ? 'LOADING' : 'LIVE'}</span></div>
      <div className="grid">
        <div className="metric"><span>Board</span><b>{String(pick(resource, ['boardName', 'board-name']))}</b></div>
        <div className="metric"><span>Architecture</span><b>{String(pick(resource, ['architectureName', 'architecture-name', 'architecture']))}</b></div>
        <div className="metric"><span>Build Time</span><b>{String(pick(resource, ['buildTime', 'build-time']))}</b></div>
        <div className="metric"><span>Platform</span><b>{String(pick(resource, ['platform']))}</b></div>
      </div>
    </section>
  </div>;
}
