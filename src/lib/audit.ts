import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import type { AuditAction, AuditEntity } from '@/constants/audit';

export interface AuditLogParams {
  action: AuditAction;
  adminId?: string | null;
  entityType?: AuditEntity | null;
  entityId?: string | null;
  phone?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Best-effort audit trail insert. NEVER throws — audit failures must not
 * block the mutating request. Mirrors the scan_lookup audit pattern.
 */
export async function writeAudit(params: AuditLogParams): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('audit_log').insert({
      action: params.action,
      admin_id: params.adminId ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      phone: params.phone ?? null,
      ip: params.ip ?? null,
      metadata: params.metadata ?? null,
    });
    if (error) {
      logger.warn('audit_log insert failed', {
        action: params.action,
        message: error.message,
      });
    }
  } catch (err) {
    // Belt-and-suspenders: audit writes must never fail the surrounding
    // request. Swallow all throws.
    logger.warn('audit_log insert threw', {
      action: params.action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
