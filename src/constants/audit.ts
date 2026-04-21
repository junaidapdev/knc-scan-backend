/**
 * Canonical audit_log.action strings. Every admin-authenticated mutation
 * writes an audit row using one of these values so queries over the trail
 * can join on a closed set.
 */
export const AUDIT_ACTIONS = {
  ADMIN_LOGIN_SUCCESS: 'admin.login.success',
  ADMIN_LOGIN_FAILED: 'admin.login.failed',
  ADMIN_LOGOUT: 'admin.logout',

  ADMIN_CATALOG_CREATE: 'admin.catalog.create',
  ADMIN_CATALOG_UPDATE: 'admin.catalog.update',
  ADMIN_CATALOG_PAUSE: 'admin.catalog.pause',
  ADMIN_CATALOG_RESUME: 'admin.catalog.resume',
  ADMIN_CATALOG_ARCHIVE: 'admin.catalog.archive',

  ADMIN_CUSTOMER_VIEW_DETAIL: 'admin.customer.view_detail',
  ADMIN_CUSTOMER_DELETE: 'admin.customer.delete',
  ADMIN_CUSTOMER_EXPORT: 'admin.customer.export',

  ADMIN_REWARD_VIEW_DETAIL: 'admin.reward.view_detail',
  ADMIN_REWARD_VOID: 'admin.reward.void',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ENTITIES = {
  ADMIN_USER: 'admin_user',
  CATALOG: 'rewards_catalog',
  CUSTOMER: 'customer',
  REWARD_ISSUED: 'rewards_issued',
} as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];
