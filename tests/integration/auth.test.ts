import supertest from 'supertest';
import { createApp } from '@/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HTTP_STATUS } from '@/constants/http';

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/sms', () => ({
  smsProvider: {
    send: jest.fn().mockResolvedValue({ id: 'mock_sms_123' }),
  },
}));

const app = createApp();
const request = supertest(app);

describe('Auth Module Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/otp/request', () => {
    it('should generate OTP and dispatch SMS for valid phone', async () => {
      // Mock db response: count < 3
      (supabaseAdmin.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const response = await request.post('/auth/otp/request').send({ phone: '+966500000000' });
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.success).toBe(true);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('otp_tokens');
    });

    it('should block OTP requesting when rate limited', async () => {
      // Mock db response: count = 3
      (supabaseAdmin.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ count: 3, error: null }),
          }),
        }),
      });

      const response = await request.post('/auth/otp/request').send({ phone: '+966500000000' });
      expect(response.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('OTP_RATE_LIMIT');
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('should return registration token upon successful verification', async () => {
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const response = await request.post('/auth/otp/verify').send({ phone: '+966500000000', otp: '1234' });
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.scope).toBe('registration');
    });

    it('should return UNAUTHORIZED on bad verification', async () => {
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: { success: false, reason: 'OTP_INVALID' },
        error: null,
      });

      const response = await request.post('/auth/otp/verify').send({ phone: '+966500000000', otp: '9999' });
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });
  });
});
