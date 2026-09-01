import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Router, Search, Trash2, X } from 'lucide-react';
import { router } from '../api';

type Session = Record<string, any>;
type Form = { id:string; name:string; ip:string; port:string; user:string; password:string; hotspotName:string; dnsName:string; currency:string; reloadInterval:string; iface:string; idleTo:string; livereport:string };
const blank:Form={id:'',name:'',ip:'',port:'8728',user:'admin',password:'',hotspotName:'',dnsName:'',currency:'Rp',reloadInterval:'10',iface:'ether1',idleTo:'0',livereport:'enable'};
const asForm=(s:Session):Form=>({...blank,id:String(s.id||''),name:String(s.name||''),ip:String(s.ip||''),port:String(s.port??8728),user:String(s.user||''),hotspotName:String(s.hotspotName||''),dnsName:String(s.dnsName||''),currency:String(s.currency||'Rp'),reloadInterval:String(s.reloadInterval??10),iface:String(s.iface||'ether1'),idleTo:String(s.idleTo??0),livereport:String(s.livereport||'enable')});

export default function RouterSessionsPage(){
  const[rows,setRows]=useState<Session[]>([]);
  const[query,setQuery]=useState('');
  const[editor,setEditor]=useState(false);
  const[form,setForm]=useState<Form>(blank);
  const[busy,setBusy]=useState(false);
  const[testing,setTesting]=useState('');
  const[notice,setNotice]=useState('');
  const[activeId,setActiveId]=useState('');

  const load=async()=>{setBusy(true);setNotice('');try{const data=await router.sessions();const list=Array.isArray(data)?data:data?.sessions;const normalized=Array.isArray(list)?list:[];setRows(normalized);setActiveId(current=>current&&normalized.some(r=>String(r.id)===current)?current:String(normalized[0]?.id||''));}catch(e:any){setNotice(e?.message||'Unable to load router sessions.')}finally{setBusy(false)}};
  useEffect(()=>{void load()},[]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?rows.filter(r=>[r.id,r.name,r.ip,r.user,r.port,r.currency].some(v=>String(v??'').toLowerCase().includes(q))):rows},[rows,query]);
  const save=async()=>{if(!form.id||!form.name||!form.ip||!form.user){setNotice('Session ID, router name, IP, and username are required.');return}setBusy(true);setNotice('');try{await router.saveSession({...form,port:Number(form.port)||8728,reloadInterval:Number(form.reloadInterval)||10,idleTo:Number(form.idleTo)||0});setEditor(false);await load();setNotice('Router session saved.')}catch(e:any){setNotice(e?.message||'Unable to save router session.')}finally{setBusy(false)}};
  const remove=async(id:string)=>{if(!window.confirm(`Delete router session ${id}?`))return;setBusy(true);setNotice('');try{await router.deleteSession(id);if(activeId===id)setActiveId('');await load();setNotice('Router session deleted.')}catch(e:any){setNotice(e?.message||'Unable to delete router session.')}finally{setBusy(false)}};
  const test=async(id:string)=>{setTesting(id);setNotice('');try{const r=await router.testConnect(id);setNotice(r?.success===false?(r?.error||'Connection test failed.'):'Connection test completed successfully.')}catch(e:any){setNotice(e?.message||'Connection test failed.')}finally{setTesting('')}};
  const activate=async(id:string)=>{setBusy(true);setNotice('');try{await router.set(id);setActiveId(id);setNotice('Active router changed.')}catch(e:any){setNotice(e?.message||'Unable to change active router.')}finally{setBusy(false)}};

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">SYSTEM</span><h3>Sessions</h3><p>Manage MikroTik router connections used by the control plane.</p></div><button className="primary small"onClick={()=>{setForm(blank);setEditor(true);setNotice('')}}disabled={busy}><Plus size={15}/> Add Router</button></div>
    {notice&&<div className="notice banner">{notice}</div>}
    <section className="panel">
      <div className="panel-head"><div><h3><Router size={15}/> Router Sessions</h3><span>Showing {filtered.length} of {rows.length} entries</span></div><button className="button secondary"onClick={()=>void load()}disabled={busy}><RefreshCw size={15}className={busy?'spin':''}/> Refresh</button></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query}onChange={e=>setQuery(e.target.value)}placeholder="Search router, IP, port, ID..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>IP</th><th>Port</th><th>Currency</th><th>Live Report</th><th>Actions</th></tr></thead><tbody>
      {filtered.map((r,i)=>{const id=String(r.id||`row-${i}`);const active=id===activeId;return <tr key={id}><td><b>{r.name||id}</b><small className="session-id">{id}</small></td><td>{r.ip||'—'}</td><td>{r.port??'8728'}</td><td>{r.currency||'Rp'}</td><td><span className="live-pill">{String(r.livereport||'enable').toUpperCase()}</span></td><td><div className="row-actions"><button className="button test-button"disabled={busy||testing===id}onClick={()=>void test(id)}>{testing===id?<RefreshCw size={13}className="spin"/>:<Router size={13}/>} Test</button><button className={active?'button active-button':'button'}disabled={busy||active}onClick={()=>void activate(id)}><Check size={13}/>{active?'Active':'Set Active'}</button><button className="icon tiny"title="Edit"disabled={busy}onClick={()=>{setForm(asForm(r));setEditor(true);setNotice('')}}><Pencil size={14}/></button><button className="icon tiny danger"title="Delete"disabled={busy}onClick={()=>void remove(id)}><Trash2 size={14}/></button></div></td></tr>})}</tbody></table>{!filtered.length&&<div className="empty">No router sessions found.</div>}</div>
    </section>

    {editor&&<div className="modal-backdrop"><div className="modal wide"><div className="modal-head"><div><span className="eyebrow">ROUTER SESSION</span><h3>{form.id?'Edit Router':'Add Router'}</h3></div><button className="icon"onClick={()=>setEditor(false)}><X size={18}/></button></div><div className="form-grid"><label>Session ID<input value={form.id}disabled={rows.some(r=>String(r.id)===form.id)}onChange={e=>setForm({...form,id:e.target.value})}/></label><label>Router Name<input value={form.name}onChange={e=>setForm({...form,name:e.target.value})}/></label><label>IP Address<input value={form.ip}onChange={e=>setForm({...form,ip:e.target.value})}/></label><label>Port<input type="number"value={form.port}onChange={e=>setForm({...form,port:e.target.value})}/></label><label>Username<input value={form.user}onChange={e=>setForm({...form,user:e.target.value})}/></label><label>Password<input type="password"value={form.password}onChange={e=>setForm({...form,password:e.target.value})}placeholder={form.id?'Leave blank to keep existing password':'Router password'}/></label><label>Currency<input value={form.currency}onChange={e=>setForm({...form,currency:e.target.value})}/></label><label>Live Report<input value={form.livereport}onChange={e=>setForm({...form,livereport:e.target.value})}/></label><label>Hotspot Name<input value={form.hotspotName}onChange={e=>setForm({...form,hotspotName:e.target.value})}/></label><label>DNS Name<input value={form.dnsName}onChange={e=>setForm({...form,dnsName:e.target.value})}/></label><label>Interface<input value={form.iface}onChange={e=>setForm({...form,iface:e.target.value})}/></label><label>Reload Interval<input type="number"value={form.reloadInterval}onChange={e=>setForm({...form,reloadInterval:e.target.value})}/></label></div><div className="modal-actions"><button className="button secondary"onClick={()=>setEditor(false)}>Cancel</button><button className="primary"onClick={()=>void save()}disabled={busy}>{form.id?'Save Changes':'Create Session'}</button></div></div></div>}
  </div>;
}
