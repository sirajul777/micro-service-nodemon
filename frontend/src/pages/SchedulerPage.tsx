import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, RefreshCw, Search, X } from 'lucide-react';
import { router } from '../api';

type Row = Record<string, any>;
type Props = { session: string };
const empty = { name: '', startDate: '', startTime: '', interval: '', onEvent: '', disabled: false, comment: '' };

export default function SchedulerPage({ session }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    if (!session) return;
    setBusy(true); setNotice('');
    try {
      const r = await router.scheduler(session);
      setRows(Array.isArray(r) ? r : r?.schedulers || r?.data || []);
    } catch (e: any) {
      setNotice(e?.message || 'Unable to load schedulers.');
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [session]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? rows : rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  const open = (row?: Row) => {
    setEditing(row || null);
    setForm({ ...empty, ...(row || {}), disabled: row?.disabled === true || row?.disabled === 'true' });
  };
  const close = () => { setEditing(null); setForm({ ...empty }); };

  const save = async () => {
    if (!session || !form.name.trim()) { setNotice('Scheduler name is required.'); return; }
    if (!editing && !form.onEvent.trim()) { setNotice('On Event is required for a new scheduler.'); return; }
    setBusy(true); setNotice('');
    try {
      const body = { ...form, disabled: form.disabled ? 'true' : 'false' };
      const result = editing
        ? await router.updateScheduler(session, String(editing.name), { onEvent: body.onEvent, disabled: body.disabled, comment: body.comment })
        : await router.addScheduler(session, body);
      if (result?.success === false) throw new Error(result.error || 'Operation failed.');
      const wasEditing = !!editing;
      close(); await load(); setNotice(wasEditing ? 'Scheduler updated.' : 'Scheduler created.');
    } catch (e: any) { setNotice(e?.message || 'Unable to save scheduler.'); setBusy(false); }
  };

  return <div className="stack">
    <div className="hero"><div><span className="eyebrow">ROUTEROS AUTOMATION</span><h3>Scheduler</h3><p>Create and manage RouterOS scheduled scripts.</p></div><div className="top-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button><button className="button primary" disabled={busy || !session} onClick={() => open()}><Plus size={15}/> Add Scheduler</button></div></div>
    {notice && <div className="error banner">{notice}</div>}
    <section className="panel"><div className="panel-head"><div><h3><CalendarClock size={15}/> Scheduled Jobs</h3><span>{visible.length} of {rows.length} schedulers</span></div><span className="badge">{busy ? 'WORKING' : 'LIVE'}</span></div>
      <div className="table-controls"><div className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, event, comment..."/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Start Date</th><th>Start Time</th><th>Interval</th><th>On Event</th><th>Status</th><th>Comment</th><th>Actions</th></tr></thead><tbody>{visible.map((r,i) => { const name = String(r.name || r.id || i); const disabled = r.disabled === true || r.disabled === 'true'; return <tr key={name}><td><b>{name}</b></td><td>{r.startDate || r.start_date || '—'}</td><td>{r.startTime || r.start_time || '—'}</td><td>{r.interval || '—'}</td><td className="code-cell">{r.onEvent || r.on_event || '—'}</td><td>{disabled ? 'Disabled' : 'Enabled'}</td><td>{r.comment || '—'}</td><td><button className="button secondary" disabled={busy} onClick={() => open(r)}>Edit</button></td></tr>; })}</tbody></table>{!visible.length && <div className="empty">No scheduler entries found.</div>}</div>
    </section>
    {editing !== null || form.name !== '' ? <Modal form={form} setForm={setForm} editing={editing} busy={busy} close={close} save={() => void save()} /> : null}
  </div>;
}

function Modal({ form, setForm, editing, busy, close, save }: { form: any; setForm: any; editing: Row | null; busy: boolean; close: () => void; save: () => void }) {
  const field = (key: string, label: string, placeholder = '', disabled = false) => <label><span>{label}</span><input value={form[key] ?? ''} placeholder={placeholder} disabled={disabled} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}/></label>;
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">SCHEDULER</span><h3>{editing ? 'Edit Scheduler' : 'Add Scheduler'}</h3></div><button className="icon" onClick={close}><X size={18}/></button></div>
    <form onSubmit={e => { e.preventDefault(); save(); }}><div className="form-grid">
      {field('name', 'Name', '', !!editing)}{field('startDate', 'Start Date', 'Jan/01/2026')}{field('startTime', 'Start Time', '00:00:00')}{field('interval', 'Interval', '1d')}{field('onEvent', 'On Event', '/system script run ...')}{field('comment', 'Comment')}
      <label><span>Disabled</span><input type="checkbox" checked={!!form.disabled} onChange={e => setForm((f: any) => ({ ...f, disabled: e.target.checked }))}/></label>
    </div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}><Plus size={15}/>{editing ? 'Save Changes' : 'Create Scheduler'}</button></div></form>
  </div></div>;
}
