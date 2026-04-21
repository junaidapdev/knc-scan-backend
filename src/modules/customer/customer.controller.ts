import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '@/lib/supabase';
import { signSessionToken } from '@/lib/jwt';
import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES, type ErrorCode } from '@/constants/errors';
import { computeNextEligibleAt } from '@/modules/visit/visit.service';
import type { RegisterPayload } from '@/interfaces/customer/RegisterPayload';

export async function registerCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = req.body as RegisterPayload;
    
    // Ensure the phone in the payload matches the JWT scope phone!
    if (req.customer?.phone !== payload.phone) {
      throw createApiError(ERROR_CODES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, {
        message: 'Phone number in body does not match the authenticated token',
      });
    }

    const { data, error } = await supabaseAdmin.rpc('register_customer_and_visit', {
      p_phone: payload.phone,
      p_name: payload.name,
      p_birthday_month: payload.birthday_month,
      p_birthday_day: payload.birthday_day,
      p_preferred_branch_id: payload.preferred_branch_id,
      p_language: payload.language,
      p_consent_marketing: payload.consent_marketing,
      p_branch_scan_id: payload.branch_scan_id,
    });

    if (error) {
      throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
        message: 'RPC Error during customer registration',
        details: error.message,
      });
    }

    if (!data.success) {
      const code = data.reason as string;
      const status = code === ERROR_CODES.CUSTOMER_ALREADY_EXISTS 
        ? HTTP_STATUS.CONFLICT 
        : HTTP_STATUS.UNPROCESSABLE_ENTITY;

      throw createApiError(code as ErrorCode, status, {
        message: 'Registration failed: ' + code,
      });
    }

    const { customer_id, current_stamps } = data;

    // Issue a long-lived persistent session
    const sessionToken = signSessionToken({ phone: payload.phone, customerId: customer_id });

    res.status(HTTP_STATUS.CREATED).json(apiSuccess({
      customer: { id: customer_id, phone: payload.phone, name: payload.name },
      stamp: { current: current_stamps, max: 10, reward_preview: null },
      session: { token: sessionToken }
    }));
  } catch (err) {
    next(err);
  }
}

export async function getCustomerProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customer?.customerId;
    if (!customerId) {
        throw createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, {
            message: 'Missing customer identity in token',
        });
    }

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, phone, current_stamps, last_scan_at, total_visits')
      .eq('id', customerId)
      .single();

    if (error || !data) {
      throw createApiError(ERROR_CODES.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, {
        message: 'Customer profile not found',
      });
    }

    const next_eligible_at = computeNextEligibleAt({
      last_scan_at: data.last_scan_at,
      current_stamps: data.current_stamps,
    });

    res.json(apiSuccess({ profile: { ...data, next_eligible_at } }));
  } catch (err) {
    next(err);
  }
}
