import { useEffect, useState } from 'react';
import { router } from '../api';

type Secret = Record<string, any>;

export default function PppoeSecretsPage({ session }: { session: string }) {
  const [rows, setRows] = useState<Secret[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Secret | null>(null);

  const load = async () => {
    if (!session) return;
    setBusy(true); setError('');
    try { const result: any = await router.pppSecrets(session); setRows(result?.secrets ?? result?.data ?? result ?? []); }
    catch (e: any) { setError(e?.message || 'Unable to load PPPoE secrets.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [session]);

  const save = async (value: Secret) => {
    if (!value.name) return;
    setBusy(true); setError('');
    try {
      const body = { password: value.password || '', service: value.service || 'pppoe', profile: value.profile || '', remoteAddress: value.remoteAddress || '', comment: value.comment || '' };
      if (editing?.name) await router.updatePppSecret(session, editing.name, body); else await router.addPppSecret(session, body);
      setEditing(null); await load();
    } catch (e: any) { setError(e?.message || 'Unable to save PPPoE secret.'); setBusy(false); }
  };
  const remove = async (name: string) => { if (!confirm(`Delete PPPoE secret ${name}?`)) return; setBusy(true); try { await router.deletePppSecret(session, name); await load(); } catch (e: any) { setError(e?.message || 'Unable to delete secret.'); setBusy(false); } };
  const toggle = async (row: Secret) => { setBusy(true); try { if (row.disabled === true || row.disabled === 'true') await router.enablePppSecret(session, row.name); else await router.disablePppSecret(session, row.name); await load(); } catch (e: any) { setError(e?.message || 'Unable to change secret state.'); setBusy(false); } };
  const filtered = rows.filter(r => String(r.name || '').toLowerCase().includes(query.toLowerCase()) || String(r.profile || '').toLowerCase().includes(query.toLowerCase()));

  return <div className="panel">
    <div className="panel-head"><div><h3>PPPoE Secrets</h3><span>Subscriber credentials and enable/disable operations</span></div><div className="panel-actions"><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search secrets..." /><button className="primary small" onClick={() => setEditing({ name:'', password:'', service:'pppoe', profile:'' })}>Add Secret</button><button className="button secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div></div>
    {error && <div className="error banner">{error}</div>}
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Service</th><th>Profile</th><th>Remote Address</th><th>Comment</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((r, i) => <tr key={String(r.name || i)}><td>{r.name}</td><td>{r.service || '—'}</td><td>{r.profile || '—'}</td><td>{r.remoteAddress || '—'}</td><td>{r.comment || '—'}</td><td>{r.disabled === true || r.disabled === 'true' ? 'Disabled' : 'Enabled'}</td><td><div className="row-actions"><button className="icon tiny" onClick={() => setEditing({ ...r })}>Edit</button><button className="icon tiny" onClick={() => void toggle(r)}>{r.disabled === true || r.disabled === 'true' ? 'On' : 'Off'}</button><button className="icon tiny danger" onClick={() => void remove(r.name)}>Del</button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">No PPPoE secrets found.</div>}</div>
    {editing && <SecretModal value={editing} onCancel={() => setEditing(null)} onSave={save} busy={busy} />}
  </div>;
}

function SecretModal({ value, onCancel, onSave, busy }: { value: Secret; onCancel:()=>void; onSave:(v:Secret)=>void; busy:boolean }) {
  const [v, setV] = useState(value);
  const field = (key:string, label:string, type='text') => <label>{label}<input type={type} value={v[key] ?? ''} onChange={e => setV({ ...v, [key]: e.target.value })} /></label>;
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">PPPOE</span><h3>{value.name ? 'Edit Secret' : 'Add Secret'}</h3></div><button className="icon" onClick={onCancel}>×</button></div><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="form-grid">{field('name','Username')}{field('password','Password','password')}{field('service','Service')}{field('profile','Profile')}{field('remoteAddress','Remote Address')}{field('comment','Comment')}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>Save</button></div></form></div></div>;
}