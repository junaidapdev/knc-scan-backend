import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type {
  CatalogItem,
  CatalogCreatePayload,
  CatalogUpdatePayload,
  CatalogStatus,
} from '@/interfaces/reward';

const TABLE = 'rewards_catalog';

function internal(detail: string, msg: string): never {
  throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    message: msg,
    details: detail,
  });
}

export async function listCatalog(status?: CatalogStatus): Promise<CatalogItem[]> {
  let builder = supabaseAdmin.from(TABLE).select('*').order('created_at', { ascending: false });
  if (status) builder = builder.eq('status', status);
  const { data, error } = await builder;
  if (error) internal(error.message, 'Failed to list catalog');
  return (data ?? []) as CatalogItem[];
}

export async function createCatalogItem(
  payload: CatalogCreatePayload,
): Promise<CatalogItem> {
  const insertRow = {
    code_prefix: payload.code_prefix,
    name_en: payload.name_en,
    name_ar: payload.name_ar,
    description_en: payload.description_en ?? null,
    description_ar: payload.description_ar ?? null,
    image_url: payload.image_url ?? null,
    estimated_value_sar: payload.estimated_value_sar,
    default_expiry_days: payload.default_expiry_days,
    status: payload.status ?? 'active',
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    // Postgres unique_violation on code_prefix
    if (error.code === '23505') {
      throw createApiError(
        ERROR_CODES.CATALOG_CODE_PREFIX_TAKEN,
        HTTP_STATUS.CONFLICT,
        { message: `code_prefix ${payload.code_prefix} already exists` },
      );
    }
    internal(error.message, 'Failed to create catalog item');
  }
  return data as CatalogItem;
}

export async function updateCatalogItem(
  id: string,
  payload: CatalogUpdatePayload,
): Promise<CatalogItem> {
  // Only update fields the caller sent — Supabase treats undefined as "unset"
  // but we want to be explicit to avoid surprises.
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) patch[k] = v;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) internal(error.message, 'Failed to update catalog item');
  if (!data) {
    throw createApiError(
      ERROR_CODES.CATALOG_ITEM_NOT_FOUND,
      HTTP_STATUS.NOT_FOUND,
      { message: `catalog item ${id} not found` },
    );
  }
  return data as CatalogItem;
}

export async function setCatalogStatus(
  id: string,
  status: CatalogStatus,
): Promise<CatalogItem> {
  return updateCatalogItem(id, { status });
}
