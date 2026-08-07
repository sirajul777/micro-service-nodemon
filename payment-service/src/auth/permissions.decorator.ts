import { SetMetadata } from '@nestjs/common';

export type PermissionKey =
  | 'viewDashboard'
  | 'manageVoucher'
  | 'manageBilling'
  | 'manageReseller'
  | 'managePppoe'
  | 'manageHotspot'
  | 'viewReport'
  | 'manageSystem';

export const PERMISSIONS_KEY = 'required_permissions';

export const RequirePermission = (...perms: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

