import { Router, Request, Response } from 'express';
import { SolanaService } from '../services/solanaService';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

const router = Router();
const solanaService = new SolanaService();

// 블록체인 연결 상태 확인
router.get('/status', async (req: Request, res: Response) => {
  try {
    // 최근 블록해시를 가져와서 연결 상태 확인
    const recentBlockhash = await solanaService.getRecentBlockhash();
    
    const response: ApiResponse = {
      success: true,
      data: {
        connected: true,
        recentBlockhash,
        timestamp: new Date().toISOString(),
        network: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to check blockchain status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to blockchain'
    });
  }
});

// 계정 잔액 조회
router.get('/balance/:publicKey', async (req: Request, res: Response) => {
  try {
    const { publicKey } = req.params;

    if (!publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Public key is required'
      });
    }

    const balance = await solanaService.getBalance(
      new (await import('@solana/web3.js')).PublicKey(publicKey)
    );

    const response: ApiResponse = {
      success: true,
      data: {
        publicKey,
        balance,
        balanceSOL: balance / (await import('@solana/web3.js')).LAMPORTS_PER_SOL
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get balance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 계정 정보 조회
router.get('/account/:publicKey', async (req: Request, res: Response) => {
  try {
    const { publicKey } = req.params;

    if (!publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Public key is required'
      });
    }

    const accountInfo = await solanaService.getAccountInfo(
      new (await import('@solana/web3.js')).PublicKey(publicKey)
    );

    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const response: ApiResponse = {
      success: true,
      data: {
        publicKey,
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
    logger.error('Failed to get account info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// PDA 계산
router.post('/pda', async (req: Request, res: Response) => {
  try {
    const { type, seeds } = req.body;

    if (!type || !seeds) {
      return res.status(400).json({
        success: false,
        error: 'Type and seeds are required'
      });
    }

    let pda: any;

    switch (type) {
      case 'model':
        if (!seeds.developerWallet || !seeds.modelName) {
          return res.status(400).json({
            success: false,
            error: 'Developer wallet and model name are required for model PDA'
          });
        }
        pda = await solanaService.getModelAccountPDA(
          new (await import('@solana/web3.js')).PublicKey(seeds.developerWallet),
          seeds.modelName
        );
        break;

      case 'subscription':
        if (!seeds.modelPubkey || !seeds.userWallet) {
          return res.status(400).json({
            success: false,
            error: 'Model pubkey and user wallet are required for subscription PDA'
          });
        }
        pda = await solanaService.getSubscriptionReceiptPDA(
          new (await import('@solana/web3.js')).PublicKey(seeds.modelPubkey),
          new (await import('@solana/web3.js')).PublicKey(seeds.userWallet)
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported PDA type'
        });
    }

    const response: ApiResponse = {
      success: true,
      data: {
        type,
        pda: pda.toString(),
        seeds
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to calculate PDA:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 로열티 분배 계산 (기존 방식)
router.post('/royalty-calculation', async (req: Request, res: Response) => {
  try {
    const { totalLamports, royaltyBps } = req.body;

    if (totalLamports === undefined || royaltyBps === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Total lamports and royalty BPS are required'
      });
    }

    const distribution = solanaService.calculateRoyaltyDistribution(
      parseInt(totalLamports),
      parseInt(royaltyBps)
    );

    const response: ApiResponse = {
      success: true,
      data: {
        input: {
          totalLamports: parseInt(totalLamports),
          royaltyBps: parseInt(royaltyBps)
        },
        distribution
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to calculate royalty distribution:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 계보 기반 로열티 분배 계산
router.post('/lineage-royalty-calculation', async (req: Request, res: Response) => {
  try {
    const { modelPubkey, totalLamports, maxDepth, platformFeeBps, minRoyaltyLamports } = req.body;

    if (!modelPubkey || totalLamports === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Model pubkey and total lamports are required'
      });
    }

    // 계보 추적
    const modelPDA = new (await import('@solana/web3.js')).PublicKey(modelPubkey);
    const lineageTrace = await solanaService.traceLineage(modelPDA, maxDepth || 32);

    if (!lineageTrace.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lineage detected',
        data: {
          violations: lineageTrace.violations
        }
      });
    }

    // 계보 기반 로열티 분배 계산
    const distribution = solanaService.calculateLineageRoyaltyDistribution(
      parseInt(totalLamports),
      lineageTrace,
      platformFeeBps || parseInt(process.env.PLATFORM_FEE_BPS || '500'),
      minRoyaltyLamports || parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000')
    );

    const response: ApiResponse = {
      success: true,
      data: {
        input: {
          modelPubkey,
          totalLamports: parseInt(totalLamports),
          maxDepth: maxDepth || 32,
          platformFeeBps: platformFeeBps || parseInt(process.env.PLATFORM_FEE_BPS || '500'),
          minRoyaltyLamports: minRoyaltyLamports || parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000')
        },
        lineageTrace: {
          totalDepth: lineageTrace.totalDepth,
          isValid: lineageTrace.isValid,
          lineage: lineageTrace.lineage.map(l => ({
            modelPDA: l.modelPDA.toString(),
            modelName: l.modelName,
            developerWallet: l.developerWallet.toString(),
            royaltyBps: l.royaltyBps,
            depth: l.depth,
            parentPDA: l.parentPDA?.toString()
          }))
        },
        distribution
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to calculate lineage-based royalty distribution:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 계보 추적
router.post('/trace-lineage', async (req: Request, res: Response) => {
  try {
    const { modelPubkey, maxDepth } = req.body;

    if (!modelPubkey) {
      return res.status(400).json({
        success: false,
        error: 'Model pubkey is required'
      });
    }

    const modelPDA = new (await import('@solana/web3.js')).PublicKey(modelPubkey);
    const lineageTrace = await solanaService.traceLineage(modelPDA, maxDepth || 32);

    const response: ApiResponse = {
      success: true,
      data: {
        input: {
          modelPubkey,
          maxDepth: maxDepth || 32
        },
        lineageTrace: {
          totalDepth: lineageTrace.totalDepth,
          isValid: lineageTrace.isValid,
          violations: lineageTrace.violations,
          lineage: lineageTrace.lineage.map(l => ({
            modelPDA: l.modelPDA.toString(),
            modelName: l.modelName,
            developerWallet: l.developerWallet.toString(),
            royaltyBps: l.royaltyBps,
            depth: l.depth,
            parentPDA: l.parentPDA?.toString()
          }))
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to trace lineage:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
