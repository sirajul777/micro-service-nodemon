const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) { const body = await res.text(); throw new Error(body || `HTTP ${res.status}`); }
  return res.status === 204 ? null : res.json();
};

const sessionPath = (session: string) => encodeURIComponent(session);
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const auth = {
  me: () => api('/api/auth/me'), login: (username: string, password: string) => api('/api/auth/login', json({ username, password })), logout: () => api('/api/auth/logout', json({})),
};

export const router = {
  sessions: () => api('/api/sessions'), set: (sessionId: string) => api('/api/session/router', json({ sessionId })),
  dashboard: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/dashboard`), hotspotUsers: (session: string, profile = 'all') => api(`/api/mikrotik/${sessionPath(session)}/hotspot/users?profile=${encodeURIComponent(profile)}`),
  addHotspotUser: (session: string, body: Record<string, unknown>) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/users`, json(body)), removeHotspotUser: (session: string, name: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/users/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  bulkRemoveHotspotUsers: (session: string, names: string[]) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/users/bulk-delete`, json({ names })), hotspotActive: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/active`), hotspotProfiles: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/profiles`),
  addHotspotProfile: (session: string, body: Record<string, unknown>) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/profiles`, json(body)), updateHotspotProfile: (session: string, name: string, body: Record<string, unknown>) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/profiles/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteHotspotProfile: (session: string, name: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' }), pppProfiles: (session: string) => api(`/api/pppoe/${sessionPath(session)}/profiles`),
  addPppProfile: (session: string, body: Record<string, unknown>) => api(`/api/pppoe/${sessionPath(session)}/profiles`, json(body)), updatePppProfile: (session: string, name: string, body: Record<string, unknown>) => api(`/api/pppoe/${sessionPath(session)}/profiles/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePppProfile: (session: string, name: string) => api(`/api/pppoe/${sessionPath(session)}/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' }), pppActive: (session: string) => api(`/api/pppoe/${sessionPath(session)}/active`), disconnectPppActive: (session: string, name: string) => api(`/api/pppoe/${sessionPath(session)}/active/${encodeURIComponent(name)}`, json({})),
  pppSecrets: (session: string) => api(`/api/pppoe/${sessionPath(session)}/secrets`), addPppSecret: (session: string, body: Record<string, unknown>) => api(`/api/pppoe/${sessionPath(session)}/secrets`, json(body)), updatePppSecret: (session: string, name: string, body: Record<string, unknown>) => api(`/api/pppoe/${sessionPath(session)}/secrets/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePppSecret: (session: string, name: string) => api(`/api/pppoe/${sessionPath(session)}/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' }), enablePppSecret: (session: string, name: string) => api(`/api/pppoe/${sessionPath(session)}/secrets/${encodeURIComponent(name)}/enable`, json({})), disablePppSecret: (session: string, name: string) => api(`/api/pppoe/${sessionPath(session)}/secrets/${encodeURIComponent(name)}/disable`, json({})),
  interfaces: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/interfaces`), hotspotLog: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/log`),
};

export const voucher = {
  batches: (session?: string) => api(session ? `/api/batches/${sessionPath(session)}` : '/api/batches'), createBatch: (session: string, batch: Record<string, unknown>) => api(`/api/batches/${sessionPath(session)}`, json(batch)),
  deleteBatch: (session: string, id: string, deleteMikrotik = false) => api(`/api/batches/${sessionPath(session)}/${encodeURIComponent(id)}?deleteMikrotik=${deleteMikrotik}`, { method: 'DELETE' }), markUsed: (session: string, id: string, username: string, usedBy = '') => api(`/api/batches/${sessionPath(session)}/${encodeURIComponent(id)}/mark-used`, json({ username, usedBy })),
  syncUsed: (session: string) => api(`/api/batches/${sessionPath(session)}/sync-used`, json({})), autoSyncUsed: (session: string) => api(`/api/batches/${sessionPath(session)}/auto-sync-used`, json({})), voucherTypes: () => api('/api/voucher-types'), getVoucherType: (id: string) => api(`/api/voucher-types/${encodeURIComponent(id)}`), createVoucherType: (body: Record<string, unknown>) => api('/api/voucher-types', json(body)), updateVoucherType: (id: string, body: Record<string, unknown>) => api(`/api/voucher-types/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }), deleteVoucherType: (id: string) => api(`/api/voucher-types/${encodeURIComponent(id)}`, { method: 'DELETE' }), toggleVoucherType: (id: string) => api(`/api/voucher-types/${encodeURIComponent(id)}/toggle`),
};

export const qris = { orders: () => api('/api/qris/orders'), stats: () => api('/api/qris/stats'), callbacks: (limit = 200) => api(`/api/qris/callbacks?limit=${limit}`) };

export const payment = {
  list: (status = '') => api(`/api/payments${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  stats: () => api('/api/payments/stats'),
  get: (orderId: string) => api(`/api/payments/${encodeURIComponent(orderId)}`),
  check: (orderId: string) => api(`/api/payments/${encodeURIComponent(orderId)}/check`, { method: 'POST', body: '{}' }),
  getConfig: () => api('/api/payments/config'),
  saveConfig: (values: Record<string,string>) => api('/api/payments/config', json(values)),
  test: (amount: number, profile: string) => api('/api/payments/test', json({ amount, profile })),
  listQrisOrders: (status = '') => api(`/api/qris/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getQrisStatus: (id: string) => api(`/api/qris/${encodeURIComponent(id)}/status`),
  verifyQrisOrder: (id: string) => api(`/api/qris/${encodeURIComponent(id)}/verify`, { method: 'POST', body: '{}' }),
  getQrisStats: () => api('/api/qris/stats'),
  callbacks: (limit = 100) => api(`/api/qris/callbacks?limit=${limit}`),
};

export const reseller = { session: (session: string) => api(`/api/resellers/session/${sessionPath(session)}`) };
export const reports = { live: (session: string) => api(`/api/report/${sessionPath(session)}/live`) };
