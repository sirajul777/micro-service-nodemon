import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

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
  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

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

  // ── Profiles ─────────────────────────────────────────────────────
  @Get(':session/hotspot/profiles')
  async listProfiles(@Param('session') session: string) {
    const resp = await this.mikrotik.listHotspotProfiles(session);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Gagal memuat profile' };
    }
    return { success: true, profiles: resp.profiles || [] };
  }

  @Get(':session/hotspot/profiles/:name')
  async getProfile(@Param('session') session: string, @Param('name') name: string) {
    const resp = await this.mikrotik.getHotspotProfile(session, name);
    if (!resp.success) {
      return { success: false, error: resp.error || 'Profile tidak ditemukan' };
    }
    return { success: true, profile: resp.profile };
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
