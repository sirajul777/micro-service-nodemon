import {
  BadRequestException,
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

@Controller('mikrotik')
@UseGuards(JwtAuthGuard)
export class HotspotController {
  constructor(
    private readonly mikrotik: MikrotikGrpcClient,
    private readonly profileMeta: ProfileMetaService,
  ) {}

  @Get(':session/dashboard') @RequirePermission('viewDashboard')
  async dashboard(@Param('session') session: string) {
    const resp = await this.mikrotik.getDashboard(session); if (!resp.success) throw new BadRequestException(resp.error || 'Gagal memuat dashboard');
    return { identity: resp.identity, rosVersion: resp.rosVersion || resp.version?.charAt(0) || '7', resource: { version: resp.version, uptime: resp.uptime, 'cpu-load': resp.cpuLoad, 'free-memory': resp.freeMemory, 'total-memory': resp.totalMemory, 'free-hdd-space': resp.freeHdd, 'total-hdd-space': resp.totalHdd }, routerboard: {}, clock: {}, health: [], hotspot: { active: resp.activeHotspotUsers ?? 0, total: resp.totalHotspotUsers ?? 0 } };
  }

  @Get(':session/hotspot/active') @RequirePermission('viewDashboard')
  async activeUsers(@Param('session') session: string) { const resp = await this.mikrotik.listActiveHotspotUsers(session, ''); if (!resp.success) throw new BadRequestException(resp.error || 'Gagal memuat user aktif'); return resp.users || []; }

  @Get(':session/hotspot/users') @RequirePermission('viewDashboard')
  async listUsers(@Param('session') session:string,@Query('profile') profile?:string,@Query('comment') comment?:string){const resp=await this.mikrotik.listHotspotUsers({sessionId:session,profile:profile||'',comment:comment||''});if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat user');return resp.users||[];}
  @Post(':session/hotspot/users') @RequirePermission('manageHotspot')
  async addUser(@Param('session') session:string,@Body() body:{name:string;password?:string;profile?:string;comment?:string;limitUptime?:string}){if(!body.name)return{success:false,error:'name wajib diisi'};return this.mikrotik.addHotspotUser({sessionId:session,name:body.name,password:body.password||'',profile:body.profile||'',comment:body.comment||'',limitUptime:body.limitUptime||''});}
  @Delete(':session/hotspot/users/:name') @RequirePermission('manageHotspot')
  async removeUser(@Param('session') session:string,@Param('name') name:string){return this.mikrotik.removeHotspotUser(session,name);}
  @Post(':session/hotspot/users/bulk-delete') @RequirePermission('manageHotspot')
  async bulkDeleteUsers(@Param('session') session:string,@Body() body:{names?:string[]}){const names=Array.isArray(body?.names)?body.names.filter(Boolean):[];if(!names.length)return{success:false,error:'names wajib diisi (array)'};const resp=await this.mikrotik.bulkRemoveHotspotUsers(session,names);return resp.success?{success:true,removed:resp.removed||0,failed:resp.failedNames||[]}:{success:false,error:resp.error||'Gagal menghapus user'};}

  @Get(':session/hotspot/profiles') @RequirePermission('viewDashboard')
  async listProfiles(@Param('session') session:string){const resp=await this.mikrotik.listHotspotProfiles(session);if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat profile');const meta=await this.profileMeta.getAllForSession('hotspot',session);return(resp.profiles||[]).map((p:any)=>mergeProfile(p,meta[p.name]));}
  @Get(':session/hotspot/profiles/:name') @RequirePermission('viewDashboard')
  async getProfile(@Param('session') session:string,@Param('name') name:string){const resp=await this.mikrotik.getHotspotProfile(session,name);if(!resp.success)throw new BadRequestException(resp.error||'Profile tidak ditemukan');if(!resp.profile)return null;return mergeProfile(resp.profile,await this.profileMeta.get('hotspot',session,name));}
  @Post(':session/hotspot/profiles') @RequirePermission('manageHotspot')
  async addProfile(@Param('session') session:string,@Body() body:any){if(!body?.name)return{success:false,error:'name wajib diisi'};const price=parseFloat(body.price)||0,sprice=parseFloat(body.sprice)||0,validity=(body.validity||'').trim(),expmode=body.expmode||'remc',lockUser=body.lockUser||'';const resInfo=await this.mikrotik.getSystemResource(session);const rosVer=resInfo?.version?.charAt(0)==='6'?'6':'7';const onLogin=buildOnLoginScript(expmode,price,validity,sprice,lockUser,body.name,rosVer);const resp=await this.mikrotik.addHotspotProfile({sessionId:session,name:body.name,onLogin,sessionTimeout:body['session-timeout']||'',idleTimeout:body['idle-timeout']||'',rateLimit:body['rate-limit']||'',sharedUsers:body['shared-users']||'',addressPool:body['address-pool']||''});if(!resp.success)return{success:false,error:resp.error};await this.profileMeta.set('hotspot',session,body.name,{price,validity,...(body.profileColor?{profileColor:body.profileColor}:{}),...(body.caption!==undefined?{caption:body.caption}:{})});await this.mikrotik.setupExpiryScheduler(session);return{success:true};}
  @Put(':session/hotspot/profiles/:name') @RequirePermission('manageHotspot')
  async editProfile(@Param('session') session:string,@Param('name') name:string,@Body() body:any){const existing=await this.mikrotik.getHotspotProfile(session,name);if(!existing.success||!existing.profile)return{success:false,error:existing.error||'Profile not found'};const currentMeta=parseOnLogin(existing.profile.onLogin||''),newPrice=body.price!==undefined?parseFloat(body.price):currentMeta.price,newSprice=body.sprice!==undefined?parseFloat(body.sprice):currentMeta.sprice,newValidity=body.validity!==undefined?(body.validity||'').trim():currentMeta.validity,newExpmode=body.expmode!==undefined?body.expmode:currentMeta.expmode,newLockUser=body.lockUser!==undefined?body.lockUser:currentMeta.lockUser;const resInfo=await this.mikrotik.getSystemResource(session),rosVer=resInfo?.version?.charAt(0)==='6'?'6':'7';const metaChanged=body.price!==undefined||body.validity!==undefined||body.expmode!==undefined||body.lockUser!==undefined;let newOnLogin:string;if(metaChanged)newOnLogin=buildOnLoginScript(newExpmode,newPrice,newValidity,newSprice,newLockUser,name,rosVer);else{const header=buildOnLoginHeader(newExpmode,newPrice,newValidity,newSprice,newLockUser),oldBody=(existing.profile.onLogin||'').replace(/:put\s*\("[^"]*"\);?\s*/g,'').trim();newOnLogin=oldBody?`${header} ${oldBody}`:header;}const resp=await this.mikrotik.updateHotspotProfile({sessionId:session,name,onLogin:newOnLogin,sessionTimeout:body['session-timeout']!==undefined?body['session-timeout']||'00:00:00':'',idleTimeout:body['idle-timeout']!==undefined?body['idle-timeout']||'00:00:00':'',rateLimit:body['rate-limit']!==undefined?body['rate-limit']||'':'',sharedUsers:body['shared-users']!==undefined?body['shared-users']||'1':'',addressPool:body['address-pool']!==undefined?body['address-pool']||'none':''});if(!resp.success)return{success:false,error:resp.error};await this.profileMeta.set('hotspot',session,name,{price:newPrice,validity:newValidity,...(body.profileColor?{profileColor:body.profileColor}:{}),...(body.caption!==undefined?{caption:body.caption}:{})});await this.mikrotik.setupExpiryScheduler(session);return{success:true};}
  @Delete(':session/hotspot/profiles/:name') @RequirePermission('manageHotspot')
  async deleteProfile(@Param('session') session:string,@Param('name') name:string){const resp=await this.mikrotik.deleteHotspotProfile(session,name);if(!resp.success)return{success:false,error:resp.error||'Not found'};await this.profileMeta.remove('hotspot',session,name);return{success:true};}
  @Get(':session/hotspot/profile-meta') @RequirePermission('viewDashboard') async getProfileMeta(@Param('session') session:string){return this.profileMeta.getAllForSession('hotspot',session);}
  @Get(':session/interfaces') @RequirePermission('viewDashboard') async interfaces(@Param('session') session:string){const resp=await this.mikrotik.getInterfaces(session);if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat interface');return resp.interfaces||[];}
  @Get(':session/interface/traffic/:ifname') @RequirePermission('viewDashboard') async traffic(@Param('session') session:string,@Param('ifname') ifname:string){const resp=await this.mikrotik.getInterfaces(session);if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat interface');const ifc=(resp.interfaces||[]).find((i:any)=>i.name===ifname||i.id===ifname);return{interface:ifc||null,tx:ifc?.tx||'',rx:ifc?.rx||''};}
  @Get(':session/system/resource') @RequirePermission('viewDashboard') async systemResource(@Param('session') session:string){const resp=await this.mikrotik.getSystemResource(session);if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat resource');const{success,error,...rest}=resp;return rest;}

  @Get(':session/hotspot/log') @RequirePermission('viewDashboard')
  async hotspotLog(@Param('session') session:string,@Query('topics') topics?:string){const resp=await this.mikrotik.listLogs(session,topics||'');if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat log MikroTik');return(resp.logs||[]).map((log:any)=>({id:log.id,time:log.time,topics:log.topics,message:log.message}));}

  @Get(':session/scheduler') @RequirePermission('viewDashboard')
  async scheduler(@Param('session') session:string){const resp=await this.mikrotik.listSchedulers(session);if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat scheduler');return resp.schedulers||[];}

  @Get(':session/dhcp/leases') @RequirePermission('viewDashboard')
  async dhcpLeases(@Param('session') session:string){const resp=await this.mikrotik.listDhcpLeases(session);if(!resp.success)throw new BadRequestException(resp.error||'Gagal memuat DHCP lease');return(resp.leases||[]).map((lease:any)=>({id:lease.id,address:lease.address,macAddress:lease.macAddress,clientId:lease.clientId,server:lease.server,status:lease.status,expiresAfter:lease.expiresAfter,lastSeen:lease.lastSeen,activeAddress:lease.activeAddress,activeMacAddress:lease.activeMacAddress,hostName:lease.hostName,comment:lease.comment,disabled:lease.disabled}));}
}
