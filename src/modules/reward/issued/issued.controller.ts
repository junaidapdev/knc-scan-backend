import type { Request, Response, NextFunction } from 'express';
import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import {
  signRedemptionToken,
  verifyRedemptionToken,
} from '@/lib/jwt';
import { findBranchByQrIdentifier } from '@/modules/visit/visit.service';
import type {
  RedemptionStep1Payload,
  RedemptionStep2Payload,
  RedemptionConfirmation,
} from '@/interfaces/reward';
import {
  listCustomerRewards,
  findRewardForStep1,
  redeemReward,
} from './issued.service';

const REDEMPTION_TOKEN_HEADER = 'x-redemption-token';

export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Missing customer identity in token',
      });
    }
    const rewards = await listCustomerRewards(customerId);
    res.json(apiSuccess(rewards));
  } catch (err) {
    next(err);
  }
}

export async function confirmStep1(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }
    const { branch_qr_identifier } = req.body as RedemptionStep1Payload;
    const { unique_code } = req.params;

    const branch = await findBranchByQrIdentifier(branch_qr_identifier);
    if (!branch) {
      throw createApiError(ERROR_CODES.BRANCH_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    if (!branch.active) {
      throw createApiError(ERROR_CODES.BRANCH_INACTIVE, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    const reward = await findRewardForStep1(unique_code);
    if (!reward) {
      throw createApiError(ERROR_CODES.REWARD_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    if (reward.customer_id !== customerId) {
      throw createApiError(ERROR_CODES.REWARD_NOT_OWNED, HTTP_STATUS.FORBIDDEN);
    }
    if (reward.status === 'redeemed') {
      throw createApiError(ERROR_CODES.REWARD_NOT_PENDING, HTTP_STATUS.CONFLICT, {
        message: 'Reward has already been redeemed',
      });
    }
    if (reward.status === 'expired' || Date.parse(reward.expires_at) < Date.now()) {
      throw createApiError(ERROR_CODES.REWARD_EXPIRED, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    const token = signRedemptionToken({
      unique_code,
      customer_id: customerId,
      branch_id: branch.id,
    });

    const response: RedemptionConfirmation = {
      redemption_token: token,
      summary: {
        customer_name: reward.customer_name,
        reward_name: { en: reward.reward_name_snapshot, ar: reward.reward_name_snapshot_ar },
        unique_code: reward.unique_code,
        expires_at: reward.expires_at,
      },
    };

    res.json(apiSuccess(response));
  } catch (err) {
    next(err);
  }
}

export async function confirmStep2(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }
    const { unique_code } = req.params;
    const { branch_qr_identifier, device_fingerprint } = req.body as RedemptionStep2Payload;

    // Verify the step-1 token.
    const tokenStr = req.header(REDEMPTION_TOKEN_HEADER);
    if (!tokenStr) {
      throw createApiError(ERROR_CODES.INVALID_REDEMPTION_TOKEN, HTTP_STATUS.UNAUTHORIZED, {
        message: `Missing ${REDEMPTION_TOKEN_HEADER} header`,
      });
    }
    const tokenPayload = verifyRedemptionToken(tokenStr);
    if (
      tokenPayload.unique_code !== unique_code ||
      tokenPayload.customer_id !== customerId
    ) {
      throw createApiError(ERROR_CODES.INVALID_REDEMPTION_TOKEN, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Redemption token does not match the current request',
      });
    }

    const branch = await findBranchByQrIdentifier(branch_qr_identifier);
    if (!branch) {
      throw createApiError(ERROR_CODES.BRANCH_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    if (!branch.active) {
      throw createApiError(ERROR_CODES.BRANCH_INACTIVE, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }
    // The branch must match what step 1 captured — prevents swapping branches
    // mid-redemption.
    if (tokenPayload.branch_id !== branch.id) {
      throw createApiError(ERROR_CODES.INVALID_REDEMPTION_TOKEN, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Branch in step 2 does not match step 1',
      });
    }

    const result = await redeemReward({
      uniqueCode: unique_code,
      customerId,
      branchId: branch.id,
      ip: req.ip,
      deviceFingerprint: device_fingerprint,
    });

    if (!result.success) {
      switch (result.reason) {
        case 'REWARD_NOT_FOUND':
          throw createApiError(ERROR_CODES.REWARD_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        case 'REWARD_NOT_OWNED':
          throw createApiError(ERROR_CODES.REWARD_NOT_OWNED, HTTP_STATUS.FORBIDDEN);
        case 'REWARD_ALREADY_REDEEMED':
        case 'REWARD_EXPIRED':
          throw createApiError(ERROR_CODES.REWARD_NOT_PENDING, HTTP_STATUS.CONFLICT, {
            reason: result.reason,
          });
        default:
          throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
            details: result.detail,
          });
      }
    }

    res.json(apiSuccess(result.reward));
  } catch (err) {
    next(err);
  }
}
