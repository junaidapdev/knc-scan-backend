import type { AdminUserPublic } from './AdminUserPublic';

export interface AdminLoginResult {
  token: string;
  expires_in_seconds: number;
  admin: AdminUserPublic;
}
