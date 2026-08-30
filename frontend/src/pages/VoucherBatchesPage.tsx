import { useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Search, Trash2, Upload, Zap } from 'lucide-react';
import { voucher } from '../api';

type Row = Record<string, any>;

export default function VoucherBatchesPage({ session }: { session: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const result: any = await voucher.batches(session);
      setRows(Array.isArray(result) ? result : result?.batches || result?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load voucher batches.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const sync = async (auto = false) => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const result = auto ? await voucher.autoSyncUsed(session) : await voucher.syncUsed(session);
      if (result?.success === false) throw new Error(result.error || 'Sync failed.');
      await load();
      setNotice(auto ? 'Auto-sync completed.' : 'Voucher usage sync completed.');
    } catch (e: any) { setNotice(e?.message || 'Unable to sync voucher usage.'); setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm(`Delete voucher batch "${id}"?`)) return;
    setBusy(true); setNotice('');
    try {
      const result = await voucher.deleteBatch(session, id, false);
      if (result?.success === false) throw new Error(result.error || 'Delete failed.');
      await load(); setNotice(`Batch ${id} deleted.`);
    } catch (e: any) { setNotice(e?.message || 'Unable to delete voucher batch.'); setBusy(false); }
  };

  const markUsed = async (row: Row) => {
    const id = String(row.id ?? '');
    const username = String(row.username ?? row.name ?? '');
    if (!id || !username) { setNotice('Batch ID and username are required.'); return; }
    const usedBy = window.prompt('Used by (optional):', '') ?? '';
    setBusy(true); setNotice('');
    try {
      const result = await voucher.markUsed(session, id, username, usedBy);
      if (result?.success === false) throw new Error(result.error || 'Mark-used failed.');
      await load(); setNotice(`Voucher ${username} marked as used.`);
    } catch (e: any) { setNotice(e?.message || 'Unable to mark voucher used.'); setBusy(false); }
  };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">VOUCHER OPERATIONS</span><h3>Voucher Batches</h3><p>Track generated batches and synchronize voucher usage with RouterOS.</p></div>
      <div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button" disabled={busy} onClick={() => void sync(false)}><Upload size={15}/> Sync Used</button><button className="button primary" disabled={busy} onClick={() => void sync(true)}><Zap size={15}/> Auto Sync</button></div>
    </div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3><FileText size={15}/> Batches</h3><span>{visible.length} of {rows.length} batches</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search batch, profile, status..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Profile</th><th>Qty</th><th>Created</th><th>Used</th><th>Actions</th></tr></thead><tbody>
        {visible.map((r, i) => { const id = String(r.id ?? r.batchId ?? i); return <tr key={id}><td><b>{id}</b></td><td>{r.name || '—'}</td><td>{r.status || '—'}</td><td>{r.profile || '—'}</td><td>{r.qty ?? r.count ?? '—'}</td><td>{r.createdAt || r.created_at || '—'}</td><td>{r.used ?? r.usedCount ?? '—'}</td><td><div className="row-actions"><button className="button" disabled={busy} onClick={() => void markUsed(r)}>Mark Used</button><button className="icon tiny danger" disabled={busy} title="Delete" onClick={() => void remove(id)}><Trash2 size={14}/></button></div></td></tr>; })}
      </tbody></table>{!visible.length && <div className="empty">No voucher batches found.</div>}</div>
    </section>
  </div>;
}
