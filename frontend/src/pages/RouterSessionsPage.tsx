import { useEffect, useMemo, useState } from 'react';
import { Check, Circle, Eye, Pencil, Plus, RefreshCw, Router, Search, Trash2, X } from 'lucide-react';
import { router } from '../api';

type Session = Record<string, any>;
type Form = { id:string; name:string; ip:string; port:string; user:string; password:string; hotspotName:string; dnsName:string; currency:string; reloadInterval:string; iface:string; idleTo:string; livereport:string };
const blank:Form={id:'',name:'',ip:'',port:'8728',user:'admin',password:'',hotspotName:'',dnsName:'',currency:'IDR',reloadInterval:'10',iface:'ether1',idleTo:'0',livereport:'enable'};
const asForm=(s:Session):Form=>({...blank,id:String(s.id||''),name:String(s.name||''),ip:String(s.ip||''),port:String(s.port??8728),user:String(s.user||''),hotspotName:String(s.hotspotName||''),dnsName:String(s.dnsName||''),currency:String(s.currency||'IDR'),reloadInterval:String(s.reloadInterval??10),iface:String(s.iface||'ether1'),idleTo:String(s.idleTo??0),livereport:String(s.livereport||'enable')});

const prettyKey=(key:string)=>key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
const masked=(value:unknown,key:string)=>key.toLowerCase().includes('password')?'••••••••':String(value??'—');

export default function RouterSessionsPage(){
  const[rows,setRows]=useState<Session[]>([]);
  const[query,setQuery]=useState('');
  const[selected,setSelected]=useState<Session|null>(null);
  const[editor,setEditor]=useState(false);
  const[form,setForm]=useState<Form>(blank);
  const[busy,setBusy]=useState(false);
  const[testing,setTesting]=useState('');
  const[notice,setNotice]=useState('');
  const[activeId,setActiveId]=useState('');

  const load=async()=>{setBusy(true);setNotice('');try{const data=await router.sessions();const list=Array.isArray(data)?data:data?.sessions;const normalized=Array.isArray(list)?list:[];setRows(normalized);setActiveId((current)=>current&&normalized.some((r)=>String(r.id)===current)?current:String(normalized[0]?.id||''));}catch(e:any){setNotice(e?.message||'Unable to load router sessions.')}finally{setBusy(false)}};
  useEffect(()=>{void load()},[]);

  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?rows.filter(r=>Object.entries(r).some(([k,v])=>!k.toLowerCase().includes('password')&&String(v??'').toLowerCase().includes(q))):rows},[rows,query]);

  const inspect=async(row:Session)=>{const id=String(row.id||'');if(!id)return;setBusy(true);setNotice('');try{setSelected(await router.getSession(id)||row)}catch{setSelected(row)}finally{setBusy(false)}};
  const save=async()=>{if(!form.id||!form.name||!form.ip||!form.user){setNotice('ID, name, IP, and username are required.');return}if(!editor)return;setBusy(true);setNotice('');try{await router.saveSession({...form,port:Number(form.port)||0,reloadInterval:Number(form.reloadInterval)||0,idleTo:Number(form.idleTo)||0});setEditor(false);await load();setNotice('Router session saved successfully.')}catch(e:any){setNotice(e?.message||'Unable to save router session.')}finally{setBusy(false)}};
  const remove=async(id:string)=>{if(!window.confirm(`Delete router session ${id}?`))return;setBusy(true);setNotice('');try{await router.deleteSession(id);if(activeId===id)setActiveId('');setSelected(null);await load();setNotice('Router session deleted.')}catch(e:any){setNotice(e?.message||'Unable to delete router session.')}finally{setBusy(false)}};
  const test=async(id:string)=>{setTesting(id);setNotice('');try{const r=await router.testConnect(id);setNotice(r?.success===false?(r?.error||r?.message||'Connection test failed.'):r?.identity?`Connected: ${r.identity}`:'Connection test completed successfully.')}catch(e:any){setNotice(e?.message||'Connection test failed.')}finally{setTesting('')}};
  const activate=async(id:string)=>{setBusy(true);setNotice('');try{await router.set(id);setActiveId(id);setNotice('Active router changed.')}catch(e:any){setNotice(e?.message||'Unable to change active router.')}finally{setBusy(false)}};

  const openCreate=()=>{setForm(blank);setEditor(true);setSelected(null);setNotice('')};
  const openEdit=(row:Session)=>{setForm(asForm(row));setEditor(true);setSelected(null);setNotice('')};

  const connectedCount=rows.filter(r=>r.connected===true||r.status==='Connected').length;

  return <div className="stack">
    <div className="hero">
      <div><span className="eyebrow">ROUTER MANAGEMENT</span><h3>Session Management</h3><p>Manage router connection profiles and choose the active MikroTik session.</p></div>
      <div className="panel-actions"><button className="button secondary"onClick={()=>void load()}disabled={busy}><RefreshCw size={15}className={busy?'spin':''}/> Refresh</button><button className="primary"onClick={openCreate}disabled={busy}><Plus size={15}/> Add Session</button></div>
    </div>
    {notice&&<div className={notice.startsWith('Router session saved')||notice==='Router session deleted.'||notice==='Active router changed.'||notice.startsWith('Connected:')||notice.startsWith('Connection test completed')?'notice banner':'error banner'}>{notice}</div>}

    <div className="stats">
      <div className="stat"><div className="stat-icon"><Router size={18}/></div><div><span>Total Sessions</span><strong>{rows.length}</strong></div></div>
      <div className="stat"><div className="stat-icon"><Check size={18}/></div><div><span>Connected</span><strong>{connectedCount}</strong></div></div>
      <div className="stat"><div className="stat-icon"><Circle size={18}/></div><div><span>Active Session</span><strong>{rows.find(r=>String(r.id)===activeId)?.name||rows.find(r=>String(r.id)===activeId)?.id||'—'}</strong></div></div>
    </div>

    <section className="panel">
      <div className="panel-head"><div><h3><Router size={15}/> Router Sessions</h3><span>{filtered.length} of {rows.length} sessions</span></div><span className="badge">{busy?'WORKING':'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query}onChange={e=>setQuery(e.target.value)}placeholder="Search name, IP, username, ID..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Session</th><th>Router</th><th>Address</th><th>Port</th><th>User</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {filtered.map((r,i)=>{const id=String(r.id||`row-${i}`);const isActive=activeId===id;const connected=r.connected===true||r.status==='Connected';return <tr key={id} className={isActive?'selected-row':''}><td><b>{id}</b>{isActive&&<span className="badge" style={{marginLeft:8}}>ACTIVE</span>}</td><td>{r.name||'—'}</td><td>{r.ip||'—'}</td><td>{r.port??'—'}</td><td>{r.user||'—'}</td><td><span className="status-dot"><i className={connected?'online':''}/>{connected?'Connected':'Configured'}</span></td><td><div className="inline-actions"><button className="icon tiny"title="Set active"disabled={busy||isActive}onClick={()=>void activate(id)}><Check size={14}/></button><button className="icon tiny"title="Test connection"disabled={busy||testing===id}onClick={()=>void test(id)}>{testing===id?<RefreshCw size={14}className="spin"/>:<Router size={14}/>}</button><button className="icon tiny"title="Inspect"disabled={busy}onClick={()=>void inspect(r)}><Eye size={14}/></button><button className="icon tiny"title="Edit"disabled={busy}onClick={()=>openEdit(r)}><Pencil size={14}/></button><button className="icon tiny danger"title="Delete"disabled={busy}onClick={()=>void remove(id)}><Trash2 size={14}/></button></div></td></tr>})}</tbody></table>{!filtered.length&&<div className="empty">No router sessions found.</div>}</div>
    </section>

    {selected&&<div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">ROUTER SESSION</span><h3>{selected.name||selected.id||'Session'}</h3></div><button className="icon"onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="detail-grid">{Object.entries(selected).filter(([k])=>k.toLowerCase()!=='password').map(([k,v])=><div className="metric"key={k}><span>{prettyKey(k)}</span><b>{masked(v,k)}</b></div>)}</div></div></div>}

    {editor&&<div className="modal-backdrop"><div className="modal wide"><div className="modal-head"><div><span className="eyebrow">SESSION CONFIGURATION</span><h3>{form.id?'Edit Session':'Add Session'}</h3></div><button className="icon"onClick={()=>setEditor(false)}><X size={18}/></button></div><div className="form-grid"><label>Session ID<input value={form.id}disabled={Boolean(form.id&&rows.some(r=>String(r.id)===form.id))}onChange={e=>setForm({...form,id:e.target.value})}/></label><label>Router Name<input value={form.name}onChange={e=>setForm({...form,name:e.target.value})}/></label><label>IP Address<input value={form.ip}onChange={e=>setForm({...form,ip:e.target.value})}/></label><label>API Port<input type="number"value={form.port}onChange={e=>setForm({...form,port:e.target.value})}/></label><label>Username<input value={form.user}onChange={e=>setForm({...form,user:e.target.value})}/></label><label>Password<input type="password"value={form.password}onChange={e=>setForm({...form,password:e.target.value})}placeholder={form.id?'Leave blank to keep current':'Router password'}/></label><label>Hotspot Name<input value={form.hotspotName}onChange={e=>setForm({...form,hotspotName:e.target.value})}/></label><label>DNS Name<input value={form.dnsName}onChange={e=>setForm({...form,dnsName:e.target.value})}/></label><label>Currency<input value={form.currency}onChange={e=>setForm({...form,currency:e.target.value})}/></label><label>Reload Interval<input type="number"value={form.reloadInterval}onChange={e=>setForm({...form,reloadInterval:e.target.value})}/></label><label>Interface<input value={form.iface}onChange={e=>setForm({...form,iface:e.target.value})}/></label><label>Idle Timeout<input type="number"value={form.idleTo}onChange={e=>setForm({...form,idleTo:e.target.value})}/></label><label>Live Report<input value={form.livereport}onChange={e=>setForm({...form,livereport:e.target.value})}/></label></div><div className="modal-actions"><button className="button secondary"onClick={()=>setEditor(false)}>Cancel</button><button className="primary"onClick={()=>void save()}disabled={busy}>{form.id?'Save Changes':'Create Session'}</button></div></div></div>}
  </div>;
}
