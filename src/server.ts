import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { apiSuccess, apiError } from '@/lib/apiResponse';
import { initSentry, captureException, flushSentry } from '@/lib/sentry';
import { supabaseAdmin } from '@/lib/supabase';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { branchRoutes } from '@/modules/branch';
import { authRoutes } from '@/modules/auth';
import { customerRoutes } from '@/modules/customer';
import { visitRoutes } from '@/modules/visit';
import { adminCatalog, rewardRoutes } from '@/modules/reward';
import { adminRouter } from '@/modules/admin';
import { bootstrapAdminIfNeeded } from '@/lib/adminBootstrap';

const READINESS_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

export function createApp(): Application {
  // Sentry initialises before anything else so errors thrown during the rest
  // of createApp() still land in Sentry. No-op when SENTRY_DSN is unset.
  initSentry();

  const app = express();

  // Trust one reverse-proxy hop so req.ip reflects the real client IP when
  // deployed behind Vercel / Nginx / similar. Tune if you add more hops.
  app.set('trust proxy', 1);

  // JSON API: no HTML surface means we don't need a CSP (would only confuse
  // browser-based API explorers). Keep CORP cross-origin so the PWA on a
  // different origin can embed any error images / payloads we ever return.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger);

  app.get('/health', (_req: Request, res: Response): void => {
    res.json(apiSuccess({ status: 'ok' }));
  });

  // Readiness probe — tells a load balancer / k8s whether the process has a
  // working DB connection. Distinct from /health which is pure liveness.
  app.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    try {
      const readinessCheck = supabaseAdmin
        .from('branches')
        .select('id')
        .limit(1);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Readiness check timed out'));
        }, READINESS_TIMEOUT_MS);
      });

      const result = await Promise.race([readinessCheck, timeoutPromise]);
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        throw new Error(String((result.error as { message?: string }).message ?? 'supabase error'));
      }
      res.json(apiSuccess({ status: 'ready' }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn('Readiness check failed', { reason });
      res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(apiError(ERROR_CODES.SERVICE_NOT_READY, { reason }));
    }
  });

  // Feature routers mount here as they are built, e.g.:
  app.use('/branches', branchRoutes);
  app.use('/auth', authRoutes);
  app.use('/customers', customerRoutes);
  app.use('/visits', visitRoutes);
  app.use('/admin/rewards/catalog', adminCatalog);
  app.use('/admin', adminRouter);
  app.use('/rewards', rewardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function start(): Promise<void> {
  const app = createApp();
  // Non-blocking bootstrap: we still start the listener even if the bootstrap
  // insert fails (see adminBootstrap for retry-safe idempotency).
  bootstrapAdminIfNeeded().catch((err: unknown) => {
    logger.warn('admin bootstrap threw', {
      message: err instanceof Error ? err.message : String(err),
    });
  });
  const server = app.listen(env.PORT, () => {
    logger.info('Kayan backend listening', {
      port: env.PORT,
      env: env.NODE_ENV,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals | 'uncaughtException' | 'unhandledRejection'): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutdown signal received', { signal });

    const forceExit = setTimeout(() => {
      logger.warn('Shutdown timeout exceeded, forcing exit', {
        timeout_ms: SHUTDOWN_TIMEOUT_MS,
      });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Don't let the timeout keep the event loop alive on its own.
    forceExit.unref();

    server.close((err?: Error) => {
      void flushSentry().finally(() => {
        if (err) {
          logger.error('Error closing server', { message: err.message });
          process.exit(1);
        }
        logger.info('Server closed cleanly');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err: Error) => {
    logger.error('uncaughtException', { message: err.message, stack: err.stack });
    captureException(err, { source: 'uncaughtException' });
    void flushSentry().finally(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('unhandledRejection', { message: err.message, stack: err.stack });
    captureException(err, { source: 'unhandledRejection' });
    void flushSentry().finally(() => {
      process.exit(1);
    });
  });
}

// Only start the HTTP listener when this file is the entry point. This keeps
// createApp() importable from tests without side effects.
if (require.main === module) {
  void start();
}
