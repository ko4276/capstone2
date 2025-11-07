import { Router, Request, Response } from 'express';
import { SolanaService } from '../services/solanaService';
import { TransactionService } from '../services/transactionService';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

const router = Router();
const solanaService = new SolanaService();
const transactionService = new TransactionService();
// 모델 정보 조회 (modelName 기반 PDA)
router.get('/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const { developerWallet } = req.query;

    if (!developerWallet) {
      return res.status(400).json({
        success: false,
        error: 'Developer wallet address is required'
      });
    }

    // 모델 계정 PDA 계산
    const modelAccountPDA = await solanaService.getModelAccountPDA(
      new (await import('@solana/web3.js')).PublicKey(developerWallet as string),
      modelName
    );

    // 계정 정보 조회
    const accountInfo = await solanaService.getAccountInfo(modelAccountPDA);

    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      data: {
        modelName,
        modelAccountPDA: modelAccountPDA.toString(),
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
    logger.error('Failed to get model:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 등록 (온체인 등록 포함)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const transactionRequest = {
      type: 'register_model' as const,
      data: req.body
    };
    
    const result = await transactionService.processTransaction(transactionRequest);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to register model:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 메타데이터 업데이트
router.put('/:modelId/metadata', async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const { developerWallet, updates } = req.body;

    if (!developerWallet) {
      return res.status(400).json({
        success: false,
        error: 'Developer wallet address is required'
      });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Updates object is required and cannot be empty'
      });
    }

    // 모델 계정 PDA 계산
    const modelAccountPDA = await solanaService.getModelAccountPDA(
      new (await import('@solana/web3.js')).PublicKey(developerWallet),
      modelId
    );

    // 계정 존재 확인
    const accountInfo = await solanaService.getAccountInfo(modelAccountPDA);
    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Model metadata update prepared successfully',
      data: {
        modelId,
        modelAccountPDA: modelAccountPDA.toString(),
        updates
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to update model metadata:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 비활성화
router.put('/:modelId/deactivate', async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const { developerWallet } = req.body;

    if (!developerWallet) {
      return res.status(400).json({
        success: false,
        error: 'Developer wallet address is required'
      });
    }

    // 모델 계정 PDA 계산
    const modelAccountPDA = await solanaService.getModelAccountPDA(
      new (await import('@solana/web3.js')).PublicKey(developerWallet),
      modelId
    );

    // 계정 존재 확인
    const accountInfo = await solanaService.getAccountInfo(modelAccountPDA);
    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Model deactivation prepared successfully',
      data: {
        modelId,
        modelAccountPDA: modelAccountPDA.toString()
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to deactivate model:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
