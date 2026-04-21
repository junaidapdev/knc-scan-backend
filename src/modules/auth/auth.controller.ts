import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { signRegistrationToken } from '@/lib/jwt';
import { smsProvider } from '@/lib/sms';
import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES, type ErrorCode } from '@/constants/errors';
import type { OtpRequestPayload } from '@/interfaces/auth/OtpRequestPayload';
import type { OtpVerifyPayload } from '@/interfaces/auth/OtpVerifyPayload';
import { OTP_EXPIRY_SECONDS, OTP_LENGTH } from '@/constants/business';
import { env } from '@/config/env';

export async function requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone } = req.body as OtpRequestPayload;

    // Rate-limit check: up to 3 inside 10 minutes
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from('otp_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', tenMinsAgo);

    if (countError) throw countError;

    if (count !== null && count >= 3) {
      throw createApiError(ERROR_CODES.OTP_RATE_LIMIT, HTTP_STATUS.TOO_MANY_REQUESTS, {
        message: 'Maximum OTP requests reached for this phone number. Try again later.',
      });
    }

    // Generate numeric OTP
    let otp = '';
    for (let i = 0; i < OTP_LENGTH; i++) {
      otp += crypto.randomInt(0, 10).toString();
    }

    // Hash it for DB via bcrypt
    const saltRounds = 10;
    const tokenHash = await bcrypt.hash(otp, saltRounds);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000).toISOString();

    // Store in DB
    const { error: insertError } = await supabaseAdmin.from('otp_tokens').insert({
      phone,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (insertError) throw insertError;

    // Send SMS
    const body = `Your Kayan Sweets verification code is: ${otp}`;
    await smsProvider.send(phone, body);
    
    // Log to sms_log
    await supabaseAdmin.from('sms_log').insert({
      phone,
      purpose: 'otp',
      status: 'sent',
    });

    // In dev, echo the OTP back so the frontend can display it without needing
    // to read the backend logs. Stripped in production by the NODE_ENV guard.
    const responsePayload: { message: string; devOtp?: string } = {
      message: 'OTP requested successfully',
    };
    if (env.NODE_ENV === 'development') {
      responsePayload.devOtp = otp;
    }

    res.json(apiSuccess(responsePayload));
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, otp } = req.body as OtpVerifyPayload;

    // Load the latest unconsumed OTP for this phone.
    const { data: rows, error: selectError } = await supabaseAdmin
      .from('otp_tokens')
      .select('id, token_hash, expires_at, attempts, consumed')
      .eq('phone', phone)
      .eq('consumed', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (selectError) {
      throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
        message: 'DB error during OTP verification',
        details: selectError.message,
      });
    }

    const record = rows && rows.length > 0 ? rows[0] : null;
    if (!record) {
      throw createApiError(ERROR_CODES.OTP_INVALID as ErrorCode, HTTP_STATUS.UNAUTHORIZED, {
        message: 'No unconsumed OTP for this phone',
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      throw createApiError(ERROR_CODES.OTP_EXPIRED as ErrorCode, HTTP_STATUS.UNAUTHORIZED, {
        message: 'OTP expired',
      });
    }

    if (record.attempts >= 5) {
      throw createApiError(ERROR_CODES.OTP_RATE_LIMIT as ErrorCode, HTTP_STATUS.TOO_MANY_REQUESTS, {
        message: 'Too many attempts on this OTP',
      });
    }

    // bcrypt.compare handles $2a$ / $2b$ cleanly — unlike pgcrypto.crypt().
    const isValid = await bcrypt.compare(otp, record.token_hash);

    if (!isValid) {
      await supabaseAdmin
        .from('otp_tokens')
        .update({ attempts: record.attempts + 1 })
        .eq('id', record.id);
      throw createApiError(ERROR_CODES.OTP_INVALID as ErrorCode, HTTP_STATUS.UNAUTHORIZED, {
        message: 'OTP did not match',
      });
    }

    // Success — mark consumed so it cannot be reused.
    await supabaseAdmin
      .from('otp_tokens')
      .update({ consumed: true })
      .eq('id', record.id);

    // Generate Registration Token
    const token = signRegistrationToken({ phone });
    res.json(apiSuccess({ token, scope: 'registration' }));
  } catch (err) {
    next(err);
  }
}
