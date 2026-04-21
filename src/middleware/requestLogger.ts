import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/lib/logger';
// Ambient module augmentation is picked up by tsconfig's include glob —
// no runtime import needed.

const PHONE_REGEX = /(\+?9665|05)(\d{5})(\d{3})/g;

function maskData(data: unknown): unknown {
  if (typeof data === 'string') {
    return data.replace(PHONE_REGEX, '$1XXXXX$3');
  }
  if (Array.isArray(data)) {
    return data.map(maskData);
  }
  if (data !== null && typeof data === 'object') {
    const maskedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      maskedObj[key] = maskData(value);
    }
    return maskedObj;
  }
  return data;
}

function extractStringField(
  source: unknown,
  key: string,
): string | undefined {
  if (source === null || source === undefined) return undefined;
  if (typeof source !== 'object') return undefined;
  const v = (source as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Attach a unique request id for log correlation. Downstream handlers /
  // error logs can read req.request_id. Honour an inbound X-Request-Id header
  // if present so tracing across a proxy is straightforward.
  const inbound = req.headers['x-request-id'];
  const requestId =
    typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 128
      ? inbound
      : crypto.randomUUID();
  req.request_id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const maskedBody = req.body ? maskData(req.body) : undefined;
  const maskedUrl = req.originalUrl ? String(maskData(req.originalUrl)) : req.url;

  res.on('finish', () => {
    const latencyMs = Date.now() - start;

    // Best-effort extraction of customer_id / branch_id. customer_id comes
    // from either the standardised req.auth shape or the pre-existing
    // req.customer payload. branch_id is pulled from body or query when
    // present — never invented.
    const customerId =
      req.auth?.customer_id ??
      (req.customer?.customerId as string | undefined) ??
      undefined;
    const branchId =
      extractStringField(req.body, 'branch_id') ??
      extractStringField(req.query, 'branch_id');

    logger.info('HTTP Request', {
      request_id: requestId,
      method: req.method,
      path: maskedUrl,
      status: res.statusCode,
      latency_ms: latencyMs,
      ...(customerId ? { customer_id: customerId } : {}),
      ...(branchId ? { branch_id: branchId } : {}),
      body: maskedBody,
    });
  });

  next();
}
