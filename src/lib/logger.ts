/* eslint-disable no-console */
// This file is the ONLY place in the codebase where console.* is permitted.
// Every other module must import and use this logger instead.

import winston from 'winston';
import { env } from '@/config/env';

const { combine, timestamp, errors, json, colorize, printf, splat } =
  winston.format;

const prettyFormat = printf(({ level, message, timestamp: ts, stack, ...rest }) => {
  const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  const base = `${ts as string} [${level}] ${stack ?? message}${meta}`;
  return base;
});

const isProduction = env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp(),
    splat(),
    isProduction ? json() : combine(colorize(), prettyFormat),
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

export type Logger = typeof logger;
