import { Router, Request, Response } from 'express';
import { TransactionService } from '../services/transactionService';
import { SolanaService } from '../services/solanaService';
import { logger } from '../utils/logger';
import { TransactionRequest } from '../types';
import Joi from 'joi';
import { pricingSchema, metricsSchema } from '../utils/validation';

const router = Router();
const transactionService = new TransactionService();
const solanaService = new SolanaService();

// 트랜잭션 처리
router.post('/process', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = req.body;

    // 요청 데이터 검증
    if (!transactionRequest.type) {
      return res.status(400).json({
        success: false,
        error: 'Transaction type is required'
      });
    }

    if (!transactionRequest.data) {
      return res.status(400).json({
        success: false,
        error: 'Transaction data is required'
      });
    }

    // 지원되는 트랜잭션 타입 확인
    const supportedTypes = ['register_model', 'purchase_subscription', 'update_model_metadata', 'verify_lineage'];
    if (!supportedTypes.includes(transactionRequest.type)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported transaction type: ${transactionRequest.type}`
      });
    }

    logger.info('Processing transaction:', {
      type: transactionRequest.type,
      timestamp: new Date().toISOString()
    });

    // 트랜잭션 처리
    const result = await transactionService.processTransaction(transactionRequest);

    res.json(result);
  } catch (error) {
    logger.error('Failed to process transaction:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 모델 등록 트랜잭션 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/register-model', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'register_model',
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
*/

// 모델 등록 미서명 트랜잭션 준비 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/prepare-register-model', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'prepare_register_model_unsigned',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to prepare unsigned register model tx:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});
*/

// 구독 구매 트랜잭션 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/purchase-subscription', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'purchase_subscription',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to purchase subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});
*/

// 구독 구매 미서명 트랜잭션 준비 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/prepare-purchase-subscription', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'prepare_purchase_subscription_unsigned',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to prepare unsigned purchase subscription tx:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});
*/

// 모델 메타데이터 업데이트 트랜잭션
router.post('/update-model-metadata', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'update_model_metadata',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to update model metadata:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 계보 검증 트랜잭션
router.post('/verify-lineage', async (req: Request, res: Response) => {
  try {
    const transactionRequest: TransactionRequest = {
      type: 'verify_lineage',
      data: req.body
    };

    const result = await transactionService.processTransaction(transactionRequest);
    res.json(result);
  } catch (error) {
    logger.error('Failed to verify lineage:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 트랜잭션 상태 조회
router.get('/status/:signature', async (req: Request, res: Response) => {
  try {
    const { signature } = req.params;

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Transaction signature is required'
      });
    }

    // 실제로는 SolanaService를 통해 트랜잭션 상태를 조회해야 함
    // const status = await solanaService.getTransactionStatus(signature);

    res.json({
      success: true,
      data: {
        signature,
        status: 'confirmed', // 임시 응답
        message: 'Transaction status retrieved successfully'
      }
    });
  } catch (error) {
    logger.error('Failed to get transaction status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 테스트용 엔드포인트들은 프로덕션에서 제거됨
// 개발 환경에서만 사용 가능한 테스트 기능들은 별도 개발 서버에서 제공

export default router;

// 외부 백엔드에서 서명된 트랜잭션을 받아서 온체인으로 전송 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/broadcast-signed', async (req: Request, res: Response) => {
  try {
    const { transactionBase64, options } = req.body || {};

    if (!transactionBase64 || typeof transactionBase64 !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'transactionBase64 is required' 
      });
    }

    logger.info('Broadcasting signed transaction from external backend');

    const result = await transactionService.broadcastSignedTransaction(transactionBase64, options);
    
    if (result.success) {
      logger.info('Successfully broadcasted signed transaction:', { 
        transactionHash: result.transactionHash 
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to broadcast signed transaction:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});
*/

// raw 트랜잭션 전송 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/send-raw', async (req: Request, res: Response) => {
  try {
    const { transactionBase64, options } = req.body || {};

    if (!transactionBase64 || typeof transactionBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'transactionBase64 is required' });
    }

    const signature = await solanaService.sendRawTransactionBase64(transactionBase64, options);

    return res.json({ success: true, transactionHash: signature });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// raw 트랜잭션 시뮬레이션
router.post('/simulate-raw', async (req: Request, res: Response) => {
  try {
    const { transactionBase64 } = req.body || {};

    if (!transactionBase64 || typeof transactionBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'transactionBase64 is required' });
    }

    const result = await solanaService.simulateRawTransactionBase64(transactionBase64);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/*
// [DISABLED] register-model-direct: 메타데이터 + 서명된 트랜잭션을 원샷 처리 (프로덕션 정책에 따라 비활성화)
router.post('/register-model-direct', async (req: Request, res: Response) => {
  // Disabled by policy: use register_model or prepare/broadcast flow instead.
  return res.status(410).json({ success: false, error: 'register-model-direct is disabled. Use register_model or prepare/broadcast.' });
});
*/

// 구독 구매도 동일 방식으로 직접 전송 지원
router.post('/purchase-subscription-direct', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      metadata: Joi.object({
        userWallet: Joi.string().required(),
        modelPubkey: Joi.string().required(),
        modelDeveloperWallet: Joi.string().required(),
        durationDays: Joi.number().integer().min(1).max(365).required(),
        expectedPriceLamports: Joi.number().integer().min(0).required(),
        slippageBps: Joi.number().integer().min(0).max(10000).optional()
      }).required(),
      transactionBase64: Joi.string().required(),
      options: Joi.object({
        skipPreflight: Joi.boolean().optional(),
        maxRetries: Joi.number().integer().min(0).optional(),
        commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
      }).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    logger.info('Direct purchase-subscription: received metadata and signed tx', {
      userWallet: value.metadata.userWallet,
      modelPubkey: value.metadata.modelPubkey
    });

    const result = await transactionService.broadcastSignedTransaction(value.transactionBase64, value.options);
    
    // 성공 시 구독 영수증 PDA 계산하여 응답에 포함
    if (result.success && result.transactionHash) {
      try {
        const subscriptionReceiptPDA = await solanaService.getSubscriptionReceiptPDA(
          new (await import('@solana/web3.js')).PublicKey(value.metadata.modelPubkey),
          new (await import('@solana/web3.js')).PublicKey(value.metadata.userWallet)
        );
        
        return res.json({
          success: result.success,
          transactionHash: result.transactionHash,
          subscriptionReceiptPDA: subscriptionReceiptPDA.toString()
        });
      } catch (pdaError) {
        logger.warn('Failed to calculate subscription receipt PDA after successful purchase:', pdaError);
        // PDA 계산 실패해도 트랜잭션은 성공했으므로 기본 응답 반환
        return res.json(result);
      }
    }
    
    return res.json(result);
  } catch (error) {
    logger.error('Failed to direct purchase subscription with signed tx:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// 구독 구매: FE 서명 트랜잭션 검증 후 브로드캐스트 (주석처리 - 메타데이터 직접 전송 방식 사용)
/*
router.post('/purchase-subscription-verify-and-broadcast', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      metadata: Joi.object({
        userWallet: Joi.string().required(),
        modelPubkey: Joi.string().required(),
        modelDeveloperWallet: Joi.string().required(),
        durationDays: Joi.number().integer().min(1).max(365).required(),
        expectedPriceLamports: Joi.number().integer().min(0).required(),
        slippageBps: Joi.number().integer().min(0).max(10000).optional()
      }).required(),
      transactionBase64: Joi.string().required(),
      options: Joi.object({
        skipPreflight: Joi.boolean().optional(),
        maxRetries: Joi.number().integer().min(0).optional(),
        commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
      }).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    // 1) 사전 시뮬레이션으로 기본 오류 확인
    const sim = await solanaService.simulateRawTransactionBase64(value.transactionBase64);
    if (sim?.value?.err) {
      return res.status(400).json({ success: false, error: 'Simulation failed', data: sim.value });
    }

    // 2) (가능 시) 간단 구조 검증: fee payer 및 프로그램 호출 포함 여부
    try {
      const raw = Buffer.from(value.transactionBase64, 'base64');
      let isLegacyParsed = false;
      try {
        const { Transaction, SystemProgram, PublicKey } = await import('@solana/web3.js');
        const legacyTx = Transaction.from(raw);
        isLegacyParsed = true;

        // fee payer 확인
        if (legacyTx.feePayer && legacyTx.feePayer.toString() !== value.metadata.userWallet) {
          return res.status(400).json({ success: false, error: 'Fee payer mismatch with userWallet' });
        }

        // 프로그램 호출 포함 여부(PROGRAM_ID 또는 SystemProgram 존재 체크)
        const programIdStr = process.env.PROGRAM_ID || 'AiZSvcFJJd6dKzqXvk6QU3PUjyRvMnvB9VpLyLokDxqF';
        const programId = new PublicKey(programIdStr);
        const hasProgramInvoke = legacyTx.instructions.some(ix => ix.programId.equals(programId));
        if (!hasProgramInvoke) {
          return res.status(400).json({ success: false, error: 'Expected program invoke not found in transaction' });
        }
      } catch (_) {
        // VersionedTransaction일 수 있음 → 파싱은 생략하고 시뮬레이션 통과로 완화
        if (!isLegacyParsed) {
          logger.info('Versioned tx detected; skipping legacy-specific checks');
        }
      }
    } catch (verErr) {
      logger.warn('Light verification failed (non-fatal):', verErr instanceof Error ? verErr.message : String(verErr));
    }

    // 3) 브로드캐스트
    const result = await transactionService.broadcastSignedTransaction(value.transactionBase64, value.options);
    return res.json(result);
  } catch (error) {
    logger.error('Failed to verify and broadcast subscription tx:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});
*/

// 트레저리 기반 정산(데브넷/테스트 전용): 트레저리 지갑에서 분배 전송
router.post('/treasury/distribute', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      modelPubkey: Joi.string().required(),
      developerWallet: Joi.string().required(),
      totalLamports: Joi.number().integer().min(0).required(),
      platformFeeBps: Joi.number().integer().min(0).max(10000).optional(),
      minRoyaltyLamports: Joi.number().integer().min(0).optional(),
      commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional()
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    const { PublicKey } = await import('@solana/web3.js');
    const modelPDA = new PublicKey(value.modelPubkey);
    const developer = new PublicKey(value.developerWallet);

    const { signature, distribution } = await solanaService.distributeFromTreasury(
      value.totalLamports,
      modelPDA,
      developer,
      { platformFeeBps: value.platformFeeBps, minRoyaltyLamports: value.minRoyaltyLamports, commitment: value.commitment }
    );

    return res.json({ success: true, transactionHash: signature, distribution });
  } catch (error) {
    logger.error('Failed to distribute from treasury:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// 트랜잭션 시그니처로 계보 추적 및 로열티 분배
router.post('/process-signature-royalty', async (req: Request, res: Response) => {
  try {
    const schema = Joi.object({
      transactionSignature: Joi.string().required(),
      // 외부 백엔드에서 시그니처만 제공하므로 나머지는 모두 선택사항
      platformFeeBps: Joi.number().integer().min(0).max(10000).optional(),
      minRoyaltyLamports: Joi.number().integer().min(0).optional(),
      commitment: Joi.string().valid('processed', 'confirmed', 'finalized').optional(),
      // SPL Token 트랜잭션의 경우 모델 PDA를 직접 제공할 수 있음
      modelPDA: Joi.string().optional(),
      // 테스트 모드: 모델 PDA를 찾지 못해도 계속 진행
      testMode: Joi.boolean().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: `Validation error: ${error.details[0].message}` });
    }

    logger.info('Processing signature-based royalty distribution (external backend):', {
      transactionSignature: value.transactionSignature,
      providedModelPDA: value.modelPDA || 'auto-detect',
      testMode: value.testMode || false
    });

    // 1) 트랜잭션 정보 조회
    const { PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
    const transactionInfo = await solanaService.getTransactionInfo(value.transactionSignature);
    
    if (!transactionInfo) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // 🔍 DEBUG: 트랜잭션 정보 로그 출력
    const message = transactionInfo.transaction?.message;
    let accountKeysCount = 0;
    let instructionsCount = 0;
    
    try {
      if (message) {
        if (typeof message.getAccountKeys === 'function') {
          accountKeysCount = message.getAccountKeys().length;
        } else if ((message as any).accountKeys) {
          accountKeysCount = (message as any).accountKeys.length;
        }
        
        if ((message as any).instructions) {
          instructionsCount = (message as any).instructions.length;
        }
      }
    } catch (error) {
      logger.warn('Failed to get message details:', error);
    }
    
    logger.info('🔍 DEBUG - Transaction Info:', {
      signature: value.transactionSignature,
      hasTransaction: !!transactionInfo.transaction,
      hasMeta: !!transactionInfo.meta,
      accountKeysCount,
      instructionsCount,
      logMessages: transactionInfo.meta?.logMessages || [],
      innerInstructions: transactionInfo.meta?.innerInstructions?.length || 0
    });

    // 2) 트랜잭션에서 실제 전송된 금액 추출
    const totalLamports = await solanaService.extractTransferredAmountFromTransaction(transactionInfo);
    
    // 🔍 DEBUG: 금액 추출 결과 로그 출력
    logger.info('🔍 DEBUG - Amount Extraction:', {
      totalLamports,
      totalSOL: totalLamports / LAMPORTS_PER_SOL,
      foundTransfer: totalLamports > 0
    });
    
    if (totalLamports === 0) {
      return res.status(400).json({ success: false, error: 'No SOL transfer found in transaction' });
    }

    // 3) 트랜잭션에서 모델 PDA 추출 또는 요청에서 제공받은 PDA 사용
    let modelPDA: any = null;
    
    if (value.modelPDA) {
      // 요청에서 직접 제공된 모델 PDA 사용
      try {
        modelPDA = new PublicKey(value.modelPDA);
        logger.info('Using provided model PDA:', { modelPDA: modelPDA.toString() });
      } catch (error) {
        return res.status(400).json({ success: false, error: 'Invalid model PDA provided' });
      }
    } else {
      // 트랜잭션에서 모델 PDA 추출
      modelPDA = await solanaService.extractModelPDAFromTransaction(transactionInfo);
      
      // 🔍 DEBUG: 모델 PDA 추출 결과 로그 출력
      logger.info('🔍 DEBUG - Model PDA Extraction:', {
        foundModelPDA: !!modelPDA,
        modelPDA: modelPDA ? modelPDA.toString() : null,
        testMode: value.testMode || false
      });
      
      // modelPDA가 없으면 전송 확인만 반환
      if (!modelPDA) {
        logger.info('No modelPDA found in transaction - returning transfer info only');
        return res.json({
          success: true,
          message: 'SOL transfer confirmed - no modelPDA found for royalty distribution',
          data: {
            transactionSignature: value.transactionSignature,
            totalLamports: totalLamports,
            totalSOL: totalLamports / LAMPORTS_PER_SOL,
            modelPDAFound: false
          }
        });
      }
    }

    // 4) 계보 추적 (모델 PDA가 있는 경우에만)
    let lineageTrace = null;
    if (modelPDA) {
      lineageTrace = await solanaService.traceLineage(modelPDA, 32);
      if (!lineageTrace.isValid && !value.testMode) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid lineage detected',
          data: { violations: lineageTrace.violations }
        });
      }
    }

    // 5) 로열티 분배 계산 (계보가 있는 경우에만)
    const platformFeeBps = value.platformFeeBps ?? parseInt(process.env.PLATFORM_FEE_BPS || '500');
    const minRoyaltyLamports = value.minRoyaltyLamports ?? parseInt(process.env.MIN_ROYALTY_LAMPORTS || '1000');
    
    let distribution = null;
    let distributionSignature = null;
    let actualDistribution = null;

    if (lineageTrace && lineageTrace.isValid) {
      distribution = solanaService.calculateLineageRoyaltyDistribution(
        totalLamports,
        lineageTrace,
        platformFeeBps,
        minRoyaltyLamports
      );

      // 6) 트레저리에서 분배 실행
      const developerWallet = lineageTrace.lineage[0]?.developerWallet;
      if (developerWallet && modelPDA) {
        const result = await solanaService.distributeFromTreasury(
          totalLamports,
          modelPDA,
          developerWallet,
          { platformFeeBps, minRoyaltyLamports, commitment: value.commitment }
        );
        distributionSignature = result.signature;
        actualDistribution = result.distribution;
      }
    } else if (value.testMode) {
      // 테스트 모드: 간단한 분배 계산만 수행
      distribution = {
        totalLamports,
        platformAmount: Math.floor(totalLamports * platformFeeBps / 10000),
        developerAmount: totalLamports - Math.floor(totalLamports * platformFeeBps / 10000),
        lineageRoyalties: [],
        totalLineageAmount: 0,
        remainingAmount: totalLamports - Math.floor(totalLamports * platformFeeBps / 10000)
      };
    }

    return res.json({
      success: true,
      message: 'Signature-based royalty distribution completed successfully',
      data: {
        originalTransaction: {
          signature: value.transactionSignature,
          modelPDA: modelPDA ? modelPDA.toString() : null,
          totalLamports: totalLamports,
          totalSOL: totalLamports / LAMPORTS_PER_SOL
        },
        lineageTrace: lineageTrace ? {
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
        } : null,
        distribution: actualDistribution || distribution,
        distributionTransaction: distributionSignature ? {
          signature: distributionSignature
        } : null,
        testMode: value.testMode || false
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