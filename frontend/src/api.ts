const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) { const body = await res.text(); throw new Error(body || `HTTP ${res.status}`); }
  return res.status === 204 ? null : res.json();
};

const sessionPath = (session: string) => encodeURIComponent(session);

export const auth = {
  me: () => api('/api/auth/me'),
  login: (username: string, password: string) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api('/api/auth/logout', { method: 'POST', body: '{}' }),
};

export const router = {
  sessions: () => api('/api/sessions'),
  set: (sessionId: string) => api('/api/session/router', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  dashboard: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/dashboard`),
  hotspotUsers: (session: string, profile = 'all') => api(`/api/mikrotik/${sessionPath(session)}/hotspot/users?profile=${encodeURIComponent(profile)}`),
  hotspotActive: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/active`),
  hotspotProfiles: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/profiles`),
  pppProfiles: (session: string) => api(`/api/pppoe/${sessionPath(session)}/profiles`),
  pppActive: (session: string) => api(`/api/pppoe/${sessionPath(session)}/active`),
  pppSecrets: (session: string) => api(`/api/pppoe/${sessionPath(session)}/secrets`),
  interfaces: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/interfaces`),
  hotspotLog: (session: string) => api(`/api/mikrotik/${sessionPath(session)}/hotspot/log`),
};

export const voucher = {
  batches: (session?: string) => api(session ? `/api/batches/${sessionPath(session)}` : '/api/batches'),
  voucherTypes: () => api('/api/voucher-types'),
};

export const qris = {
  orders: () => api('/api/qris/orders'),
  stats: () => api('/api/qris/stats'),
  callbacks: (limit = 200) => api(`/api/qris/callbacks?limit=${limit}`),
};

export const reseller = {
  session: (session: string) => api(`/api/resellers/session/${sessionPath(session)}`),
};

export const reports = {
  live: (session: string) => api(`/api/report/${sessionPath(session)}/live`),
};
