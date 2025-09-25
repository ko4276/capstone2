import { Router, Request, Response } from 'express';
import { SolanaService } from '../services/solanaService';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

const router = Router();
const solanaService = new SolanaService();

// 구독 영수증 조회
router.get('/receipt/:modelPubkey/:userWallet', async (req: Request, res: Response) => {
  try {
    const { modelPubkey, userWallet } = req.params;

    // 구독 영수증 PDA 계산
    const subscriptionReceiptPDA = await solanaService.getSubscriptionReceiptPDA(
      new (await import('@solana/web3.js')).PublicKey(modelPubkey),
      new (await import('@solana/web3.js')).PublicKey(userWallet)
    );

    // 계정 정보 조회
    const accountInfo = await solanaService.getAccountInfo(subscriptionReceiptPDA);

    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Subscription receipt not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      data: {
        modelPubkey,
        userWallet,
        subscriptionReceiptPDA: subscriptionReceiptPDA.toString(),
        accountInfo: {
          executable: accountInfo.executable,
          owner: accountInfo.owner.toString(),
          lamports: accountInfo.lamports,
          dataLength: accountInfo.data.length,
          rentEpoch: accountInfo.rentEpoch
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get subscription receipt:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 구독 구매
router.post('/purchase', async (req: Request, res: Response) => {
  try {
    const subscriptionData = req.body;

    // 필수 필드 검증
    const requiredFields = ['userWallet', 'modelPubkey', 'durationDays', 'expectedPriceLamports'];
    for (const field of requiredFields) {
      if (!subscriptionData[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`
        });
      }
    }

    // 구독 영수증 PDA 계산
    const subscriptionReceiptPDA = await solanaService.getSubscriptionReceiptPDA(
      new (await import('@solana/web3.js')).PublicKey(subscriptionData.modelPubkey),
      new (await import('@solana/web3.js')).PublicKey(subscriptionData.userWallet)
    );

    // 이미 구독했는지 확인
    const existingReceipt = await solanaService.getAccountInfo(subscriptionReceiptPDA);
    if (existingReceipt) {
      return res.status(409).json({
        success: false,
        error: 'Subscription already exists for this user and model'
      });
    }

    // 사용자 잔액 확인
    const userBalance = await solanaService.getBalance(
      new (await import('@solana/web3.js')).PublicKey(subscriptionData.userWallet)
    );

    if (userBalance < subscriptionData.expectedPriceLamports) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance for subscription'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Subscription purchase data prepared successfully',
      data: {
        userWallet: subscriptionData.userWallet,
        modelPubkey: subscriptionData.modelPubkey,
        subscriptionReceiptPDA: subscriptionReceiptPDA.toString(),
        durationDays: subscriptionData.durationDays,
        expectedPriceLamports: subscriptionData.expectedPriceLamports,
        slippageBps: subscriptionData.slippageBps || 50,
        userBalance
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to purchase subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 구독 상태 확인
router.get('/status/:modelPubkey/:userWallet', async (req: Request, res: Response) => {
  try {
    const { modelPubkey, userWallet } = req.params;

    // 구독 영수증 PDA 계산
    const subscriptionReceiptPDA = await solanaService.getSubscriptionReceiptPDA(
      new (await import('@solana/web3.js')).PublicKey(modelPubkey),
      new (await import('@solana/web3.js')).PublicKey(userWallet)
    );

    // 계정 정보 조회
    const accountInfo = await solanaService.getAccountInfo(subscriptionReceiptPDA);

    const isSubscribed = !!accountInfo;

    const response: ApiResponse = {
      success: true,
      data: {
        modelPubkey,
        userWallet,
        isSubscribed,
        subscriptionReceiptPDA: subscriptionReceiptPDA.toString(),
        ...(accountInfo && {
          accountInfo: {
            executable: accountInfo.executable,
            owner: accountInfo.owner.toString(),
            lamports: accountInfo.lamports,
            dataLength: accountInfo.data.length,
            rentEpoch: accountInfo.rentEpoch
          }
        })
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to check subscription status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 구독 취소 (미래 구현)
router.delete('/cancel/:modelPubkey/:userWallet', async (req: Request, res: Response) => {
  try {
    const { modelPubkey, userWallet } = req.params;

    // 구독 영수증 PDA 계산
    const subscriptionReceiptPDA = await solanaService.getSubscriptionReceiptPDA(
      new (await import('@solana/web3.js')).PublicKey(modelPubkey),
      new (await import('@solana/web3.js')).PublicKey(userWallet)
    );

    // 계정 존재 확인
    const accountInfo = await solanaService.getAccountInfo(subscriptionReceiptPDA);
    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Subscription cancellation prepared successfully',
      data: {
        modelPubkey,
        userWallet,
        subscriptionReceiptPDA: subscriptionReceiptPDA.toString()
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
