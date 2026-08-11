import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { ProfileMetaService } from '../profile-meta/profile-meta.service';
import { buildOnLoginScript, buildOnLoginHeader, parseOnLogin, mergeProfile } from './on-login-script';

/**
 * Hotspot operations (dashboard / active users / user CRUD / profiles /
 * interfaces / system resource). Backed by mikrotik-go-service over gRPC.
 *
 * The BFF routes `/api/mikrotik/:session/*` → erp `/mikrotik/:session/*`
 * (see `mikrotik` target alias in main-node-service proxy.controller.ts).
 */
@Controller('mikrotik')
@UseGuards(JwtAuthGuard)
export class HotspotController {
  constructor(
    private readonly mikrotik: MikrotikGrpcClient,
    private readonly profileMeta: ProfileMetaService,
  ) {}

  // ── Dashboard ────────────────────────────────────────────────────
  @Get(':session/dashboard')
  async dashboard(@Param('session') session: string) {
    const resp = await this.mikrotik.getDashboard(session);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat dashboard' };
    }
    return { success: true, ...resp };
  }

  // ── Active users ─────────────────────────────────────────────────
  @Get(':session/hotspot/active')
  async activeUsers(@Param('session') session: string) {
    const resp = await this.mikrotik.listActiveHotspotUsers(session, '');
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat user aktif' };
    }
    return { success: true, users: resp.users || [] };
  }

  // ── Users CRUD ───────────────────────────────────────────────────
  @Get(':session/hotspot/users')
  async listUsers(
    @Param('session') session: string,
    @Query('profile') profile?: string,
    @Query('comment') comment?: string,
  ) {
    const resp = await this.mikrotik.listHotspotUsers({
      sessionId: session,
      profile: profile || '',
      comment: comment || '',
    });
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat user' };
    }
    return { success: true, users: resp.users || [] };
  }

  @Post(':session/hotspot/users')
  async addUser(
    @Param('session') session: string,
    @Body() body: { name: string; password?: string; profile?: string; comment?: string; limitUptime?: string },
  ) {
    if (!body.name) return { success: false, error: 'name wajib diisi' };
    const resp = await this.mikrotik.addHotspotUser({
      sessionId: session,
      name: body.name,
      password: body.password || '',
      profile: body.profile || '',
      comment: body.comment || '',
      limitUptime: body.limitUptime || '',
    });
    return resp;
  }

  @Delete(':session/hotspot/users/:name')
  async removeUser(@Param('session') session: string, @Param('name') name: string) {
    return this.mikrotik.removeHotspotUser(session, name);
  }

  @Post(':session/hotspot/users/bulk-delete')
  @RequirePermission('manageHotspot')
  async bulkDeleteUsers(@Param('session') session: string, @Body() body: { names?: string[] }) {
    const names = Array.isArray(body?.names) ? body.names.filter(Boolean) : [];
    if (names.length === 0) return { success: false, error: 'names wajib diisi (array)' };
    const resp = await this.mikrotik.bulkRemoveHotspotUsers(session, names);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal menghapus user' };
    }
    return { success: true, removed: resp.removed || 0, failed: resp.failedNames || [] };
  }

  // ── Profiles ─────────────────────────────────────────────────────
  @Get(':session/hotspot/profiles')
  async listProfiles(@Param('session') session: string) {
    const resp = await this.mikrotik.listHotspotProfiles(session);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat profile' };
    }
    const meta = await this.profileMeta.getAllForSession('hotspot', session);
    const profiles = (resp.profiles || []).map((p: any) => mergeProfile(p, meta[p.name]));
    return { success: true, profiles };
  }

  @Get(':session/hotspot/profiles/:name')
  async getProfile(@Param('session') session: string, @Param('name') name: string) {
    const resp = await this.mikrotik.getHotspotProfile(session, name);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Profile tidak ditemukan' };
    }
    if (!resp.profile) return { success: true, profile: null };
    const meta = await this.profileMeta.get('hotspot', session, name);
    return { success: true, profile: mergeProfile(resp.profile, meta) };
  }

  @Post(':session/hotspot/profiles')
  @RequirePermission('manageHotspot')
  async addProfile(@Param('session') session: string, @Body() body: any) {
    if (!body?.name) return { success: false, error: 'name wajib diisi' };

    const price = parseFloat(body.price) || 0;
    const sprice = parseFloat(body.sprice) || 0;
    const validity = (body.validity || '').trim();
    const expmode = body.expmode || 'remc';
    const lockUser = body.lockUser || '';

    // Detect ROS version for the correct on-login script dialect.
    const resInfo = await this.mikrotik.getSystemResource(session);
    const rosVer = resInfo?.version?.charAt(0) === '6' ? '6' : '7';

    const onLogin = buildOnLoginScript(expmode, price, validity, sprice, lockUser, body.name, rosVer);

    const resp = await this.mikrotik.addHotspotProfile({
      sessionId: session,
      name: body.name,
      onLogin,
      sessionTimeout: body['session-timeout'] || '',
      idleTimeout: body['idle-timeout'] || '',
      rateLimit: body['rate-limit'] || '',
      sharedUsers: body['shared-users'] || '',
      addressPool: body['address-pool'] || '',
    });
    if (!resp.success) return { success: false, error: resp.error };

    await this.profileMeta.set('hotspot', session, body.name, {
      price,
      validity,
      ...(body.profileColor ? { profileColor: body.profileColor } : {}),
      ...(body.caption !== undefined ? { caption: body.caption } : {}),
    });
    await this.mikrotik.setupExpiryScheduler(session); // best-effort, doesn't block the response on failure
    return { success: true };
  }

  @Put(':session/hotspot/profiles/:name')
  @RequirePermission('manageHotspot')
  async editProfile(
    @Param('session') session: string,
    @Param('name') name: string,
    @Body() body: any,
  ) {
    const existing = await this.mikrotik.getHotspotProfile(session, name);
    if (!existing.success || !existing.profile) {
      return { success: false, error: existing.error || 'Profile not found' };
    }

    const currentMeta = parseOnLogin(existing.profile.onLogin || '');
    const newPrice = body.price !== undefined ? parseFloat(body.price) : currentMeta.price;
    const newSprice = body.sprice !== undefined ? parseFloat(body.sprice) : currentMeta.sprice;
    const newValidity = body.validity !== undefined ? (body.validity || '').trim() : currentMeta.validity;
    const newExpmode = body.expmode !== undefined ? body.expmode : currentMeta.expmode;
    const newLockUser = body.lockUser !== undefined ? body.lockUser : currentMeta.lockUser;

    const resInfo = await this.mikrotik.getSystemResource(session);
    const rosVer = resInfo?.version?.charAt(0) === '6' ? '6' : '7';

    // Only rebuild the full script if MikHMon metadata actually changed —
    // otherwise keep the existing script body, just refresh the header.
    const metaChanged =
      body.price !== undefined ||
      body.validity !== undefined ||
      body.expmode !== undefined ||
      body.lockUser !== undefined;

    let newOnLogin: string;
    if (metaChanged) {
      newOnLogin = buildOnLoginScript(newExpmode, newPrice, newValidity, newSprice, newLockUser, name, rosVer);
    } else {
      const header = buildOnLoginHeader(newExpmode, newPrice, newValidity, newSprice, newLockUser);
      const oldBody = (existing.profile.onLogin || '').replace(/:put\s*\("[^"]*"\);?\s*/g, '').trim();
      newOnLogin = oldBody ? `${header} ${oldBody}` : header;
    }

    const resp = await this.mikrotik.updateHotspotProfile({
      sessionId: session,
      name,
      onLogin: newOnLogin,
      sessionTimeout: body['session-timeout'] !== undefined ? body['session-timeout'] || '00:00:00' : '',
      idleTimeout: body['idle-timeout'] !== undefined ? body['idle-timeout'] || '00:00:00' : '',
      rateLimit: body['rate-limit'] !== undefined ? body['rate-limit'] || '' : '',
      sharedUsers: body['shared-users'] !== undefined ? body['shared-users'] || '1' : '',
      addressPool: body['address-pool'] !== undefined ? body['address-pool'] || 'none' : '',
    });
    if (!resp.success) return { success: false, error: resp.error };

    await this.profileMeta.set('hotspot', session, name, {
      price: newPrice,
      validity: newValidity,
      ...(body.profileColor ? { profileColor: body.profileColor } : {}),
      ...(body.caption !== undefined ? { caption: body.caption } : {}),
    });
    await this.mikrotik.setupExpiryScheduler(session);
    return { success: true };
  }

  @Delete(':session/hotspot/profiles/:name')
  @RequirePermission('manageHotspot')
  async deleteProfile(@Param('session') session: string, @Param('name') name: string) {
    const resp = await this.mikrotik.deleteHotspotProfile(session, name);
    if (!resp.success) return { success: false, error: resp.error || 'Not found' };
    await this.profileMeta.remove('hotspot', session, name);
    return { success: true };
  }

  @Get(':session/hotspot/profile-meta')
  async getProfileMeta(@Param('session') session: string) {
    return this.profileMeta.getAllForSession('hotspot', session);
  }

  // ── Interfaces ───────────────────────────────────────────────────
  @Get(':session/interfaces')
  async interfaces(@Param('session') session: string) {
    const resp = await this.mikrotik.getInterfaces(session);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat interface' };
    }
    return { success: true, interfaces: resp.interfaces || [] };
  }

  @Get(':session/interface/traffic/:ifname')
  async traffic(@Param('session') session: string, @Param('ifname') ifname: string) {
    const resp = await this.mikrotik.getInterfaces(session);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat interface' };
    }
    const ifc = (resp.interfaces || []).find(
      (i: any) => i.name === ifname || i.id === ifname,
    );
    return {
      success: true,
      interface: ifc || null,
      tx: ifc?.tx || '',
      rx: ifc?.rx || '',
    };
  }

  // ── System resource ──────────────────────────────────────────────
  @Get(':session/system/resource')
  async systemResource(@Param('session') session: string) {
    const resp = await this.mikrotik.getSystemResource(session);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat resource' };
    }
    return { success: true, ...resp };
  }

  // ── Best-effort placeholders (need dedicated RPCs in Go) ─────────
  @Get(':session/hotspot/log')
  async hotspotLog(@Param('session') session: string) {
    const active = await this.mikrotik.listActiveHotspotUsers(session, '');
    return {
      success: active.success,
      logs: (active.users || []).map((u: any) => ({
        id: u.id,
        user: u.user,
        address: u.address,
        uptime: u.uptime,
        bytesIn: u.bytes_in,
        bytesOut: u.bytes_out,
        time: new Date().toISOString(),
      })),
    };
  }

  @Get(':session/scheduler')
  async scheduler(@Param('session') session: string) {
    // No dedicated RPC yet — return empty list so the UI doesn't 404.
    return { success: true, schedulers: [] };
  }

  @Get(':session/dhcp/leases')
  async dhcpLeases(@Param('session') session: string) {
    const active = await this.mikrotik.listActiveHotspotUsers(session, '');
    return {
      success: active.success,
      leases: (active.users || []).map((u: any) => ({
        id: u.id,
        address: u.address,
        macAddress: u.mac_address,
        hostName: u.user,
        status: 'bound',
      })),
    };
  }
}
