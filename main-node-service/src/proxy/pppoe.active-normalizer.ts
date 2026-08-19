export interface PppoeActiveView {
  id: string;
  name: string;
  service: string;
  callId: string;
  address: string;
  uptime: string;
  bytesIn: string;
  bytesOut: string;
  profile: string;
}

/**
 * Preserve the MikroTik active-session fields expected by the legacy PPPoE UI.
 * The Go gRPC contract already exposes these fields; this helper only keeps
 * the BFF response normalization in one place.
 */
export function normalizePppoeActive(connection: any): PppoeActiveView {
  return {
    id: String(connection?.id || ''),
    name: String(connection?.name || ''),
    service: String(connection?.service || ''),
    callId: String(connection?.callId || connection?.call_id || ''),
    address: String(connection?.address || ''),
    uptime: String(connection?.uptime || ''),
    bytesIn: String(connection?.bytesIn || connection?.bytes_in || ''),
    bytesOut: String(connection?.bytesOut || connection?.bytes_out || ''),
    profile: String(connection?.profile || ''),
  };
}

export function normalizePppoeActiveList(connections: any[] | undefined | null): PppoeActiveView[] {
  return Array.isArray(connections) ? connections.map(normalizePppoeActive) : [];
}
