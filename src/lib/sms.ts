import { logger } from './logger';
import { env } from '@/config/env';

export interface SmsProvider {
  send(phone: string, body: string): Promise<{ id: string }>;
}

export class DevSmsProvider implements SmsProvider {
  async send(phone: string, body: string): Promise<{ id: string }> {
    logger.info('DEV SMS SENT', { phone, body });
    return { id: `dev_sms_${Date.now()}` };
  }
}

export class UnifonicSmsProvider implements SmsProvider {
  async send(phone: string, body: string): Promise<{ id: string }> {
    // TODO: Implement actual Unifonic API call using env.SMS_PROVIDER_API_KEY
    // For now, act as a stub
    logger.info('UNIFONIC STUB SMS SENT', { phone, body });
    return { id: `uni_stub_${Date.now()}` };
  }
}

export function createSmsProvider(): SmsProvider {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return new DevSmsProvider();
  }
  return new UnifonicSmsProvider();
}

export const smsProvider = createSmsProvider();
