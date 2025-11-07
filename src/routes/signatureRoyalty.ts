import { Router, Request, Response } from 'express';
import { SolanaService } from '../services/solanaService';
import { logger } from '../utils/logger';
import Joi from 'joi';

const router = Router();
const solanaService = new SolanaService();

// 트랜잭션 시그니처로 계보 추적 및 로열티 분배
router.post('/process-signature-royalty', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      transactionSignature: Joi.string().required(),
      modelPDA: Joi.string().required(),
      platformFeeBps: Joi.number().integer().min(0).max(10000).optional(),
      minRoyaltyLamports: Joi.number().integer().min(0).optional(),
      commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    logger.info('Processing signature-based royalty distribution:', {
      transactionSignature: value.transactionSignature,
      modelPDA: value.modelPDA
    });

    // 1) PublicKey 변환 및 검증
    const { PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
    let modelPDA: typeof PublicKey.prototype;
    
    try {
      modelPDA = new PublicKey(value.modelPDA);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid modelPDA format' 
      });
    }

    // 2) 트랜잭션 정보 조회 및 검증
    const transactionInfo = await solanaService.getTransactionInfo(value.transactionSignature);
    
    if (!transactionInfo) {
      return res.status(404).json({ success: false, error: 'Transaction not found on blockchain' });
    }

    // 2-1) 트랜잭션 성공 여부 확인
    if (transactionInfo.meta?.err) {
      logger.error('Transaction failed on blockchain:', {
        signature: value.transactionSignature,
        error: transactionInfo.meta.err
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Transaction failed on blockchain',
        details: transactionInfo.meta.err
      });
    }

    // 2-2) 트랜잭션 타임스탬프 확인 (너무 오래된 트랜잭션 방지)
    const MAX_TRANSACTION_AGE_SECONDS = 300; // 5분
    if (transactionInfo.blockTime) {
      const transactionAge = Date.now() / 1000 - transactionInfo.blockTime;
      if (transactionAge > MAX_TRANSACTION_AGE_SECONDS) {
        logger.warn('Transaction is too old:', {
          signature: value.transactionSignature,
          ageSeconds: transactionAge,
          maxAgeSeconds: MAX_TRANSACTION_AGE_SECONDS
        });
        // 경고만 하고 계속 진행 (옵션: return error로 변경 가능)
      }
    }

    // 3) 트랜잭션에서 실제 전송된 금액 추출 및 검증
    const totalLamports = await solanaService.extractTransferredAmountFromTransaction(transactionInfo);
    if (totalLamports === 0) {
      logger.error('No SOL transfer found in transaction:', {
        signature: value.transactionSignature
      });
      return res.status(400).json({ 
        success: false, 
        error: 'No SOL transfer found in transaction. Transaction may not be a subscription payment.' 
      });
    }

    // 3-1) 최소 금액 검증
    const MIN_SUBSCRIPTION_LAMPORTS = 1000000; // 0.001 SOL
    if (totalLamports < MIN_SUBSCRIPTION_LAMPORTS) {
      logger.error('Transaction amount too small:', {
        signature: value.transactionSignature,
        totalLamports,
        minRequired: MIN_SUBSCRIPTION_LAMPORTS
      });
      return res.status(400).json({ 
        success: false, 
        error: `Transaction amount too small: ${totalLamports} lamports (minimum: ${MIN_SUBSCRIPTION_LAMPORTS})` 
      });
    }

    logger.info('Transaction validated and amount extracted:', {
      signature: value.transactionSignature,
      totalLamports,
      totalSOL: totalLamports / LAMPORTS_PER_SOL,
      blockTime: transactionInfo.blockTime ? new Date(transactionInfo.blockTime * 1000).toISOString() : 'unknown'
    });
    
    logger.info('Model PDA received from external backend - proceeding with royalty distribution:', {
      modelPDA: modelPDA.toString()
    });

    // 4) 계보 추적
    const lineageTrace = await solanaService.traceLineage(modelPDA, 32);
    if (!lineageTrace.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid lineage detected',
        data: { violations: lineageTrace.violations }
      });
    }

    // 5) 로열티 분배 계산
    const platformFeeBps = value.platformFeeBps ?? parseInt(process.env.PLATFORM_FEE_BPS || '500');
    const minRoyaltyLamports = value.minRoyaltyLamports ?? parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000');
    
    const distribution = solanaService.calculateLineageRoyaltyDistribution(
      totalLamports,
      lineageTrace,
      platformFeeBps,
      minRoyaltyLamports
    );

    // 6) 트레저리에서 분배 실행
    const developerWallet = lineageTrace.lineage[0]?.developerWallet;
    if (!developerWallet) {
      return res.status(400).json({ success: false, error: 'No developer wallet found in lineage' });
    }

    const { signature: distributionSignature, distribution: actualDistribution } = await solanaService.distributeFromTreasury(
      totalLamports,
      modelPDA,
      developerWallet,
      { platformFeeBps, minRoyaltyLamports, commitment: value.commitment }
    );

    return res.json({
      success: true,
      message: 'Signature-based royalty distribution completed successfully',
      data: {
        originalTransaction: {
          signature: value.transactionSignature,
          modelPDA: modelPDA.toString(),
          totalLamports: totalLamports,
          totalSOL: totalLamports / LAMPORTS_PER_SOL
        },
        lineageTrace: {
          totalDepth: lineageTrace.totalDepth,
          isValid: lineageTrace.isValid,
          lineage: lineageTrace.lineage.map(l => ({
            modelPDA: l.modelPDA.toString(),
            modelName: l.modelName,
            developerWallet: l.developerWallet.toString(),
            // royaltyBps removed for new smart contract
            depth: l.depth,
            parentPDA: l.parentPDA?.toString()
          }))
        },
        distribution: actualDistribution,
        distributionTransaction: {
          signature: distributionSignature
        }
      }
    });
  } catch (error) {
    logger.error('Failed to process signature-based royalty distribution:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

export default router;
