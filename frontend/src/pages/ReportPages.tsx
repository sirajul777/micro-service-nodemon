import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Filter, Trash2, Users, Wallet, X } from 'lucide-react';
import { reports } from '../api';

type ReportRecord = { date?: string; time?: string; username?: string; price?: number; profile?: string; comment?: string; resellerTag?: string };
type SellingResponse = { records?: ReportRecord[]; summary?: { totalVouchers?: number; totalIncome?: number; currency?: string }; resellerGroups?: Array<{ tag: string; vouchers: number; total: number }> };
type ResumeResponse = { daily?: Array<{ date: string; vouchers: number; total: number }>; summary?: { totalVouchers?: number; totalIncome?: number; currency?: string; month?: string; year?: string } };

function money(value: number | undefined, currency = 'Rp') { return `${currency} ${Number(value || 0).toLocaleString('id-ID')}`; }
function clampDate(v: string) { return v || new Date().toISOString().slice(0, 10); }

export function ReportSellingPage({ session }: { session: string }) {
  const [from, setFrom] = useState(() => clampDate(''));
  const [to, setTo] = useState(() => clampDate(''));
  const [prefix, setPrefix] = useState('');
  const [profile, setProfile] = useState('');
  const [comment, setComment] = useState('');
  const [reseller, setReseller] = useState('');
  const [data, setData] = useState<SellingResponse>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = async () => {
    if (!session) return;
    setLoading(true); setNotice('');
    try {
      const params: Record<string, string> = {};
      if (from === to) params.idhr = formatMonolithDate(from);
      if (prefix) params.prefix = prefix;
      if (profile) params.dataprofile = profile;
      if (comment) params.datacomments = comment;
      if (reseller) params.reseller = reseller;
      if (from !== to) params.idbl = `${formatMonth(from)}${from.slice(0, 4)}`;
      const result = await reports.selling(session, params) as SellingResponse;
      const records = result.records || [];
      const filtered = from !== to ? records.filter((r) => { const d = parseMonolithDate(r.date); return d >= from && d <= to; }) : records;
      setData({ ...result, records: filtered }); setPage(1);
    } catch (e: any) { setNotice(e?.message || 'Unable to load selling report.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [session]);

  const records = data.records || [];
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const visible = records.slice((page - 1) * pageSize, page * pageSize);
  const summary = data.summary || {};

  const clear = async () => {
    if (!window.confirm('Clear report records for this period?')) return;
    setLoading(true); setNotice('');
    try {
      const params = from === to ? { idhr: formatMonolithDate(from) } : { idbl: `${formatMonth(from)}${from.slice(0, 4)}` };
      await reports.clear(session, params); await load(); setNotice('Report records cleared.');
    } catch (e: any) { setNotice(e?.message || 'Unable to clear report.'); setLoading(false); }
  };

  return <div className="report-page">
    <div className="page-hero"><div><span className="eyebrow">SALES ANALYTICS</span><h3>Selling Report</h3><p>Voucher sales from the same report source used by the monolith.</p></div><button className="button danger" onClick={clear} disabled={loading}><Trash2 size={15}/> Clear</button></div>
    <div className="panel filter-panel"><div className="filter-head"><div><Filter size={16}/><b>Filters</b></div><span>{loading ? 'Loading…' : `${records.length} records`}</span></div><div className="filter-grid">
      <label><span>From</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
      <label><span>To</span><input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
      <label><span>Prefix</span><input value={prefix} onChange={e=>setPrefix(e.target.value)} placeholder="voucher prefix" /></label>
      <label><span>Profile</span><input value={profile} onChange={e=>setProfile(e.target.value)} placeholder="profile" /></label>
      <label><span>Comment</span><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="comment" /></label>
      <label><span>Reseller</span><input value={reseller} onChange={e=>setReseller(e.target.value)} placeholder="reseller" /></label>
      <button className="primary" disabled={loading} onClick={()=>void load()}><CalendarDays size={15}/> Apply Filter</button>
    </div></div>
    {notice && <div className="error banner">{notice}</div>}
    <div className="stats"><div className="stat"><div className="stat-icon"><Users size={18}/></div><div><span>Total Vouchers</span><strong>{summary.totalVouchers ?? records.length}</strong></div></div><div className="stat"><div className="stat-icon"><Wallet size={18}/></div><div><span>Total Income</span><strong>{money(summary.totalIncome, summary.currency)}</strong></div></div><div className="stat"><div className="stat-icon"><Users size={18}/></div><div><span>Reseller Groups</span><strong>{data.resellerGroups?.length ?? 0}</strong></div></div></div>
    <div className="panel"><div className="panel-head"><div><h3>Sales Records</h3><span>Paginated result set</span></div><span className="badge">{loading ? 'LOADING' : 'LIVE'}</span></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Username</th><th>Profile</th><th>Reseller</th><th>Price</th><th>Comment</th></tr></thead><tbody>{visible.map((r,i)=><tr key={`${r.username}-${r.date}-${i}`}><td>{r.date||'—'}</td><td>{r.time||'—'}</td><td><b>{r.username||'—'}</b></td><td>{r.profile||'—'}</td><td>{r.resellerTag||'—'}</td><td>{money(r.price, summary.currency)}</td><td>{r.comment||'—'}</td></tr>)}</tbody></table>{!visible.length&&<div className="empty">No selling records.</div>}</div><div className="report-pagination"><span>{records.length ? (page-1)*pageSize+1 : 0}-{Math.min(page*pageSize,records.length)} of {records.length}</span><div><button className="icon tiny" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>‹</button><b>{page}/{totalPages}</b><button className="icon tiny" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>›</button></div></div></div>
    {data.resellerGroups?.length ? <div className="panel"><div className="panel-head"><div><h3>Reseller Summary</h3><span>Grouped from report records</span></div></div><div className="table-wrap"><table><thead><tr><th>Reseller</th><th>Vouchers</th><th>Total</th></tr></thead><tbody>{data.resellerGroups.map(g=><tr key={g.tag}><td>{g.tag}</td><td>{g.vouchers}</td><td>{money(g.total, summary.currency)}</td></tr>)}</tbody></table></div></div> : null}
  </div>;
}

export function ReportResumePage({ session }: { session: string }) {
  const [data,setData] = useState<ResumeResponse>({}); const [idbl,setIdbl] = useState(''); const [loading,setLoading]=useState(false); const [notice,setNotice]=useState('');
  const load=async()=>{setLoading(true);setNotice('');try{setData(await reports.resume(session,idbl||undefined) as ResumeResponse)}catch(e:any){setNotice(e?.message||'Unable to load resume report.')}finally{setLoading(false)}};
  useEffect(()=>{if(session)void load()},[session]);
  const summary=data.summary||{};
  return <div className="report-page"><div className="page-hero"><div><span className="eyebrow">DAILY BREAKDOWN</span><h3>Resume Report</h3><p>Daily voucher and income summary for the selected month.</p></div><div className="page-hero-actions"><input className="month-input" value={idbl} onChange={e=>setIdbl(e.target.value)} placeholder="e.g. aug2026"/><button className="button primary" onClick={()=>void load()} disabled={loading}>Refresh</button></div></div>{notice&&<div className="error banner">{notice}</div>}<div className="stats"><div className="stat"><div><span>Total Vouchers</span><strong>{summary.totalVouchers??0}</strong></div></div><div className="stat"><div><span>Total Income</span><strong>{money(summary.totalIncome,summary.currency)}</strong></div></div><div className="stat"><div><span>Period</span><strong>{summary.month?`${summary.month}/${summary.year}`:'—'}</strong></div></div></div><div className="panel"><div className="panel-head"><div><h3>Daily Sales</h3><span>{loading?'Loading…':'Monolith-compatible daily summary'}</span></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Vouchers</th><th>Income</th></tr></thead><tbody>{(data.daily||[]).map(d=><tr key={d.date}><td>{d.date}</td><td>{d.vouchers}</td><td>{money(d.total,summary.currency)}</td></tr>)}</tbody></table></div></div></div>
}

function formatMonth(v:string){const m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][Math.max(0,Number(v.slice(5,7))-1)];return m || 'jan';}
function formatMonolithDate(v:string){const [y,m,d]=v.split('-'); return `${formatMonth(v)}/${d}/${y}`;}
function parseMonolithDate(v:string|undefined){if(!v)return '';const [m,d,y]=v.split('/');const idx=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m?.toLowerCase());return idx>=0?`${y}-${String(idx+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`:v;}

export function ReportPageTabs({ session, initial='selling' }: { session: string; initial?: 'selling'|'resume'|'live' }) {
  const [tab,setTab]=useState(initial);
  return <div className="report-tabs"><div className="tabbar"><button className={tab==='selling'?'active':''} onClick={()=>setTab('selling')}>Selling</button><button className={tab==='resume'?'active':''} onClick={()=>setTab('resume')}>Resume</button><button className={tab==='live'?'active':''} onClick={()=>setTab('live')}>Live</button></div>{tab==='selling'?<ReportSellingPage session={session}/>:tab==='resume'?<ReportResumePage session={session}/>:<LegacyLiveReport session={session}/>}</div>
}
function LegacyLiveReport({session}:{session:string}){const [data,setData]=useState<any>();useEffect(()=>{reports.live(session).then(setData).catch(()=>setData(null))},[session]);return <div className="stats"><div className="stat"><div><span>Today vouchers</span><strong>{data?.today?.vouchers??0}</strong></div></div><div className="stat"><div><span>Today income</span><strong>{money(data?.today?.income,data?.currency)}</strong></div></div><div className="stat"><div><span>Month vouchers</span><strong>{data?.month?.vouchers??0}</strong></div></div><div className="stat"><div><span>Month income</span><strong>{money(data?.month?.income,data?.currency)}</strong></div></div></div>}
