import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, Settings2, TestTube2 } from 'lucide-react';
import { payment } from '../api';
import { TableControlBar, useTableControls } from '../components/TableControls';

type Item = Record<string, any>;

const money = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `Rp ${n.toLocaleString('id-ID')}` : '—';
};

export default function PaymentManagementPage() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState('1000');
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async (nextStatus = status) => {
    setBusy(true); setMessage('');
    try {
      const [transactions, stats, cfg] = await Promise.all([
        payment.list(nextStatus),
        payment.stats(),
        payment.getConfig(),
      ]);
      setData({ transactions: Array.isArray(transactions?.transactions) ? transactions.transactions : Array.isArray(transactions) ? transactions : [], stats });
      setConfig(normalizeConfig(cfg));
    } catch (e: any) {
      setMessage(e?.message || 'Unable to load payment management.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);

  const saveConfig = async () => {
    setBusy(true); setMessage('');
    try { await payment.saveConfig(config); setMessage('Payment configuration saved.'); }
    catch (e: any) { setMessage(e?.message || 'Unable to save payment configuration.'); }
    finally { setBusy(false); }
  };

  const runTest = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await payment.test(Number(amount), profile);
      setMessage(result?.message || 'Payment test completed.');
    } catch (e: any) { setMessage(e?.message || 'Payment test failed.'); }
    finally { setBusy(false); }
  };

  const transactions: Item[] = data?.transactions || [];
  const controls = useTableControls({ rows: transactions });
  const stats = data?.stats || {};

  return <div className="payment-page stack">
    <div className="page-hero">
      <div><span className="eyebrow">PAYMENT OPERATIONS</span><h3>Payment Management</h3><p>Transactions, configuration, status checks, and payment testing.</p></div>
      <button className="button primary" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>
    </div>
    {message && <div className="error banner">{message}</div>}

    <div className="stats">
      <Metric title="Transactions" value={stats.total ?? stats.totalTransactions ?? transactions.length} />
      <Metric title="Pending" value={stats.pending ?? 0} />
      <Metric title="Success" value={stats.success ?? stats.paid ?? 0} />
      <Metric title="Revenue" value={money(stats.revenue ?? stats.totalAmount ?? 0)} />
    </div>

    <div className="payment-grid">
      <section className="panel">
        <div className="panel-head"><div><h3>Payment Transactions</h3><span>{controls.filtered.length} records</span></div><div className="panel-actions"><select value={status} onChange={(e) => { setStatus(e.target.value); void load(e.target.value); }}><option value="">All status</option><option value="pending">Pending</option><option value="success">Success</option><option value="failed">Failed</option></select><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div></div>
        <TableControlBar query={controls.query} onQueryChange={controls.setQuery} page={controls.page} totalPages={controls.totalPages} totalRows={controls.filtered.length} pageSize={controls.pageSize} onPrevious={controls.previous} onNext={controls.next} />
        <div className="table-wrap"><table><thead><tr><th>Order ID</th><th>Amount</th><th>Status</th><th>Profile</th><th>Created</th><th>Actions</th></tr></thead><tbody>{controls.visible.map((r, i) => <tr key={String(r.orderId || r.id || i)}><td><b>{formatCell(r.orderId || r.id)}</b></td><td>{money(r.amount)}</td><td>{formatCell(r.status)}</td><td>{formatCell(r.profile)}</td><td>{formatCell(r.createdAt)}</td><td><div className="row-actions"><button className="icon tiny" title="Check status" onClick={() => void runAction(() => payment.check(String(r.orderId || r.id)), setMessage, setBusy, load)}><CheckCircle2 size={14}/></button><button className="icon tiny" title="Details" onClick={async () => { try { setSelected(await payment.get(String(r.orderId || r.id))); } catch (e: any) { setMessage(e?.message || 'Unable to load detail.'); } }}><Eye size={14}/></button></div></td></tr>)}</tbody></table>{!controls.visible.length && <div className="empty">No payment transactions.</div>}</div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3><Settings2 size={15}/> Payment Configuration</h3><span>Stored payment settings</span></div><button className="button primary" onClick={saveConfig} disabled={busy}>Save</button></div>
        <div className="form-grid compact">{Object.entries(config).map(([key, value]) => <label key={key}><span>{humanize(key)}</span><input value={value} onChange={(e) => setConfig((current) => ({ ...current, [key]: e.target.value }))}/></label>)}</div>
        {!Object.keys(config).length && <div className="empty">No payment configuration exposed by the backend.</div>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-head"><div><h3><TestTube2 size={15}/> Payment Test</h3><span>Run the backend payment test flow without leaving the management page.</span></div></div>
      <div className="form-grid compact"><label><span>Amount</span><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}/></label><label><span>Profile</span><input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="hotspot profile"/></label></div>
      <div className="modal-actions"><button className="button primary" disabled={busy} onClick={() => void runTest()}>Run Payment Test</button></div>
    </section>

    {selected && <DetailModal item={selected} onClose={() => setSelected(null)}/>} 
  </div>;
}

function Metric({ title, value }: { title: string; value: unknown }) { return <div className="stat"><div><span>{title}</span><strong>{String(value)}</strong></div></div>; }
function normalizeConfig(value: any): Record<string, string> { if (!value || typeof value !== 'object') return {}; return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])); }
function humanize(v: string) { return v.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/^./, (m) => m.toUpperCase()); }
function formatCell(v: unknown) { if (v === undefined || v === null || v === '') return '—'; return typeof v === 'object' ? JSON.stringify(v) : String(v); }
async function runAction(fn: () => Promise<any>, setMessage: (value: string) => void, setBusy: (value: boolean) => void, reload: () => Promise<void>) { setBusy(true); setMessage(''); try { const result = await fn(); setMessage(result?.message || 'Operation completed.'); await reload(); } catch (e: any) { setMessage(e?.message || 'Operation failed.'); } finally { setBusy(false); } }
function DetailModal({ item, onClose }: { item: any; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal"><div className="modal-head"><div><span className="eyebrow">PAYMENT DETAIL</span><h3>{item?.orderId || item?.id || 'Transaction'}</h3></div><button className="icon" onClick={onClose}>×</button></div><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, padding: 18, maxHeight: 500, overflow: 'auto' }}>{JSON.stringify(item, null, 2)}</pre><div className="modal-actions"><button className="button secondary" onClick={onClose}>Close</button></div></div></div>; }
