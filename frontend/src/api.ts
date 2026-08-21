const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) { const body = await res.text(); throw new Error(body || `HTTP ${res.status}`); }
  return res.status === 204 ? null : res.json();
};

export const auth = {
  me: () => api('/api/auth/me'),
  login: (username: string, password: string) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api('/api/auth/logout', { method: 'POST', body: '{}' }),
};

export const router = {
  sessions: () => api('/api/sessions'),
  set: (sessionId: string) => api('/api/session/router', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  dashboard: (session: string) => api(`/api/mikrotik/${encodeURIComponent(session)}/dashboard`),
  hotspotUsers: (session: string, profile = 'all') => api(`/api/mikrotik/${encodeURIComponent(session)}/hotspot/users?profile=${encodeURIComponent(profile)}`),
  hotspotActive: (session: string) => api(`/api/mikrotik/${encodeURIComponent(session)}/hotspot/active`),
  hotspotProfiles: (session: string) => api(`/api/mikrotik/${encodeURIComponent(session)}/hotspot/profiles`),
  pppProfiles: (session: string) => api(`/api/pppoe/${encodeURIComponent(session)}/profiles`),
  pppActive: (session: string) => api(`/api/pppoe/${encodeURIComponent(session)}/active`),
};
