import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw, Send, ShieldAlert, ShieldCheck, Users, Wallet } from 'lucide-react';

type Row = Record<string, any>;
const esc = (v: string) => encodeURIComponent(v);
const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
};
const post = (path: string, body: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });
const money = (v: unknown) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const cell = (v: unknown) => v == null || v === '' ? '—' : String(v);

export default function BillingPage() {
  const [sessions, setSessions] = useState<Row[]>([]);
  const [session, setSession] = useState('');
  const [tab, setTab] = useState<'customers'|'invoices'|'settlements'>('customers');
  const [data, setData] = useState<{stats: Row; customers: Row[]; invoices: Row[]; settlements: Row[]}>({ stats: {}, customers: [], invoices: [], settlements: [] });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [customer, setCustomer] = useState<Row>({ name: '', mikrotikUser: '', type: 'hotspot', profile: '', phone: '', telegramId: '', address: '', price: 0, billDate: 1, graceDays: 3, autoDisable: true, note: '' });

  const base = session ? `/api/billing/${esc(session)}` : '';
  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const [stats, customers, invoices, settlements] = await Promise.all([
        api(`${base}/stats`), api(`${base}/customers`), api(`${base}/invoices`), api(`${base}/settlements`),
      ]);
      setData({ stats: stats || {}, customers: Array.isArray(customers) ? customers : [], invoices: Array.isArray(invoices) ? invoices : [], settlements: Array.isArray(settlements) ? settlements : [] });
    } catch (e: any) { setNotice(e?.message || 'Unable to load billing data.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { (async () => { try { const r = await api('/api/sessions'); const rows = (r?.sessions ?? r ?? []) as Row[]; setSessions(rows); setSession(rows[0]?.id || ''); } catch (e: any) { setNotice(e?.message || 'Unable to load router sessions.'); } })(); }, []);
  useEffect(() => { void load(); }, [session]);

  const filtered = useMemo(() => {
    const rows = tab === 'customers' ? data.customers : tab === 'invoices' ? data.invoices : data.settlements;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!q || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))) && (!status || r.status === status));
  }, [data, tab, query, status]);

  const saveCustomer = async () => {
    if (!customer.name.trim()) { setNotice('Customer name is required.'); return; }
    setBusy(true); setNotice('');
    try { await post(`${base}/customers`, { ...customer }); setShowForm(false); setCustomer({ name: '', mikrotikUser: '', type: 'hotspot', profile: '', phone: '', telegramId: '', address: '', price: 0, billDate: 1, graceDays: 3, autoDisable: true, note: '' }); await load(); setNotice('Customer created.'); }
    catch (e: any) { setNotice(e?.message || 'Unable to create customer.'); } finally { setBusy(false); }
  };
  const action = async (label: string, fn: () => Promise<any>) => { setBusy(true); setNotice(''); try { const r = await fn(); setNotice(r?.message || `${label} completed.`); await load(); } catch (e: any) { setNotice(e?.message || `${label} failed.`); } finally { setBusy(false); } };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">BILLING OPERATIONS</span><h3>Customer & Billing</h3><p>Manage subscribers, monthly invoices, overdue access and collector settlements.</p></div><div className="top-actions"><button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <div className="router-box" style={{ margin: 0 }}><span>ROUTER SESSION</span><select value={session} onChange={e => setSession(e.target.value)}>{sessions.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</select></div>
    <div className="stats">
      <Metric icon={<Users size={18}/>} title="Customers" value={data.stats.totalCustomers ?? data.customers.length}/>
      <Metric icon={<ShieldCheck size={18}/>} title="Active" value={data.stats.activeCustomers ?? 0}/>
      <Metric icon={<ShieldAlert size={18}/>} title="Suspended" value={data.stats.suspended ?? 0}/>
      <Metric icon={<Wallet size={18}/>} title="Outstanding" value={money(data.stats.outstanding)}/>
    </div>
    <div className="panel">
      <div className="panel-head"><div><h3>Billing Workspace</h3><span>Monolith-aligned operational tabs</span></div><div className="panel-actions"><button className={tab==='customers'?'button primary':'button secondary'} onClick={()=>{setTab('customers');setStatus('')}}>Customers</button><button className={tab==='invoices'?'button primary':'button secondary'} onClick={()=>setTab('invoices')}>Invoices</button><button className={tab==='settlements'?'button primary':'button secondary'} onClick={()=>setTab('settlements')}>Settlements</button></div></div>
      <div className="table-controls"><div className="table-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${tab}...`}/></div><div className="panel-actions"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="verified">Verified</option></select>{tab==='customers'&&<button className="button primary" onClick={()=>setShowForm(true)}>Add Customer</button>}</div></div>
      <div className="table-wrap"><table><thead><tr>{tab==='customers'?<><th>Name</th><th>Type</th><th>MikroTik User</th><th>Profile</th><th>Price</th><th>Bill Day</th><th>Status</th><th>Access</th></>:tab==='invoices'?<><th>Customer</th><th>Period</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Paid By</th><th>Actions</th></>:<><th>Collector</th><th>Amount</th><th>Status</th><th>Created</th><th>Verified</th></>}</tr></thead>
      <tbody>{filtered.map((r,i)=>tab==='customers'?<tr key={r.id||i}><td><b>{cell(r.name)}</b></td><td>{cell(r.type)}</td><td>{cell(r.mikrotikUser)}</td><td>{cell(r.profile)}</td><td>{money(r.price)}</td><td>{cell(r.billDate)}</td><td>{cell(r.status)}</td><td><div className="row-actions">{r.status==='suspended'?<button className="icon tiny" title="Re-enable" disabled={busy} onClick={()=>void action('Re-enable',()=>post(`${base}/customers/${esc(r.id)}/re-enable`))}><ShieldCheck size={14}/></button>:<button className="icon tiny danger" title="Suspend" disabled={busy} onClick={()=>void action('Suspend',()=>post(`${base}/customers/${esc(r.id)}/suspend`))}><ShieldAlert size={14}/></button>}</div></td></tr>
      :tab==='invoices'?<tr key={r.id||i}><td><b>{cell(r.customerName)}</b></td><td>{cell(r.period)}</td><td>{money(r.amount)}</td><td>{cell(r.dueDate)}</td><td>{cell(r.status)}</td><td>{cell(r.paidBy)}</td><td><div className="row-actions">{r.status!=='paid'&&<button className="icon tiny" title="Mark paid" disabled={busy} onClick={()=>void action('Pay invoice',()=>post(`${base}/invoices/${esc(r.id)}/pay`,{paidBy:'Admin'}))}><CheckCircle2 size={14}/></button>}<button className="icon tiny" title="Send reminder" disabled={busy} onClick={()=>void action('Send reminder',()=>post(`${base}/invoices/${esc(r.id)}/send-reminder`))}><Send size={14}/></button></div></td></tr>
      :<tr key={r.id||i}><td><b>{cell(r.collectorName)}</b></td><td>{money(r.amount)}</td><td>{cell(r.status)}</td><td>{cell(r.createdAt)}</td><td>{cell(r.verifiedAt)}</td></tr>)}</tbody></table>{!filtered.length&&<div className="empty">No {tab} records found.</div>}</div>
      {tab==='invoices'&&<div className="panel-actions" style={{padding:16,borderTop:'1px solid #1d2631'}}><button className="button primary" disabled={busy} onClick={()=>void action('Generate monthly invoices',()=>post(`${base}/invoices/generate`))}><FileText size={15}/> Generate Monthly Invoices</button><button className="button secondary" disabled={busy} onClick={()=>void action('Run overdue',()=>post(`${base}/run-overdue`))}>Run Overdue</button></div>}
      {tab==='settlements'&&<SettlementForm base={base} onDone={load} busy={busy} setBusy={setBusy} setNotice={setNotice}/>} 
    </div>
    {showForm&&<CustomerModal value={customer} setValue={setCustomer} busy={busy} onClose={()=>setShowForm(false)} onSave={saveCustomer}/>} 
  </div>;
}
function Metric({icon,title,value}:{icon:React.ReactNode;title:string;value:unknown}){return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{title}</span><strong>{String(value)}</strong></div></div>}
function CustomerModal({value,setValue,busy,onClose,onSave}:{value:Row;setValue:(v:Row)=>void;busy:boolean;onClose:()=>void;onSave:()=>void}){const field=(key:string,label:string,type='text')=><label><span>{label}</span><input type={type} value={value[key] ?? ''} onChange={e=>setValue({...value,[key]:e.target.value})}/></label>;return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">NEW BILLING CUSTOMER</span><h3>Add Customer</h3></div><button className="icon" onClick={onClose}>×</button></div><form onSubmit={e=>{e.preventDefault();onSave()}}><div className="form-grid">{field('name','Name')}{field('mikrotikUser','MikroTik User')}{field('type','Type')}{field('profile','Profile')}{field('phone','Phone')}{field('telegramId','Telegram ID')}{field('address','Address')}{field('price','Monthly Price','number')}{field('billDate','Billing Day','number')}{field('graceDays','Grace Days','number')}{field('note','Note')}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>Save Customer</button></div></form></div></div>}
function SettlementForm({base,onDone,busy,setBusy,setNotice}:{base:string;onDone:()=>Promise<void>|void;busy:boolean;setBusy:(v:boolean)=>void;setNotice:(v:string)=>void}){const[name,setName]=useState('');const[amount,setAmount]=useState('0');return <div className="panel-actions" style={{padding:16,borderTop:'1px solid #1d2631'}}><input value={name} onChange={e=>setName(e.target.value)} placeholder="Collector name"/><input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount"/><button className="button primary" disabled={busy||!name} onClick={async()=>{setBusy(true);try{await post(`${base}/settlements/submit`,{collectorName:name,amount:Number(amount)});setNotice('Settlement submitted.');setName('');setAmount('0');await onDone()}catch(e:any){setNotice(e?.message||'Settlement failed.')}finally{setBusy(false)}}}>Submit Settlement</button><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const rows=await api(`${base}/settlements`);setNotice(`${Array.isArray(rows)?rows.length:0} settlement records.`)}catch(e:any){setNotice(e?.message||'Unable to load settlements.')}finally{setBusy(false)}}}>Refresh</button></div>}
