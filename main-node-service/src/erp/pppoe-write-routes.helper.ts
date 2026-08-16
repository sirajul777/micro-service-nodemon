import { Response } from 'express';
import { ErpDashboardGrpcClient } from './erp-dashboard-grpc.client';

export async function handlePppoeWriteRoute(
  erpGrpc: ErpDashboardGrpcClient,
  res: Response,
  method: string,
  session: string,
  kind: string,
  name: string,
  body: any,
) {
  const sessionId = decodeURIComponent(session);
  const itemName = name ? decodeURIComponent(name) : '';

  if (kind === 'secrets') {
    let response: any;
    if (method === 'POST') {
      response = await erpGrpc.addPppSecret({
        sessionId,
        name: String(body?.name || ''),
        password: String(body?.password || ''),
        service: String(body?.service || ''),
        profile: String(body?.profile || ''),
        localAddress: String(body?.localAddress || ''),
        remoteAddress: String(body?.remoteAddress || ''),
        comment: String(body?.comment || ''),
      });
    } else if (method === 'PUT') {
      response = await erpGrpc.updatePppSecret({
        sessionId,
        name: itemName,
        password: String(body?.password || ''),
        service: String(body?.service || ''),
        profile: String(body?.profile || ''),
        localAddress: String(body?.localAddress || ''),
        remoteAddress: String(body?.remoteAddress || ''),
        comment: String(body?.comment || ''),
      });
    } else if (method === 'DELETE') {
      response = await erpGrpc.deletePppSecret(sessionId, itemName);
    }

    if (!response?.success) {
      return res.status(400).json({ success: false, error: response?.error || 'PPPoE secret operation failed' });
    }
    return res.status(200).json(response);
  }

  if (kind === 'active' && method === 'POST' && itemName) {
    const response = await erpGrpc.disconnectPppActive(sessionId, itemName);
    if (!response?.success) {
      return res.status(400).json({ success: false, error: response?.error || 'Gagal memutus koneksi PPPoE' });
    }
    return res.status(200).json(response);
  }

  if (kind === 'profiles') {
    let response: any;
    if (method === 'POST') {
      response = await erpGrpc.addPppProfile({
        sessionId,
        name: String(body?.name || ''),
        localAddress: String(body?.localAddress || ''),
        remoteAddress: String(body?.remoteAddress || ''),
        dns: String(body?.dns || ''),
        rateLimit: String(body?.rateLimit || ''),
        bridge: String(body?.bridge || ''),
        onlyOne: String(body?.onlyOne || ''),
        changeTcpMss: String(body?.changeTcpMss || ''),
      });
    } else if (method === 'PUT') {
      response = await erpGrpc.updatePppProfile({
        sessionId,
        name: itemName,
        localAddress: String(body?.localAddress || ''),
        remoteAddress: String(body?.remoteAddress || ''),
        dns: String(body?.dns || ''),
        rateLimit: String(body?.rateLimit || ''),
        bridge: String(body?.bridge || ''),
        onlyOne: String(body?.onlyOne || ''),
        changeTcpMss: String(body?.changeTcpMss || ''),
      });
    } else if (method === 'DELETE') {
      response = await erpGrpc.deletePppProfile(sessionId, itemName);
    }

    if (!response?.success) {
      return res.status(400).json({ success: false, error: response?.error || 'PPPoE profile operation failed' });
    }
    return res.status(200).json(response);
  }

  return res.status(404).json({ success: false, message: 'Unknown PPPoE gRPC route' });
}
