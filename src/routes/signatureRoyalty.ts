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
      platformFeeBps: Joi.number().integer().min(0).max(10000).optional(),
      minRoyaltyLamports: Joi.number().integer().min(0).optional(),
      commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    logger.info('Processing signature-based royalty distribution:', {
      transactionSignature: value.transactionSignature
    });

    // 1) 트랜잭션 정보 조회
    const { PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
    const transactionInfo = await solanaService.getTransactionInfo(value.transactionSignature);
    
    if (!transactionInfo) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // 2) 트랜잭션에서 실제 전송된 금액 추출
    const totalLamports = await solanaService.extractTransferredAmountFromTransaction(transactionInfo);
    if (totalLamports === 0) {
      return res.status(400).json({ success: false, error: 'No SOL transfer found in transaction' });
    }

    logger.info('Extracted transaction amount:', {
      totalLamports,
      totalSOL: totalLamports / LAMPORTS_PER_SOL
    });

    // 3) 트랜잭션에서 모델 PDA 추출 (첫 번째 프로그램 호출에서)
    const modelPDA = await solanaService.extractModelPDAFromTransaction(transactionInfo);
    if (!modelPDA) {
      return res.status(400).json({ success: false, error: 'Could not extract model PDA from transaction' });
    }

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
            royaltyBps: l.royaltyBps,
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
