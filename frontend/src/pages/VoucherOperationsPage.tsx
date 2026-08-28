import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Plus, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import { router, voucher } from '../api';

type Row = Record<string, any>;

type Props = { session: string };

const emptyBatch = { profileName: '', profileColor: '#2563eb', price: '', validity: '', caption: '', createdBy: 'Admin', quantity: '10' };

export default function VoucherOperationsPage({ session }: Props) {
  const [tab, setTab] = useState<'batches' | 'types'>('batches');
  const [batches, setBatches] = useState<Row[]>([]);
  const [types, setTypes] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showBatch, setShowBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({ ...emptyBatch });

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const [b, t] = await Promise.all([session ? voucher.batches(session) : Promise.resolve([]), voucher.voucherTypes()]);
      setBatches(Array.isArray(b) ? b : b?.batches || []);
      setTypes(Array.isArray(t) ? t : t?.types || t?.data || []);
    } catch (e: any) { setNotice(e?.message || 'Unable to load voucher data.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [session]);

  const filtered = useMemo(() => {
    const source = tab === 'batches' ? batches : types;
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [tab, batches, types, query]);

  const createBatch = async () => {
    if (!session || !batchForm.profileName.trim()) { setNotice('Profile name is required.'); return; }
    setBusy(true); setNotice('');
    try {
      const qty = Math.max(1, Number(batchForm.quantity) || 1);
      await voucher.createBatch(session, { ...batchForm, price: batchForm.price ? Number(batchForm.price) : 0, quantity: qty, qty, totalPrice: (Number(batchForm.price) || 0) * qty, sessionId: session });
      setShowBatch(false); setBatchForm({ ...emptyBatch }); await load(); setNotice('Voucher batch created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to create voucher batch.'); setBusy(false); }
  };
  const deleteBatch = async (id: string) => {
    if (!window.confirm(`Delete voucher batch "${id}"?`)) return;
    setBusy(true); setNotice('');
    try { await voucher.deleteBatch(session, id, false); await load(); setNotice(`Batch ${id} deleted.`); }
    catch (e: any) { setNotice(e?.message || 'Unable to delete batch.'); setBusy(false); }
  };
  const sync = async (auto = false) => {
    if (!session) return;
    setBusy(true); setNotice('');
    try { const result = auto ? await voucher.autoSyncUsed(session) : await voucher.syncUsed(session); await load(); setNotice(`${auto ? 'Auto-sync' : 'Sync'} complete${result?.updated != null ? `: ${result.updated} updated.` : '.'}`); }
    catch (e: any) { setNotice(e?.message || 'Unable to sync voucher status.'); setBusy(false); }
  };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">VOUCHER MANAGEMENT</span><h3>Voucher Operations</h3><p>Manage voucher batches, status synchronization, and voucher types.</p></div><div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>{tab === 'batches' && <><button className="button" disabled={busy || !session} onClick={() => void sync(false)}><RotateCcw size={15}/> Sync Used</button><button className="button" disabled={busy || !session} onClick={() => void sync(true)}><CheckCircle2 size={15}/> Auto Sync</button><button className="button primary" disabled={busy || !session} onClick={() => setShowBatch(true)}><Plus size={15}/> Add Batch</button></>}</div></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3>{tab === 'batches' ? 'Voucher Batches' : 'Voucher Types'}</h3><span>{filtered.length} records</span></div><div className="panel-actions"><button className={tab === 'batches' ? 'button primary' : 'button secondary'} onClick={() => { setTab('batches'); setQuery(''); }}>Batches</button><button className={tab === 'types' ? 'button primary' : 'button secondary'} onClick={() => { setTab('types'); setQuery(''); }}>Types</button><div className="search"><Search size={14}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search vouchers..."/></div></div></div>
      <div className="table-wrap"><table><thead>{tab === 'batches' ? <tr><th>ID</th><th>Profile</th><th>Price</th><th>Validity</th><th>Status</th><th>Created</th><th>Stats</th><th>Actions</th></tr> : <tr><th>Name</th><th>Price</th><th>Duration</th><th>Profile</th><th>Enabled</th><th>Actions</th></tr>}</thead><tbody>{filtered.map((r, i) => tab === 'batches' ? <tr key={String(r.id || i)}><td>{r.id || '—'}</td><td>{r.profileName || r.profile || '—'}</td><td>{r.price ?? '—'}</td><td>{r.validity || '—'}</td><td>{r.status || (r.stats?.remaining != null ? 'active' : '—')}</td><td>{r.createdAt || '—'}</td><td>{r.stats ? `${r.stats.used ?? 0} used / ${r.stats.remaining ?? 0} left` : '—'}</td><td><button className="icon tiny danger" disabled={busy} onClick={() => void deleteBatch(String(r.id))}><Trash2 size={14}/></button></td></tr> : <tr key={String(r.id || r.name || i)}><td><b>{r.name || '—'}</b></td><td>{r.price ?? '—'}</td><td>{r.duration || r.validity || '—'}</td><td>{r.profile || '—'}</td><td>{r.enabled === false || r.enabled === 'false' ? 'No' : 'Yes'}</td><td><button className="button secondary" disabled={busy} onClick={async () => { try { setBusy(true); await voucher.toggleVoucherType(String(r.id)); await load(); } catch (e:any) { setNotice(e?.message || 'Unable to toggle type.'); setBusy(false); } }}>{r.enabled === false || r.enabled === 'false' ? 'Enable' : 'Disable'}</button><button className="icon tiny danger" disabled={busy} onClick={async () => { if (!window.confirm(`Delete voucher type "${r.name}"?`)) return; try { setBusy(true); await voucher.deleteVoucherType(String(r.id)); await load(); } catch (e:any) { setNotice(e?.message || 'Unable to delete voucher type.'); setBusy(false); } }}><Trash2 size={14}/></button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">No voucher records found.</div>}</div>
    </section>
    {showBatch && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">VOUCHER BATCH</span><h3>Create Batch</h3></div><button className="icon" onClick={() => setShowBatch(false)}>×</button></div><form onSubmit={e => { e.preventDefault(); void createBatch(); }}><div className="form-grid"><Field label="Profile" value={batchForm.profileName} onChange={v => setBatchForm(f => ({ ...f, profileName: v }))}/><Field label="Quantity" value={batchForm.quantity} type="number" onChange={v => setBatchForm(f => ({ ...f, quantity: v }))}/><Field label="Price" value={batchForm.price} type="number" onChange={v => setBatchForm(f => ({ ...f, price: v }))}/><Field label="Validity" value={batchForm.validity} onChange={v => setBatchForm(f => ({ ...f, validity: v }))}/><Field label="Caption" value={batchForm.caption} onChange={v => setBatchForm(f => ({ ...f, caption: v }))}/><Field label="Color" value={batchForm.profileColor} onChange={v => setBatchForm(f => ({ ...f, profileColor: v }))}/></div><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowBatch(false)}>Cancel</button><button className="button primary" disabled={busy}><Plus size={15}/> Create Batch</button></div></form></div></div>}
  </div>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)}/></label>; }
