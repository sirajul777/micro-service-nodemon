import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, History, Pencil, Plus, RefreshCw, Send, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { request } from '../api';

type Config = Record<string, any>;

type FormState = {
  id?: string;
  name: string;
  token: string;
  chatId: string;
  sessionId: string;
  notifSale: boolean;
  notifDaily: boolean;
  dailyTime: string;
  botEnabled: boolean;
  allowedUsers: string;
  defaultProfile: string;
  welcomeMsg: string;
};

const emptyForm: FormState = {
  name: '', token: '', chatId: '', sessionId: '',
  notifSale: false, notifDaily: false, dailyTime: '23:59',
  botEnabled: true, allowedUsers: '', defaultProfile: '', welcomeMsg: '',
};

const maskToken = (value: string) => {
  if (!value) return '—';
  if (value.length <= 10) return '••••••••';
  return `${value.slice(0, 5)}••••••${value.slice(-4)}`;
};

const displayStatus = (cfg: Config) => cfg.botEnabled === false ? 'Disabled' : 'Enabled';

export default function TelegramManagementPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [logs, setLogs] = useState<Config[]>([]);
  const [selected, setSelected] = useState<Config | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState('Test dari Mikhmon');
  const [broadcastBotId, setBroadcastBotId] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true); setNotice('');
    try {
      const [c, l] = await Promise.all([
        request('/api/telegram/config'),
        request('/api/telegram/logs'),
      ]);
      const nextConfigs = Array.isArray(c) ? c : [];
      setConfigs(nextConfigs);
      setLogs(Array.isArray(l) ? l : []);
      if (!broadcastBotId && nextConfigs.length) setBroadcastBotId(String(nextConfigs[0].id || ''));
    } catch (e: any) {
      setNotice(e?.message || 'Gagal memuat konfigurasi Telegram.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter((cfg) => Object.values(cfg).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [configs, query]);

  const openNew = () => { setSelected({}); setForm({ ...emptyForm }); setNotice(''); };
  const openEdit = (cfg: Config) => {
    setSelected(cfg);
    setForm({
      ...emptyForm,
      ...cfg,
      token: cfg.token || cfg.botToken || '',
      chatId: cfg.chatId ?? cfg.chat_id ?? '',
      sessionId: cfg.sessionId ?? cfg.session_id ?? '',
      notifSale: cfg.notifSale ?? cfg.notif_sale ?? false,
      notifDaily: cfg.notifDaily ?? cfg.notif_daily ?? false,
      dailyTime: cfg.dailyTime ?? cfg.daily_time ?? '23:59',
      botEnabled: cfg.botEnabled ?? cfg.bot_enabled ?? true,
      allowedUsers: Array.isArray(cfg.allowedUsers) ? cfg.allowedUsers.join(',') : (cfg.allowed_users || ''),
      defaultProfile: cfg.defaultProfile ?? cfg.default_profile ?? '',
      welcomeMsg: cfg.welcomeMsg ?? cfg.welcome_msg ?? '',
    });
    setNotice('');
  };

  const payload = () => ({
    ...(form.id ? { id: form.id } : {}),
    name: form.name,
    token: form.token,
    chatId: form.chatId,
    sessionId: form.sessionId,
    notifSale: !!form.notifSale,
    notifDaily: !!form.notifDaily,
    dailyTime: form.dailyTime,
    botEnabled: !!form.botEnabled,
    allowedUsers: form.allowedUsers.split(',').map((x) => x.trim()).filter(Boolean),
    defaultProfile: form.defaultProfile,
    welcomeMsg: form.welcomeMsg,
  });

  const save = async () => {
    setBusy(true); setNotice('');
    try {
      const body = payload();
      if (form.id) await request(`/api/telegram/config/${encodeURIComponent(form.id)}`, { method: 'PUT', body: JSON.stringify(body) });
      else await request('/api/telegram/config', { method: 'POST', body: JSON.stringify(body) });
      setSelected(null); await load();
    } catch (e: any) { setNotice(e?.message || 'Gagal menyimpan bot.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Hapus konfigurasi bot ini?')) return;
    setBusy(true); setNotice('');
    try { await request(`/api/telegram/config/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { setNotice(e?.message || 'Gagal menghapus bot.'); }
    finally { setBusy(false); }
  };

  const test = async (cfg: Config) => {
    const id = String(cfg.id || '');
    setTestingId(id || 'new'); setNotice('');
    try {
      await request('/api/telegram/test', {
        method: 'POST',
        body: JSON.stringify({ id, chatId: cfg.chatId || cfg.chat_id || '', message }),
      });
      setNotice(`Test koneksi berhasil untuk ${cfg.name || id}.`);
    } catch (e: any) { setNotice(e?.message || 'Test koneksi bot gagal.'); }
    finally { setTestingId(null); }
  };

  const broadcast = async () => {
    if (!broadcastBotId || !broadcastMessage.trim()) {
      setNotice('Pilih bot dan isi pesan broadcast terlebih dahulu.');
      return;
    }
    if (!window.confirm('Kirim broadcast ke semua agen aktif yang memiliki Telegram ID?')) return;
    setBroadcasting(true); setNotice('');
    try {
      const result = await request('/api/telegram/broadcast', {
        method: 'POST',
        body: JSON.stringify({ id: broadcastBotId, message: broadcastMessage.trim() }),
      });
      setNotice(result?.message || 'Broadcast selesai.');
      setBroadcastMessage('');
    } catch (e: any) {
      setNotice(e?.message || 'Broadcast Telegram gagal.');
    } finally { setBroadcasting(false); }
  };

  const enabledCount = configs.filter((x) => x.botEnabled !== false && x.bot_enabled !== false).length;

  return <div className="stack">
    <div className="hero">
      <div>
        <span className="eyebrow">TELEGRAM BOT</span>
        <h3>Bot Management</h3>
        <p>Kelola multi-bot, koneksi Telegram, notifikasi, broadcast, dan activity log.</p>
      </div>
      <div>
        <button className="button" disabled={busy || broadcasting} onClick={() => void load()}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button>{' '}
        <button className="primary" disabled={busy || broadcasting} onClick={openNew}><Plus size={15}/> Add Bot</button>
      </div>
    </div>

    {notice && <div className="error banner">{notice}</div>}

    <div className="stat-grid">
      <div className="stat-card"><Bot size={18}/><span>Total Bot</span><strong>{configs.length}</strong></div>
      <div className="stat-card"><Wifi size={18}/><span>Enabled</span><strong>{enabledCount}</strong></div>
      <div className="stat-card"><Activity size={18}/><span>Logs</span><strong>{logs.length}</strong></div>
      <div className="stat-card"><ShieldCheck size={18}/><span>Mode</span><strong>Long Polling</strong></div>
    </div>

    <section className="panel">
      <div className="panel-head">
        <div><h3>Bot Instances</h3><span>{filtered.length} of {configs.length} configured bots</span></div>
      </div>
      <div className="table-controls"><div className="table-search"><Bot size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bot, chat ID, router session..."/></div></div>
      <div className="table-wrap">
        <table><thead><tr><th>Bot</th><th>Token</th><th>Chat ID</th><th>Router Session</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{filtered.map((cfg, i) => {
            const id = String(cfg.id ?? i);
            return <tr key={id}>
              <td><strong>{cfg.name || id}</strong></td>
              <td>{maskToken(String(cfg.token || cfg.botToken || ''))}</td>
              <td>{cfg.chatId || cfg.chat_id || '—'}</td>
              <td>{cfg.sessionId || cfg.session_id || '—'}</td>
              <td><span className="badge">{displayStatus(cfg)}</span></td>
              <td>
                <button className="button tiny" onClick={() => openEdit(cfg)}><Pencil size={13}/> Edit</button>{' '}
                <button className="button tiny" disabled={testingId === id} onClick={() => void test(cfg)}><Wifi size={13}/> {testingId === id ? 'Testing…' : 'Test'}</button>{' '}
                <button className="button tiny" disabled={busy} onClick={() => void remove(id)}><Trash2 size={13}/> Delete</button>
              </td>
            </tr>;
          })}</tbody>
        </table>
        {!filtered.length && <div className="empty">Belum ada konfigurasi bot.</div>}
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Broadcast ke Semua Agen</h3><span>Kirim pesan menggunakan bot terpilih ke semua bot-reseller aktif yang memiliki Telegram ID.</span></div><Send size={18}/></div>
      <div className="detail-grid">
        <label className="metric"><span>Bot Pengirim</span><select value={broadcastBotId} onChange={e => setBroadcastBotId(e.target.value)} disabled={broadcasting || !configs.length}>
          <option value="">Pilih bot...</option>
          {configs.map((cfg, i) => <option key={String(cfg.id ?? i)} value={String(cfg.id ?? '')}>{cfg.name || cfg.id || `Bot ${i + 1}`} {cfg.botEnabled === false ? '(Disabled)' : ''}</option>)}
        </select></label>
        <label className="metric"><span>Pesan Broadcast</span><textarea rows={5} value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} placeholder="Tulis pesan broadcast..." disabled={broadcasting}/></label>
      </div>
      <div className="modal-actions"><button className="primary" disabled={broadcasting || !broadcastBotId || !broadcastMessage.trim()} onClick={() => void broadcast()}><Send size={15}/> {broadcasting ? 'Mengirim…' : 'Kirim Broadcast'}</button></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Test Connection</h3><span>Verifikasi token dan tujuan chat melalui Bot gRPC.</span></div></div>
      <div className="grid"><label className="metric"><span>Test Message</span><textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} /></label></div>
      <div><Send size={15}/> Pilih tombol <b>Test</b> pada bot yang ingin diuji.</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Activity Log</h3><span>{logs.length} recent entries</span></div><History size={18}/></div>
      <div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Payload</th></tr></thead>
        <tbody>{logs.slice(0, 100).map((log, i) => <tr key={String(log.id ?? i)}><td>{log.time || log.createdAt || '—'}</td><td>{log.event || log.type || log.status || '—'}</td><td className="mono">{typeof log === 'object' ? JSON.stringify(log) : String(log)}</td></tr>)}</tbody>
      </table>{!logs.length && <div className="empty">Belum ada activity log.</div>}</div>
    </section>

    {selected !== null && <div className="modal-backdrop"><div className="modal modal-wide">
      <div className="modal-head"><div><span className="eyebrow">TELEGRAM CONFIG</span><h3>{form.id ? 'Edit Bot' : 'Add Bot'}</h3></div><button className="icon" onClick={() => setSelected(null)}>×</button></div>
      <div className="detail-grid">
        <label className="metric"><span>Name</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
        <label className="metric"><span>Bot Token</span><input type="password" autoComplete="off" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })}/></label>
        <label className="metric"><span>Chat ID</span><input value={form.chatId} onChange={e => setForm({ ...form, chatId: e.target.value })}/></label>
        <label className="metric"><span>Router Session</span><input value={form.sessionId} onChange={e => setForm({ ...form, sessionId: e.target.value })}/></label>
        <label className="metric"><span>Default Profile</span><input value={form.defaultProfile} onChange={e => setForm({ ...form, defaultProfile: e.target.value })}/></label>
        <label className="metric"><span>Daily Report Time</span><input type="time" value={form.dailyTime} onChange={e => setForm({ ...form, dailyTime: e.target.value })}/></label>
        <label className="metric"><span>Bot Status</span><select value={form.botEnabled ? 'true' : 'false'} onChange={e => setForm({ ...form, botEnabled: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label className="metric"><span>Sale Notification</span><select value={form.notifSale ? 'true' : 'false'} onChange={e => setForm({ ...form, notifSale: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label className="metric"><span>Daily Notification</span><select value={form.notifDaily ? 'true' : 'false'} onChange={e => setForm({ ...form, notifDaily: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label className="metric"><span>Allowed User IDs</span><input placeholder="123,456,789" value={form.allowedUsers} onChange={e => setForm({ ...form, allowedUsers: e.target.value })}/></label>
        <label className="metric"><span>Welcome Message</span><textarea rows={4} value={form.welcomeMsg} onChange={e => setForm({ ...form, welcomeMsg: e.target.value })}/></label>
      </div>
      <div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button className="primary" disabled={busy || !form.name || !form.token} onClick={() => void save()}>Save Bot</button></div>
    </div></div>}
  </div>;
}
