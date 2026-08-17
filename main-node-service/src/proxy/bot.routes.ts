import { Response } from 'express';
import { BotGrpcClient } from '../bot/bot-grpc.client';

export async function handleBotGrpcRoute(
  bot: BotGrpcClient,
  req: any,
  res: Response,
  canonical: string,
  body: any,
  query: any,
) {
  const parts = canonical.split('/').filter(Boolean);
  const root = parts[0];
  if (!['resellers', 'bot-resellers', 'telegram'].includes(root)) return false;

  try {
    if (root === 'resellers' || root === 'bot-resellers') {
      const isBot = root === 'bot-resellers';
      if (req.method === 'GET' && parts.length === 1) {
        const response = await bot.listResellers(isBot);
        return res.status(response.success === false ? 502 : 200).json(response.resellers || []);
      }
      if (req.method === 'GET' && parts.length === 2 && parts[1] !== 'logs') {
        const response = await bot.getReseller(decodeURIComponent(parts[1]), isBot);
        return res.status(response.success === false ? 404 : 200).json(response.reseller || null);
      }
      if (req.method === 'POST' && parts.length === 1) {
        const response = await bot.upsertReseller(body || {}, isBot);
        return res.status(response.success === false ? 502 : 200).json(response);
      }
      if (req.method === 'PUT' && parts.length === 2) {
        const response = await bot.upsertReseller({ ...(body || {}), id: decodeURIComponent(parts[1]) }, isBot);
        return res.status(response.success === false ? 502 : 200).json(response);
      }
      if (req.method === 'DELETE' && parts.length === 2) {
        const response = await bot.deleteReseller(decodeURIComponent(parts[1]), isBot);
        return res.status(response.success === false ? 404 : 200).json(response);
      }
      if (isBot && req.method === 'PATCH' && parts.length === 3 && parts[2] === 'toggle') {
        const current = await bot.getReseller(decodeURIComponent(parts[1]), true);
        if (!current?.success || !current.reseller) return res.status(404).json({ success: false, message: 'Not found' });
        const status = current.reseller.status === 'active' ? 'inactive' : 'active';
        const response = await bot.upsertReseller({ ...current.reseller, id: current.reseller.id, status }, true);
        return res.status(response.success === false ? 502 : 200).json({ ...response, active: status === 'active' });
      }
      if (isBot && req.method === 'POST' && parts.length === 3 && parts[2] === 'topup') {
        const response = await bot.topupReseller(decodeURIComponent(parts[1]), Number(body?.amount || 0), String(body?.note || ''), String(body?.by || 'admin'));
        return res.status(response.success === false ? 404 : 200).json(response);
      }
      if (isBot && req.method === 'GET' && parts.length === 2 && parts[1] === 'logs') {
        const response = await bot.listResellerLogs(String(query?.resellerId || ''), Number(query?.limit || 100));
        return res.status(response.success === false ? 502 : 200).json(response.logs || []);
      }
    }

    if (root === 'telegram') {
      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'config') {
        const response = await bot.listTelegramConfigs();
        return res.status(response.success === false ? 502 : 200).json(response.configs || []);
      }
      if (req.method === 'GET' && parts.length === 3 && parts[1] === 'config') {
        const response = await bot.getTelegramConfig(decodeURIComponent(parts[2]));
        return res.status(response.success === false ? 404 : 200).json(response.config || null);
      }
      if (req.method === 'POST' && parts.length === 2 && parts[1] === 'config') {
        const response = await bot.saveTelegramConfig(body || {});
        return res.status(response.success === false ? 502 : 200).json({ success: true, config: response.config });
      }
      if (req.method === 'PUT' && parts.length === 3 && parts[1] === 'config') {
        const response = await bot.saveTelegramConfig({ ...(body || {}), id: decodeURIComponent(parts[2]) });
        return res.status(response.success === false ? 502 : 200).json({ success: true, config: response.config });
      }
      if (req.method === 'DELETE' && parts.length === 3 && parts[1] === 'config') {
        const response = await bot.deleteTelegramConfig(decodeURIComponent(parts[2]));
        return res.status(response.success === false ? 502 : 200).json(response);
      }
      if (req.method === 'POST' && parts.length === 2 && parts[1] === 'test') {
        const response = await bot.testTelegram(String(body?.id || ''), String(body?.chatId || ''), String(body?.message || 'Test dari MikHMon'));
        return res.status(response.success === false ? 502 : 200).json(response);
      }
      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'logs') {
        const response = await bot.listTelegramLogs();
        const logs = (response.logs || []).map((x: any) => { try { return JSON.parse(x.payload); } catch { return x; } });
        return res.status(response.success === false ? 502 : 200).json(logs);
      }
    }
  } catch (err: any) {
    return res.status(502).json({ success: false, message: `Bot gRPC unavailable: ${err?.message || err}` });
  }
  return false;
}
