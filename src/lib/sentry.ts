import * as Sentry from '@sentry/node';

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

let initialized = false;

/**
 * Initialise Sentry. Must be called once, at the very top of createApp(),
 * before any other middleware so Sentry can capture the widest possible
 * surface area (including errors thrown during route registration).
 *
 * When SENTRY_DSN is unset this function is a no-op — exports below also
 * become no-ops. Keeps Sentry an entirely optional dependency at runtime.
 */
export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  if (!env.SENTRY_DSN) {
    logger.info('Sentry disabled (SENTRY_DSN not set)');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.APP_RELEASE ?? 'dev',
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });

  logger.info('Sentry initialised', {
    environment: env.NODE_ENV,
    release: env.APP_RELEASE ?? 'dev',
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });
}

export interface CaptureContext {
  request_id?: string;
  customer_id?: string;
  branch_id?: string;
  path?: string;
  method?: string;
  status?: number;
  [key: string]: unknown;
}

/**
 * Report an exception to Sentry. No-op when SENTRY_DSN is unset.
 * Never throws — capturing errors must never add failures of its own.
 */
export function captureException(err: unknown, ctx?: CaptureContext): void {
  if (!env.SENTRY_DSN) return;
  try {
    if (ctx) {
      Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries(ctx)) {
          scope.setExtra(key, value);
        }
        Sentry.captureException(err);
      });
    } else {
      Sentry.captureException(err);
    }
  } catch (inner) {
    logger.warn('Sentry captureException failed', {
      message: inner instanceof Error ? inner.message : String(inner),
    });
  }
}

/**
 * Flush pending Sentry events. Called from the graceful-shutdown handler
 * so in-flight error reports aren't dropped when the process exits.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch (err) {
    logger.warn('Sentry flush failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
