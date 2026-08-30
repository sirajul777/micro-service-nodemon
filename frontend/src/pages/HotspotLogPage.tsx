import { useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Search } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Props = { session: string; };

const topicOptions = [
  { value: '', label: 'All topics' },
  { value: 'hotspot', label: 'Hotspot' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

export default function HotspotLogPage({ session }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (selectedTopic = topic) => {
    if (!session) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await router.hotspotLog(session, selectedTopic);
      setRows(Array.isArray(result) ? result : result?.logs || result?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load hotspot logs.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(''); }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const value = (row: Row, keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return '—';
  };

  const setTopicAndReload = async (nextTopic: string) => {
    setTopic(nextTopic);
    await load(nextTopic);
  };

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">ROUTEROS EVENTS</span><h3>Hotspot Log</h3><p>Inspect recent hotspot events and messages from the active RouterOS instance.</p></div>
      <div className="top-actions"><button className="button" disabled={busy || !session} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><FileText size={15}/> Event Log</h3><span>{visible.length} of {rows.length} entries</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls">
        <div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search time, topic, message..."/></div>
        <div className="panel-actions"><select value={topic} onChange={e => { void setTopicAndReload(e.target.value); }} aria-label="Filter topic">{topicOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Time</th><th>Topics</th><th>Message</th></tr></thead>
        <tbody>{visible.map((row, i) => <tr key={String(row.id || `${value(row, ['time', 'timestamp'])}-${i}`)}><td>{value(row, ['time', 'timestamp', 'createdAt'])}</td><td>{value(row, ['topics', 'topic'])}</td><td className="code-cell">{value(row, ['message', 'msg'])}</td></tr>)}</tbody>
      </table>{!visible.length && <div className="empty">No hotspot log entries found.</div>}</div>
    </section>
  </div>;
}
