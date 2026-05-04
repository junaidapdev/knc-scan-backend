import { logger } from './logger';
import { env } from '@/config/env';
import { maskPhone } from './mask';
import { createApiError } from './apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import {
  TAQNYAT_API_BASE_URL,
  TAQNYAT_REQUEST_TIMEOUT_MS,
  TAQNYAT_SEND_MESSAGE_PATH,
} from '@/constants/sms';

export interface SmsProvider {
  send(phone: string, body: string): Promise<{ id: string }>;
}

export class DevSmsProvider implements SmsProvider {
  async send(phone: string, body: string): Promise<{ id: string }> {
    // Don't log the body — it contains the OTP. Phone is masked per CLAUDE.md.
    logger.info('DEV SMS SENT', {
      phone: maskPhone(phone),
      bodyLength: body.length,
    });
    return { id: `dev_sms_${Date.now()}` };
  }
}

/**
 * Subset of the Taqnyat /v1/messages response shape we actually consume.
 *
 * Taqnyat is known to return HTTP 2xx for both accepted AND rejected messages,
 * surfacing the real outcome via a `statusCode` field inside the body. We treat
 * anything non-2xx in either layer as a failure.
 */
type TaqnyatResponseBody = {
  statusCode?: number;
  messageId?: string | number;
  message?: string;
};

export class TaqnyatSmsProvider implements SmsProvider {
  async send(phone: string, body: string): Promise<{ id: string }> {
    // Taqnyat expects bare digits (e.g. 9665XXXXXXXX), no leading '+'.
    const recipient = phone.replace(/^\+/, '');
    const url = `${TAQNYAT_API_BASE_URL}${TAQNYAT_SEND_MESSAGE_PATH}`;
    const masked = maskPhone(phone);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TAQNYAT_REQUEST_TIMEOUT_MS,
    );

    let response: Response;
    let parsed: TaqnyatResponseBody;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SMS_PROVIDER_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          recipients: [recipient],
          body,
          sender: env.SMS_PROVIDER_SENDER_ID,
        }),
        signal: controller.signal,
      });

      // Defensive parse — if Taqnyat returns HTML or empty, swallow the JSON
      // parse error and treat it as an empty body (handled by the success-check
      // logic below).
      parsed = (await response
        .json()
        .catch(() => ({}))) as TaqnyatResponseBody;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      logger.error('Taqnyat request failed', { phone: masked, reason });
      throw createApiError(
        ERROR_CODES.SMS_PROVIDER_FAILED,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        { provider: 'taqnyat', reason },
      );
    } finally {
      clearTimeout(timeout);
    }

    const httpOk = response.ok;
    const bodyStatus = parsed.statusCode;
    const bodyOk =
      bodyStatus === undefined || (bodyStatus >= 200 && bodyStatus < 300);

    if (!httpOk || !bodyOk) {
      // Provider's own message can be useful in the log but never in the
      // client-facing response — surface only the codes externally.
      logger.error('Taqnyat returned non-success', {
        phone: masked,
        httpStatus: response.status,
        bodyStatus: bodyStatus ?? null,
        providerMessage: parsed.message ?? null,
      });
      throw createApiError(
        ERROR_CODES.SMS_PROVIDER_FAILED,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        {
          provider: 'taqnyat',
          httpStatus: response.status,
          bodyStatus: bodyStatus ?? null,
        },
      );
    }

    const messageId =
      parsed.messageId !== undefined
        ? String(parsed.messageId)
        : `taqnyat_${Date.now()}`;
    logger.info('Taqnyat SMS sent', { phone: masked, messageId });
    return { id: messageId };
  }
}

export function createSmsProvider(): SmsProvider {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return new DevSmsProvider();
  }
  return new TaqnyatSmsProvider();
}

export const smsProvider = createSmsProvider();
