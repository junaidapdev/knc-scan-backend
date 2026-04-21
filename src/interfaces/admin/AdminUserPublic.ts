/**
 * Subset of admin_users returned to the admin client. Excludes password_hash
 * and throttling columns — those never leave the server.
 */
export interface AdminUserPublic {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer';
  last_login_at: string | null;
}
