import { supabaseAdmin } from '@/lib/supabase';
import type { Branch } from '@/interfaces/branch/Branch';
import { createApiError } from '@/lib/apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';

export async function listActiveBranches(): Promise<Branch[]> {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('active', true)
    .order('name');
    
  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Failed to query branches from database',
      details: error.message
    });
  }
  
  return data as Branch[];
}
