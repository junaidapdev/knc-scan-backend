import supertest from 'supertest';
import { createApp } from '@/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HTTP_STATUS } from '@/constants/http';
import { signRegistrationToken } from '@/lib/jwt';

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const app = createApp();
const request = supertest(app);

describe('Customer Registration Integration', () => {
  const mockPhone = '+966500000000';
  let regToken: string;

  beforeEach(() => {
    jest.clearAllMocks();
    regToken = signRegistrationToken({ phone: mockPhone });
  });

  describe('POST /customers/register', () => {
    const validBody = {
      phone: mockPhone,
      name: 'John Doe',
      birthday_month: 5,
      birthday_day: 15,
      preferred_branch_id: '123e4567-e89b-12d3-a456-426614174000',
      language: 'en',
      consent_marketing: true,
      branch_scan_id: '123e4567-e89b-12d3-a456-426614174001'
    };

    it('should register successfully and issue session token', async () => {
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: { success: true, customer_id: 'cust-123', visit_id: 'visit-123', current_stamps: 1 },
        error: null,
      });

      const response = await request
        .post('/customers/register')
        .set('Authorization', `Bearer ${regToken}`)
        .send(validBody);
        
      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session.token).toBeDefined();
      expect(response.body.data.customer.id).toBe('cust-123');
    });

    it('should fail if phone already exists', async () => {
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: { success: false, reason: 'CUSTOMER_ALREADY_EXISTS' },
        error: null,
      });

      const response = await request
        .post('/customers/register')
        .set('Authorization', `Bearer ${regToken}`)
        .send(validBody);
        
      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body.error.code).toBe('CUSTOMER_ALREADY_EXISTS');
    });
  });
});
