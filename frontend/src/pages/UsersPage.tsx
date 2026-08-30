import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, X } from 'lucide-react';

const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
};
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

type User = Record<string, any>;
const empty = { username: '', password: '', name: '', role: 'reseller', allowedSessions: '', permissions: '', note: '', active: true };

export default function UsersPage() {
  const [rows, setRows] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    setBusy(true); setNotice('');
    try { const result = await api('/api/users'); setRows(Array.isArray(result) ? result : result?.users || result?.data || []); }
    catch (e: any) { setNotice(e?.message || 'Unable to load users.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => { const q = query.trim().toLowerCase(); return !q ? rows : rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))); }, [rows, query]);
  const open = (row?: User) => { setEditing(row || null); setForm({ ...empty, ...(row || {}), allowedSessions: Array.isArray(row?.allowedSessions) ? row.allowedSessions.join(', ') : row?.allowedSessions || '' }); };
  const close = () => { setEditing(null); setResetId(null); setNewPassword(''); setForm({ ...empty }); };
  const save = async () => {
    if (!form.username.trim() || !form.name.trim() || !form.role || (!editing && !form.password)) { setNotice('Username, name, role and password are required.'); return; }
    setBusy(true); setNotice('');
    try {
      const body: any = { ...form, allowedSessions: form.allowedSessions ? form.allowedSessions.split(',').map((v: string) => v.trim()).filter(Boolean) : [] };
      if (form.permissions) { try { body.permissions = JSON.parse(form.permissions); } catch { throw new Error('Permissions must be valid JSON.'); } } else delete body.permissions;
      if (editing && !body.password) delete body.password;
      const result = editing ? await api(`/api/users/${encodeURIComponent(String(editing.id))}`, { method: 'PUT', body: JSON.stringify(body) }) : await api('/api/users', json(body));
      if (result?.error) throw new Error(result.error);
      const wasEditing = !!editing; close(); await load(); setNotice(wasEditing ? 'User updated.' : 'User created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to save user.'); setBusy(false); }
  };
  const toggle = async (row: User) => { setBusy(true); setNotice(''); try { const result = await api(`/api/users/${encodeURIComponent(String(row.id))}/toggle`, { method: 'PATCH' }); if (result?.error) throw new Error(result.error); await load(); } catch (e: any) { setNotice(e?.message || 'Unable to toggle user.'); setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm('Delete this user?')) return; setBusy(true); setNotice(''); try { const result = await api(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (result?.error) throw new Error(result.error); await load(); } catch (e: any) { setNotice(e?.message || 'Unable to delete user.'); setBusy(false); } };
  const resetPassword = async () => { if (!resetId || newPassword.length < 4) { setNotice('New password must be at least 4 characters.'); return; } setBusy(true); setNotice(''); try { const result = await api(`/api/users/${encodeURIComponent(resetId)}/reset-password`, json({ newPassword })); if (result?.error || result?.success === false) throw new Error(result.error || 'Reset failed.'); setResetId(null); setNewPassword(''); setNotice('Password reset successfully.'); } catch (e: any) { setNotice(e?.message || 'Unable to reset password.'); } finally { setBusy(false); } };
  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">SYSTEM ACCESS</span><h3>Users</h3><p>Manage administrator, reseller and collector accounts.</p></div><div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button primary" disabled={busy} onClick={() => open()}><Plus size={15}/> Add User</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3>Accounts</h3><span>{visible.length} of {rows.length} users</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div><div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search username, name, role..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Active</th><th>Note</th><th>Actions</th></tr></thead><tbody>{visible.map((r,i)=>{const id=String(r.id ?? r.username ?? i); const active=!(r.active===false || String(r.active).toLowerCase()==='false'); return <tr key={id}><td><b>{r.username || id}</b></td><td>{r.name || '—'}</td><td>{r.role || '—'}</td><td>{active ? 'Yes' : 'No'}</td><td>{r.note || '—'}</td><td><div className="row-actions"><button className="icon tiny" title="Edit" disabled={busy} onClick={() => open(r)}><Pencil size={14}/></button><button className="icon tiny" title={active?'Disable':'Enable'} disabled={busy} onClick={() => void toggle(r)}>{active ? <ShieldOff size={14}/> : <ShieldCheck size={14}/>}</button><button className="icon tiny" title="Reset password" disabled={busy} onClick={() => setResetId(id)}><KeyRound size={14}/></button><button className="icon tiny danger" title="Delete" disabled={busy} onClick={() => void remove(id)}><Trash2 size={14}/></button></div></td></tr>})}</tbody></table>{!visible.length && <div className="empty">No users found.</div>}</div>
    </section>
    {editing !== null || form.username ? <UserModal form={form} setForm={setForm} editing={editing} busy={busy} close={close} save={() => void save()} /> : null}
    {resetId ? <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">SECURITY</span><h3>Reset Password</h3></div><button className="icon" onClick={()=>{setResetId(null);setNewPassword('')}}><X size={18}/></button></div><div className="form-grid"><label><span>New Password</span><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={4}/></label></div><div className="modal-actions"><button className="button secondary" onClick={()=>{setResetId(null);setNewPassword('')}}>Cancel</button><button className="button primary" disabled={busy} onClick={()=>void resetPassword()}>Reset Password</button></div></div></div> : null}
  </div>;
}
function UserModal({ form, setForm, editing, busy, close, save }: any) { const field=(key:string,label:string,placeholder='')=><label><span>{label}</span><input type={key==='password'?'password':'text'} value={form[key] ?? ''} placeholder={placeholder} disabled={key==='username'&&!!editing} onChange={e=>setForm((f:any)=>({...f,[key]:e.target.value}))}/></label>; return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">USER ACCOUNT</span><h3>{editing?'Edit User':'Add User'}</h3></div><button className="icon" onClick={close}><X size={18}/></button></div><form onSubmit={e=>{e.preventDefault();save()}}><div className="form-grid">{field('username','Username')}{field('password','Password')}{field('name','Name') }<label><span>Role</span><select value={form.role} onChange={e=>setForm((f:any)=>({...f,role:e.target.value}))}><option value="admin">Admin</option><option value="reseller">Reseller</option><option value="collector">Collector</option></select></label>{field('allowedSessions','Allowed Sessions','router-1, router-2')}{field('permissions','Permissions JSON','{"manageSystem":true}')}{field('note','Note')}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{editing?'Save Changes':'Create User'}</button></div></form></div></div> }
